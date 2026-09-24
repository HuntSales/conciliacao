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
local — pedido explícito do usuário.

**Multi-empresa desde 2026-09-18** (mudança grande, ver `memoria.md`): cada empresa
tem suas próprias integrações/conta/histórico, isolados por RLS. Um super_admin
cadastra empresas em `/admin` e o convite de acesso sai por e-mail (Resend).

## Arquitetura

### Multi-empresa (`empresas`, `profiles`, `user_roles`, `has_role()`)

Todo dado de negócio (`integracoes_mcp`, `credenciais_fallback`, `conta_granatum`,
`tool_mapping`, `pares_conciliacao`, `log_alteracoes_granatum`, `integracoes_ia`)
tem uma coluna `empresa_id not null`, com unique constraints e RLS escopados por
empresa (`current_empresa_id()`, função `SECURITY DEFINER` que lê `profiles`,
mesmo padrão do Multi MCPs). **Toda função em `asaas.server.ts`/`granatum.server.ts`/
`openai.server.ts` recebe `empresaId` como primeiro argumento** — essas funções
usam `supabaseAdmin` (bypassa RLS), então o filtro `.eq("empresa_id", ...)` é
manual em cada query, não automático. Ao adicionar uma função nova nesses
arquivos, sempre receber e propagar `empresaId` — esquecer o filtro vaza dado de
uma empresa para o cliente de outra.

Duas middlewares novas em `auth-middleware.ts`, cada uma já encadeando
`requireSupabaseAuth` internamente (não precisa listar as duas):

- `requireEmpresa` — resolve `context.empresaId` a partir de `profiles`; toda
  server function de negócio usa só essa.
- `requireSuperAdmin` — checa `has_role(..., 'super_admin')` via RPC; usada só
  em `empresas.functions.ts` (rotas `/admin`).

Um usuário pode ter as duas naturezas ao mesmo tempo — ex.: o William é
`empresa_admin` da Hunt Sales **e** `super_admin` da plataforma. O nav mostra a
aba "Admin" condicionalmente (`useSuperAdmin()` hook + `montarNav()` em
`components/corp/nav-padrao.ts`).

**Bootstrap do primeiro admin**: `garantirPrimeiroSuperAdmin` (chamada em
`auth.tsx` logo após login) promove o usuário atual a `super_admin` só se ainda
não existir nenhum na plataforma — evita problema de ovo-e-galinha sem precisar
mexer direto no banco.

**Convite de empresa** (`criarEmpresa` em `empresas.functions.ts`): cria a linha
em `empresas`, então `enviarLinkAcesso` (`acesso-email.server.ts`) gera um link
via `supabaseAdmin.auth.admin.generateLink({type:"invite", options:{data:{...,
empresa_id}}})` e manda pelo Resend (`email.server.ts`). O `handle_new_user`
trigger lê esses metadados no INSERT em `auth.users` (que já acontece dentro do
próprio `generateLink`, antes mesmo do usuário clicar) e popula `profiles`/
`user_roles` automaticamente. O link aponta pra `/redefinir-senha` (rota nova,
`verifyOtp` + `updateUser({password})`, mesmo componente serve invite e recovery).

### Banco (Supabase)

Migrations em `supabase/migrations/`. Tabelas de negócio: `integracoes_mcp`
(config MCP por provedor, agora `unique(empresa_id, provedor)`),
`credenciais_fallback` (token REST direto + `ambiente`/`url_base`),
`conta_granatum` (conta que representa o Asaas — `unique(empresa_id)`, uma linha
por empresa), `tool_mapping` (função → nome da tool detectada), `pares_conciliacao`
(`unique(empresa_id, asaas_id)` e `unique(empresa_id, granatum_id)` — os ids do
Asaas/Granatum só são únicos dentro da conta de cada empresa, não globalmente),
`log_alteracoes_granatum` (antes/depois de cada edição).

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
dos dois lados. Lançamento baixado entra pela `data_pagamento`; em aberto
(a pagar/receber) entra pela `data_vencimento` (`pago: false`, o card mostra
"vencimento, em aberto") — é o mesmo critério que o filtro de período da API
já usa no regime caixa (padrão), confirmado com dados reais em 2026-09-24.

**Conciliar dá baixa no Granatum**: todo par gravado com um lançamento em
aberto (`pago: false`) chama `baixarNoGranatum` (`editar_lancamento` com
`data_pagamento` = data do extrato do Asaas, registrado em
`log_alteracoes_granatum`). Vale pros três caminhos: par automático em
`buscarLancamentos` (se a baixa falhar, o par não é gravado e volta como
sugestão), "Confirmar" sugestão e `FormConciliarManual` (os dois mandam
`baixarEm` pro `confirmarPar`, que dá baixa antes de gravar o par — se falhar,
nada é gravado).

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

Padrão `createServerFn` + `.middleware([requireEmpresa])` do TanStack Start (ou
`.middleware([requireSuperAdmin])` nas rotas de `/admin`) — ver seção
"Multi-empresa" acima pra como isso propaga `empresaId`.
`conciliacao.functions.ts` é o maior: busca extrato+lançamentos, cruza com pares já
gravados, roda a engine só no que sobra, persiste automáticos na hora, devolve
sugestões sem persistir (ficam só na resposta — "rejeitar" no frontend é só estado
local, não precisa de chamada ao servidor).

### Conciliação manual (`FormConciliarManual.tsx`, `CardAsaas`/`CardGranatum` `modoVinculo`)

Não é mais "marcar um checkbox de cada lado e achar um botão na barra de
filtros" (isso não era descobrível — ver `memoria.md`). Cada card sem par tem
um botão **"Ligar"** direto nele. Clicar entra em "modo de vínculo"
(`origemVinculo` em `conciliacao.tsx`, guardando `{ lado, item }`): aparece uma
faixa no topo da lista dizendo o que fazer, e todo card sem par **do outro
lado** vira alvo (`modoVinculo="alvo"`, borda dourada, botão vira "Ligar
aqui"). Clicar num alvo abre `FormConciliarManual` (dois lados lado a lado,
avisa se data/valor não baterem exatamente, categoria/centro do lançamento do
Granatum pré-preenchidos, com sugestão de IA/histórico se ainda estiver sem
categoria, reaproveitando o cache de sugestões da tela). Um único botão
"Salvar e conciliar" aplica a edição no Granatum (só se algo mudou) e grava o par. `ModoVinculo` (`"nenhum" | "origem" |
"alvo"`) é o tipo compartilhado entre os dois cards — exportado de
`CardAsaas.tsx`. O mesmo padrão de registrar categoria/centro/descrição vale
pra "Confirmar" uma sugestão da engine, pra alimentar o histórico de sugestão
(ver seção de IA abaixo) mesmo quando o usuário só confirma sem editar nada.

### Criação em lote (`criarCadaUmAPartirDoAsaas`, `FormCriarLote.tsx`, `criarLoteAPartirDoAsaas`)

Checkbox em cada card do Asaas sem par (independente do `modoVinculo` — some
enquanto uma ligação está em andamento, pra não confundir os dois modos ao
mesmo tempo) alimenta `selecionadosLote` em `conciliacao.tsx`; o botão
"Selecionar todos os pendentes" marca todos os do filtro atual. Com 1+
selecionado(s), aparece uma faixa fixa no topo com duas opções:

- **"Criar todos"** (ou "Criar N selecionados" se não forem todos):
  `criarCadaUmAPartirDoAsaas`, cada item com a descrição/categoria/centro que
  está no próprio card. Por isso os campos do card do Asaas são controlados
  pela página (`edicoesAsaas` + `camposAsaas()`, que aplica a sugestão no que
  o usuário ainda não mexeu), e não estado local do `CardAsaas`. Recusa antes
  de chamar o servidor se algum selecionado estiver sem categoria. Depois,
  só os que falharam continuam selecionados.
- **"Mesma categoria para todos"**: abre `FormCriarLote` — **uma** categoria e
  **um** centro aplicados a todos (`criarLoteAPartirDoAsaas`), cada item
  mantendo sua descrição/valor/data. Categoria filtrada por tipo comum entre
  os selecionados — se misturar receita e despesa, só mostra categorias
  "mista".

Os dois reaproveitam o mesmo núcleo (`criarUmLancamentoAPartirDoAsaas`) da
criação individual, via `criarVarios`: loop sequencial que nunca aborta no
meio — cada item tem seu próprio sucesso/falha no retorno (`ResultadoLote[]`),
então um item já conciliado por outra pessoa nesse meio tempo não derruba o
resto do lote.

### Campos inline e sugestão de categoria/centro (`sugerirEmLote`, `src/lib/ia/openai.server.ts`)

Não existe mais diálogo "Criar no Granatum": cada card do Asaas sem par já
mostra descrição, categoria e centro de custo editáveis (`CardAsaas`), e o
botão "Criar no Granatum" cria e concilia direto. O `CardGranatum` sem
categoria também vem pré-preenchido. "Confirmar" uma sugestão da engine aplica
no Granatum o que estiver nos campos do card (se mudou) antes de gravar o par.

Logo depois de cada busca, `conciliacao.tsx` chama `sugerirEmLote` **uma vez**
com todos os pendentes (chave `a:<id>` para Asaas sem par, `g:<id>` para
Granatum sem categoria). O resultado fica num cache por item durante a sessão
(`sugestoes` + `sugestoesPedidas`) — uma nova busca só pede o que ainda não
veio, pra não gastar token de novo com o mesmo item. `FormConciliarManual` e
`FormCriarLote` reaproveitam esse cache (o lote pré-preenche só se todos os
selecionados tiverem a mesma sugestão).

`sugerirVarios` (`conciliacao.functions.ts`) resolve na ordem mais barata
primeiro, parando no primeiro histórico com similaridade ≥
`LIMIAR_HISTORICO_FORTE`:

1. Histórico já carregado de uma vez pro lote inteiro: local
   (`pares_conciliacao.categoria_id`/`centro_custo_id`/`descricao`) + últimos
   `DIAS_HISTORICO_GRANATUM` dias da própria conta no Granatum.
2. Busca textual no Granatum (`buscarLancamentosSimilaresGranatum`, parâmetro
   `busca` da tool `listar_lancamentos`), só pros que ainda faltam — pega
   lançamentos mais antigos. Sem tokens, concorrência limitada.
3. IA, só pro que sobrou, numa chamada agrupada (`sugerirCategorizacaoLote`,
   até 20 itens por chamada — a lista de categorias/centros, que é a maior
   parte do prompt, vai uma vez por lote).
4. Sem IA ou sem resposta: histórico mais distante (> `LIMIAR_HISTORICO_FRACO`),
   senão nada.

Descrições repetidas no lote (mesmo tipo + texto normalizado) são resolvidas
uma vez só. A IA usa Chat Completions com `response_format: json_schema`
`strict: true`, e o schema restringe `categoria_id`/`centro_custo_id` a um
`enum` com só os ids **folha** reais — o modelo nunca inventa categoria ou
centro, e o sistema nunca cria categoria/centro novo (só lançamento). Como o
lote pode misturar receita e despesa, a lista enviada junta as duas e o
servidor descarta categoria de tipo incompatível com o item. Falha de
rede/API da OpenAI nunca trava nada — a sugestão é sempre best-effort.

### Saldos (`buscarSaldoAsaas`, `buscarSaldoContaGranatum`)

Oitava função de integração, `saldo` (só relevante pro Asaas — o Granatum já
devolve o saldo de cada conta dentro de `listar_contas`, sem precisar de tool
própria). Tool real do Asaas: `recuperar_saldo_da_conta`, resposta `{ balance:
number }`; fallback REST em `GET /finance/balance`. Importante na ordem de
`PADROES`/`FUNCOES` em `integracoes.functions.ts`: `saldo` precisa ser checado
**antes** de `contas`, porque `recuperar_saldo_da_conta` também termina em
"conta" e seria erroneamente detectado como a tool de listar contas.

`buscarLancamentos` busca os dois saldos em paralelo com o extrato/lançamentos
(nunca falha a busca inteira se o saldo não estiver mapeado — `.catch(() =>
null)`) e calcula `saldoGranatumProjetado = saldoGranatum + soma dos itens do
Asaas ainda sem NENHUM par` (sugestão já é um lançamento real no Granatum, só
não confirmado — já está refletido no saldo atual, não entra nessa soma).

## Deploy

Ver `memoria.md` para infraestrutura (servidor, domínio, repositório, portas).
`Dockerfile`/`deploy.sh` seguem o mesmo padrão do Multi MCPs — **nunca
`docker restart`**, sempre recriar o container (`deploy.sh` já faz isso certo).
