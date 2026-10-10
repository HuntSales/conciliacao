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
automaticamente. Só `src/lib/matching.ts`, `src/lib/extrair-valor.ts` e
`src/lib/parcelas.ts` têm testes (são as lógicas puras, sem I/O, que vale
testar assim) — regra nova de casamento/duplicidade entra em `matching.ts`,
com teste.

**Ambiente local (iCloud)**: a pasta do projeto fica no Desktop sincronizado
pelo iCloud, que tira arquivos do disco (`find node_modules -flags +dataless
| wc -l` chegou a ~25 mil). `tsc`/`vitest`/`eslint` então ficam minutos
"parados" sem usar CPU, baixando arquivo por arquivo — não é travamento do
código; rodar em segundo plano e esperar (ou marcar a pasta como "Manter
baixado"). **Reproduzir com dados reais**: um `*.test.ts` temporário que lê o
`.env` local, faz `await import()` dos módulos `*.server.ts` e chama as
funções direto (ex.: `listarLancamentosGranatum`) — foi assim que se achou o
corte de 100 mil caracteres do MCP. Apagar o arquivo depois; nunca commitar.

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
`tool_mapping`, `pares_conciliacao`, `log_alteracoes_granatum`, `integracoes_ia`,
`lancamentos_ignorados`, `sugestoes_recusadas`)
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

**Limite de 100.000 caracteres por resposta de tool** (servidor do Multi
MCPs): listagem grande chega truncada, e `chamarTool` devolve o texto cru
quando o JSON falha. Listagem paginada tem que usar página pequena o bastante
(lançamentos do Granatum: 50, ~1.050 caracteres cada) e conferir
`Array.isArray` na resposta — nunca tratar resposta inválida como lista vazia.

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

**Baixa no Granatum só por clique do usuário** (pedido explícito): conciliar
um lançamento em aberto (`pago: false`) chama `baixarNoGranatum`
(`editar_lancamento` com `data_pagamento` = data do extrato do Asaas,
registrado em `log_alteracoes_granatum`) — mas só a partir de "Confirmar"
sugestão ou `FormConciliarManual` (os dois mandam `baixarEm` pro
`confirmarPar`, que dá baixa antes de gravar o par; se falhar, nada é
gravado). Criar a partir do Asaas já nasce baixado. A engine nunca grava
sozinha um par com lançamento em aberto: em `buscarLancamentos`, o que seria
automático vira sugestão, pra baixa depender do clique em "Confirmar".

**Dedupe de criação**: todo lançamento criado no Granatum a partir de um item do
Asaas grava `identificador_externo = <asaas_id>` — permite achar duplicata mesmo
fora da tabela local `pares_conciliacao`. `criarUmLancamentoAPartirDoAsaas`
confere isso no Granatum antes de criar (par desfeito não libera recriar). Na
busca, `detectarJaNoGranatum` (`matching.ts`, puro, testado) marca em
`jaNoGranatum` o item do Asaas sem par que já parece existir lá — mesmo
identificador externo, ou mesmo valor num lançamento sem par em qualquer data do
período (1:1, data mais próxima). Esse item fica sem checkbox, fora do "Criar
todos"/lote e do saldo projetado, e o card mostra "Ligar a ele"; por valor
(pode ser coincidência) ainda dá pra "Criar mesmo assim" com segundo clique,
por identificador não.

**Fatura em aberto fora do período** (`abertosForaDoPeriodo`, 2026-10-05):
o período filtra lançamento em aberto pelo vencimento, então uma fatura que
venceu no domingo e foi paga na segunda some do filtro "hoje" — e o item do
Asaas parecia sem nada no Granatum. Depois da engine e do `jaNoGranatum`, se
ainda sobrar item do Asaas sem nada, `buscarLancamentos` faz uma segunda
listagem (`DIAS_ANTES_FORA_DO_PERIODO` = 10 antes, `DIAS_DEPOIS_...` = 5
depois), só **em aberto**, fora do período, sem par gravado e não ignorado,
e casa pela mesma `detectarJaNoGranatum` (identificador ou valor **exato**,
1:1, vencimento mais próximo — decisões do usuário). O que casar entra em
`granatum` com `foraDoPeriodo: true`, sempre como **sugestão** (Confirmar dá
a baixa com a data do Asaas), com chip "Fora do período" e aviso em destaque
no `CardGranatum`; fica fora de conciliados/pendentes do Granatum no resumo.
Rejeitada, some da tela. Falha nessa segunda busca nunca derruba a busca.

### Engine de matching (`src/lib/matching.ts`)

Função pura, testada isoladamente. Valor exato (comparado em centavos, não float
cru) + data igual = automático; tolerância de dias configurável; ambiguidade
(mais de um candidato no mesmo valor/janela) desempatada por similaridade de
descrição (Jaccard sobre tokens) — só vira "sugestão" (não liga sozinho) quando o
desempate não é claro. 1:1 sempre garantido, inclusive entre sugestões.

Também em `matching.ts`: `detectarJaNoGranatum` (identificador externo, senão
valor exato em qualquer data, 1:1, data mais próxima) — usada pra marcar
`jaNoGranatum` e pra achar fatura em aberto fora do período (ver "Dedupe de
criação"). `conciliar` e `detectarJaNoGranatum` recebem `proibidos`
(`chavePar(asaasId, granatumId)`), as ligações que o usuário interrompeu.

### Server functions (`src/lib/*.functions.ts`)

Padrão `createServerFn` + `.middleware([requireEmpresa])` do TanStack Start (ou
`.middleware([requireSuperAdmin])` nas rotas de `/admin`) — ver seção
"Multi-empresa" acima pra como isso propaga `empresaId`.
`conciliacao.functions.ts` é o maior: busca extrato+lançamentos, cruza com pares já
gravados, roda a engine só no que sobra, persiste automáticos na hora, devolve
sugestões sem persistir (ficam só na resposta). Interromper uma sugestão é
persistido — ver "Conciliar todas as sugestões" abaixo.

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

### Conciliar todas as sugestões e interromper ligação (`sugestoes_recusadas`)

Botão "Conciliar todas as sugestões (N)" na barra de filtros concilia em lote
as sugestões visíveis (`conciliarTodas` em `conciliacao.tsx`, um por um, sem
abortar no meio), cada uma exatamente como o "Confirmar" do card
(`conciliarSugestao`: aplica descrição/categoria/centro do card se mudou, dá
baixa se em aberto, grava o par). Por isso os campos do `CardGranatum` também
são controlados pela página (`edicoesGranatum` + `camposGranatum()`, que
pré-preenche com a sugestão quando o lançamento está sem categoria), igual ao
`CardAsaas`.

A linha tracejada entre os cards de uma sugestão é clicável (no celular, o
botão "Interromper" do card): **interrompe** a ligação — linha vermelha com
"X", o par sai do lote e o botão vira "Conciliar selecionadas (N)". Clicar de
novo restaura. A interrupção é **permanente** (pedido explícito): grava na
hora em `sugestoes_recusadas` (`unique(empresa_id, asaas_id, granatum_id)`,
`recusarSugestao`/`restaurarSugestao`), e `buscarLancamentos` passa esses
pares como `proibidos` pra `conciliar` e `detectarJaNoGranatum` — aquele par
nunca mais é proposto (nem como "já existe no Granatum" ou fora do período),
mas cada lado continua livre pra outro par. Na tela, o par interrompido fica
lado a lado (`interrompidas`, por id do Asaas) até a próxima busca. Substitui
o antigo "Rejeitar", que era só estado local.

### Ignorar lançamento (`lancamentos_ignorados`, `DialogIgnorar.tsx`)

Todo card sem par (Asaas ou Granatum) tem "Ignorar", que abre
`DialogIgnorar` com **confirmação dupla** (pedido explícito: "Continuar" →
"Sim, ignorar lançamento"). Em lote, só do lado do Asaas: a faixa de seleção
(`selecionadosLote`) mostra "Ignorar todos" — mesmo diálogo, listando todos.
Os cards do Granatum **não têm checkbox** (pedido explícito, 2026-10-05: o
Granatum é só pra mostrar; marcá-lo junto com "Criar" fazia parecer que o
mesmo lançamento seria criado de novo) — lá o Ignorar é só individual.
"Selecionar todos os pendentes" marca só os itens do Asaas que ainda podem
ser criados (sem par, não ignorados, sem `jaNoGranatum`). `ignorarLancamentos` (sempre recebe lista) grava em
`lancamentos_ignorados` (`unique(empresa_id, provedor, lancamento_id)`, com
cópia de data/valor/descrição só pra exibição) e recusa se o item já tiver
par (por item, sem derrubar o resto — `ResultadoIgnorar[]`). Em
`buscarLancamentos`, item ignorado (`ignorado: true`) fica fora da
engine de matching (nunca vira sugestão), dos pendentes do resumo, do saldo
projetado e do pedido de sugestão de categoria; par gravado tem precedência
sobre ignorado. Na tela só aparece no filtro "Ignorados", com "Voltar a
considerar" (`restaurarLancamento`, apaga a linha). Nada é alterado no
Asaas/Granatum.

### Criação em lote (`criarCadaUmAPartirDoAsaas`, `FormCriarLote.tsx`, `criarLoteAPartirDoAsaas`)

Checkbox em cada card do Asaas sem par (independente do `modoVinculo` — some
enquanto uma ligação está em andamento, pra não confundir os dois modos ao
mesmo tempo) alimenta `selecionadosLote` em `conciliacao.tsx`; o botão
"Selecionar todos os pendentes" marca os do filtro atual que ainda podem ser
criados (item com `jaNoGranatum` nunca tem checkbox nem entra no lote). Com 1+
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
   `DIAS_HISTORICO_GRANATUM` (180) dias da própria conta no Granatum. Até
   2026-10-05 essa leitura voltava sempre vazia (resposta do MCP cortada em
   100 mil caracteres — ver "Cliente MCP"); corrigida, custa ~20 s (~2.200
   lançamentos, 45 páginas) e roda depois da busca, sem travar a tela. 60
   dias foi cogitado pra acelerar; o usuário preferiu manter 180 por ora.
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

### Aba Lançamentos (`/lancamentos`, `lancamentos.functions.ts`, `FormNovoLancamento.tsx`)

Recurso separado da conciliação (pedido explícito: não mexer no fluxo do
Asaas), pra lançar direto no Granatum em **qualquer** conta — inclusive bancos
sem extrato integrado. Não grava `pares_conciliacao`; só registra a criação
em `log_alteracoes_granatum` (`antes: null`, `depois.criadoEm: "lancamentos"`).

- Tela inicial `/inicio` (destino de `/` e do login) com dois botões grandes,
  Conciliação e Lançamentos. No celular o nav só mostra esses dois
  (`soDesktop` nos outros em `montarNav`); Integrações/Histórico/Admin ficam
  como links na tela inicial.
- A página lista as contas do Granatum (`listar_contas`, com saldo). Tocar
  numa conta ou em "Novo lançamento" abre o formulário; a última conta usada
  fica no `localStorage` do aparelho.
- Entrada por voz: Web Speech API do navegador (`use-voz.ts`, pt-BR, sem
  custo). A frase ("gasolina no posto Shell 150 reais") passa por
  `interpretarFrase` (`extrair-valor.ts`, puro, sem IA), que separa descrição,
  valor e, se a frase deixar claro ("comprei"/"recebi"), o tipo. Campo que o
  usuário editou à mão não é mais sobrescrito pela frase/sugestão.
- Categoria/centro: a mesma `sugerirVarios` da conciliação (exportada, com
  `contaIdHistorico` opcional pra usar a conta escolhida como histórico do
  Granatum em vez da conta do Asaas). Pedida com debounce e cache por
  conta+tipo+descrição.
- Padrão pago/recebido na data escolhida; "Já pago" desligado cria em aberto
  com a data como vencimento (`emAberto` em `criarLancamentoGranatum`:
  `pagamento_automatico: false`, sem `data_pagamento`).
- Dedupe: `identificador_externo = manual:<uuid>` gerado no navegador por
  lançamento; reenvio do mesmo "Salvar" acha o existente e não duplica.
- **Único / Parcelado / Recorrente** (`repeticao` em `criarLancamentoManual`).
  O Granatum não tem campo "parcelado": os dois são uma série
  (`periodicidade` D7/D15/M1/M2/M3/M6/M12 + `total_repeticoes`, ou
  `infinito: true` pra sem fim), com o **mesmo `valor` em cada ocorrência**.
  Comportamento confirmado criando séries de teste (2026-09-29):
  - `data_pagamento` baixa só a 1ª ocorrência; as próximas ficam em aberto.
  - `pagamento_automatico` é copiado pras próximas ("A pagar automático") —
    numa série vai sempre `false`.
  - `data_competencia` informada vai igual em todas; omitida, cada uma usa o
    próprio vencimento; com `infinito`, o Granatum incrementa sozinho.
  - Editar uma ocorrência sem `propagar_alteracao` muda só ela.
  Parcelado: o valor digitado é o **total**; `dividirEmParcelas`
  (`parcelas.ts`, testado) manda o valor da parcela e depois ajusta só a 1ª
  com a sobra dos centavos (falha nesse ajuste vira `aviso`, nunca erro — o
  lançamento já existe). Competência = data da compra em todas (orientação da
  ajuda do Granatum). Recorrente: sem fim por padrão ou N vezes, sem
  competência (cada ocorrência no mês do vencimento). `interpretarFrase`
  reconhece "em 10x"/"10 vezes"/"N parcelas" e "todo mês"/"por semana"/
  "anual" — o número de parcelas sai da frase antes de procurar o valor.
  **Dependência do Multi MCPs**: `infinito` só chega ao Granatum porque foi
  acrescentado aos parâmetros da tool `criar_lancamento` lá (migration
  `20260929220000_granatum_criar_lancamento_infinito.sql`) — o runtime de lá
  descarta argumento que a tool não declara.

## Deploy

Fluxo combinado com o usuário: implementar → `tsc`/`eslint`/`vitest` → mostrar
o resultado e **perguntar** antes de commit, push e deploy (ele aprova
explicitamente a cada vez). Mudança grande ou ambígua: apresentar o plano e
perguntar antes de implementar. Migration nova: `supabase db push` + gen types
(conferir que o `types.ts` não foi zerado e rodar `prettier` nele) antes do
deploy. `gh auth switch -u HuntSales` antes do push.

Ver `memoria.md` para infraestrutura (servidor, domínio, repositório, portas).
`Dockerfile`/`deploy.sh` seguem o mesmo padrão do Multi MCPs — **nunca
`docker restart`**, sempre recriar o container (`deploy.sh` já faz isso certo).
