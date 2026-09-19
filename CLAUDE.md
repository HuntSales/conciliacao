# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Conciliação bancária automática entre o extrato do **Asaas** (conta bancária) e os
lançamentos do **Granatum** (financeiro). O backend age como **cliente MCP** dos
dois servidores (hospedados pela plataforma Multi MCPs), com fallback REST direto
quando uma função não tem tool mapeada. Uma engine de matching liga automaticamente
os lançamentos por valor+data, e a tela permite editar/criar lançamentos no
Granatum sem sair da conciliação.

Todo texto de UI e comentário de código é em português (pt-BR), tom direto/imperativo,
sem emojis — mesma convenção do projeto irmão Multi MCPs. Ver `memoria.md` para
histórico, infraestrutura e decisões; este arquivo é sobre arquitetura de código.

## Commands

```sh
npm install
npm run dev              # vite dev, porta 8080
npm run build            # nitro node-server preset -> .output/
npm run lint
npm run format
npx vitest run                              # suíte completa (engine de matching)
npx tsc -p tsconfig.json --noEmit           # typecheck
node .output/server/index.mjs               # roda o build de produção direto
```

Sem `vitest.config.*` — reaproveita `vite.config.ts`, descobre `*.test.ts`
automaticamente. Só `src/lib/matching.ts` tem testes (é a única lógica pura,
sem I/O, que vale testar assim).

## Stack e origem

Mesma stack e o mesmo padrão do projeto irmão **Multi MCPs**
(`/Users/william/Desktop/Projetos/MCPs`, já que este é o mesmo servidor que hospeda
Asaas/Granatum como MCPs): TanStack Start (React 19 + Vite + Nitro) + Tailwind v4 +
Radix/shadcn + Supabase. Vários arquivos genéricos (design system em `styles.css`,
`components/ui/*`, `components/corp/*`, integração Supabase em
`integrations/supabase/*`) foram copiados quase verbatim de lá — ao alterar
convenções compartilhadas, considere se a mudança também deveria voltar pro
Multi MCPs.

**Diferença deliberada**: banco 100% em nuvem (Supabase Postgres), **sem** SQLite/banco
local — pedido explícito do usuário. Login simples via Supabase Auth (cadastro
público desabilitado, usuário criado via Admin API), não multi-tenant (RLS só exige
`auth.role() = 'authenticated'`, não há `empresa_id`).

## Arquitetura

### Banco (Supabase)

Migrations em `supabase/migrations/`. Tabelas: `integracoes_mcp` (config MCP por
provedor), `credenciais_fallback` (token REST direto + `ambiente`/`url_base`),
`conta_granatum` (conta que representa o Asaas — linha única, sempre a mais
recente por `atualizado_em`), `tool_mapping` (função → nome da tool detectada),
`pares_conciliacao` (`asaas_id`/`granatum_id` únicos — garante 1:1 no banco, não só
na engine), `log_alteracoes_granatum` (antes/depois de cada edição).

Depois de qualquer migration nova: `supabase db push` (projeto já linkado) e
`supabase gen types typescript --project-id hqtfxurhvwyvqpxeoyuj > src/integrations/supabase/types.ts`.

### Cliente MCP (`src/lib/mcp/`)

`mcp-client.server.ts` é um cliente JSON-RPC 2.0 genérico (`tools/list`,
`tools/call`) sobre HTTP ou SSE — não assume nada específico do Asaas/Granatum.
`asaas.server.ts` e `granatum.server.ts` decidem, por função (`extrato`,
`lancamentos`, `categorias`, `centros_custo`, `contas`, `criar_lancamento`,
`editar_lancamento`), se chamam a tool mapeada em `tool_mapping` ou caem no
fallback REST direto (`credenciais_fallback`).

**Detecção automática de tool mapping** (`integracoes.functions.ts`,
`autoDetectarMapeamento`): ao testar conexão, casa cada tool descoberta por regex
contra as 7 funções, só preenche `tool_mapping` para funções ainda sem mapeamento
manual (não sobrescreve edição do usuário). Testado contra os nomes reais dos MCPs
Asaas Hunt/Granatum Hunt — ver `memoria.md` para os nomes reais e a ordem que
importa pra evitar colisão (ex.: `contas` vs `consultar_conta`).

**Convenção de sinal confirmada com dados reais** (não documentação): no Granatum,
`valor` do lançamento já vem assinado — negativo para despesa, positivo para
receita —, exatamente igual ao `value` do extrato Asaas. Isso simplifica a
normalização: basta comparar os valores diretamente, sem inverter sinal em nenhum
dos dois lados. `data_pagamento` (não `data_vencimento`) é o que marca um
lançamento como realizado/baixado — `normalizarLancamento` em `granatum.server.ts`
descarta lançamentos sem `data_pagamento`, porque só o que já foi baixado entra na
conciliação.

**Dedupe de criação**: todo lançamento criado no Granatum a partir de um item do
Asaas grava `identificador_externo = <asaas_id>` — permite achar duplicata mesmo
fora da tabela local `pares_conciliacao`.

### Engine de matching (`src/lib/matching.ts`)

Função pura, testada isoladamente. Valor exato (comparado em centavos, não float
cru) + data igual = automático; tolerância de dias configurável; ambiguidade
(mais de um candidato no mesmo valor/janela) desempatada por similaridade de
descrição (Jaccard sobre tokens) — só vira "sugestão" (não liga sozinho) quando o
desempate não é claro. 1:1 sempre garantido, inclusive entre sugestões.

### Server functions (`src/lib/*.functions.ts`)

Padrão `createServerFn` + `.middleware([requireSupabaseAuth])` do TanStack Start
(mesmo de `src/integrations/supabase/auth-middleware.ts`, copiado do Multi MCPs).
`conciliacao.functions.ts` é o maior: busca extrato+lançamentos, cruza com pares já
gravados, roda a engine só no que sobra, persiste automáticos na hora, devolve
sugestões sem persistir (ficam só na resposta — "rejeitar" no frontend é só estado
local, não precisa de chamada ao servidor).

### Sugestão de categoria/centro por IA (`src/lib/ia/openai.server.ts`)

Ao abrir "Criar no Granatum" para um item do Asaas sem par, `sugerirParaLancamento`
(`conciliacao.functions.ts`) monta um histórico combinado — local
(`pares_conciliacao.categoria_id`/`centro_custo_id`/`descricao`, preenchido a cada
criação/edição feita pelo app) + remoto (busca textual ao vivo no Granatum via
`buscarLancamentosSimilaresGranatum`, parâmetro `busca` da própria tool
`listar_lancamentos`) — e manda pra OpenAI (Chat Completions, `response_format:
json_schema` com `strict: true`) junto com a lista de categorias/centros **folha**
já cadastrados. O schema JSON restringe a resposta a um `enum` só com os ids reais
recebidos — o modelo nunca pode inventar/propor uma categoria ou centro que não
exista, e o sistema nunca cria categoria/centro novo (só lançamento). Sem chave
OpenAI configurada (`integracoes_ia`), cai num fallback só-heurístico: pega o
histórico mais parecido por `similaridadeDescricao` (mesma função de
`matching.ts`) se a similaridade passar de um limiar; sem histórico parecido,
não sugere nada (usuário escolhe manualmente). Falha de rede/API da OpenAI nunca
trava a criação do lançamento — a sugestão é sempre best-effort.

## Deploy

Ver `memoria.md` para infraestrutura (servidor, domínio, repositório, portas).
`Dockerfile`/`deploy.sh` seguem o mesmo padrão do Multi MCPs — **nunca
`docker restart`**, sempre recriar o container (`deploy.sh` já faz isso certo).
