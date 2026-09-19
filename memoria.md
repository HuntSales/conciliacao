# Memória do Projeto — Conciliação Asaas × Granatum

Histórico, infraestrutura e decisões. Complementa o `CLAUDE.md` (arquitetura de
código) e o `README.md` (setup local) — este arquivo é sobre **contexto**: por que
as coisas são como são, onde estão hospedadas, e o que já aconteceu.

## O produto

Sistema de conciliação bancária entre o extrato Asaas (conta bancária) e os
lançamentos financeiros do Granatum, com ligação automática por valor+data,
edição/criação de lançamentos no Granatum sem sair da tela, e histórico de tudo.
Dono/plataforma: William. **Multi-empresa desde 2026-09-18**: William (via
`/admin`) cadastra outras empresas (CNPJ, razão social, e-mail de acesso), cada
uma com suas próprias integrações/conciliações, isoladas por RLS. A Hunt Sales
é a primeira empresa (o ambiente que já existia antes da mudança).

## Histórico

**2026-09-18 — criação do projeto.** Construído do zero seguindo a mesma stack e
convenções do Multi MCPs (projeto irmão que hospeda os MCPs do Asaas e do
Granatum como servidores). Decisão explícita do William: banco 100% em nuvem
(Supabase), nada de banco local — diferente da sugestão inicial (SQLite local),
trocada a pedido dele.

**Teste com dados reais (2026-09-18)**: ao configurar a URL pública do MCP do
Granatum (painel do Multi MCPs), a lista de contas veio diferente da que
aparecia via conexão MCP direta desta mesma sessão do Claude Code — **são duas
empresas/contas Granatum distintas**, apesar de ambas terem uma conta chamada
"ASAAS IP". A conta certa para este projeto é `id 133081` (via MCP público). A
`id 123499` (vista numa exploração inicial via MCP direto da sessão) **não
pertence a este tenant** — não confundir se aparecer em algum log antigo.

Resultado do teste real (período 2026-09-01 a 2026-09-18): 17 lançamentos no
extrato Asaas, 13 lançamentos no Granatum, **13 pares batidos automaticamente**
(tolerância de 1 dia), 4 itens do Asaas corretamente sem par (taxas ainda não
lançadas no Granatum).

**Multi-empresa (2026-09-18/19)**: pedido do William pra transformar o app
single-tenant (só Hunt Sales) em multi-empresa — um super_admin cadastra outras
empresas em `/admin` (CNPJ, razão social, e-mail de acesso) e um convite sai por
e-mail (Resend) pra elas definirem senha e entrarem. Arquitetura portada quase
1:1 do padrão já validado em produção no Multi MCPs (`empresas`/`profiles`/
`user_roles`/`has_role()`/`current_empresa_id()`/trigger `handle_new_user`, ver
`CLAUDE.md`). Migration `0005_multi_empresa.sql` fez backfill automático:
criou a empresa "Hunt Sales" e migrou todos os dados de negócio já existentes
(integrações, conta, tool_mapping, pares, log, IA) pra ela, e deu ao usuário
`william@huntsales.com.br` os dois papéis (`empresa_admin` da Hunt Sales +
`super_admin` da plataforma). Validado com dados reais pós-migração (mesmos
números do teste anterior, saldo Asaas/Granatum batendo, isolamento entre
empresas confirmado por query direta) antes do deploy.

## Infraestrutura

| Item                     | Valor                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL do app               | `https://conciliacao.smartapps.ia.br`                                                                                                                                                                                                                                                                                                                                       |
| Servidor (VPS)           | mesmo do Multi MCPs — `179.199.140.100`, alias `ssh multi-mcps-server`. **Servidor compartilhado, multi-app**: não mexer nos containers/sites Nginx de outros projetos (`multi-mcps`, `cs-health`, `apresentacoes`, `calendar`).                                                                                                                                            |
| App no servidor          | `/opt/apps/conciliacao` (clone git)                                                                                                                                                                                                                                                                                                                                         |
| Porta local do container | `3004` (3000-3003 já ocupadas pelos outros apps no mesmo host)                                                                                                                                                                                                                                                                                                              |
| Deploy                   | `ssh multi-mcps-server "cd /opt/apps/conciliacao && sh deploy.sh"` — nunca `docker restart`                                                                                                                                                                                                                                                                                 |
| Repositório              | GitHub `HuntSales/conciliacao` (privado). **Conta `gh` é `HuntSales`, não `corpsolutions`** — rodar `gh auth switch -u HuntSales` antes de qualquer operação neste repo (o `gh` local tem as duas contas autenticadas). Deploy key própria (somente leitura) em `/root/.ssh/github_conciliacao` no servidor, alias `github.com-conciliacao` no `~/.ssh/config` do servidor. |
| Supabase                 | Projeto `hqtfxurhvwyvqpxeoyuj` (região não confirmada — criado direto pelo painel). Projeto próprio deste app, não reaproveita o do Multi MCPs.                                                                                                                                                                                                                             |
| Certificado HTTPS        | Let's Encrypt via Certbot, emitido em 2026-09-18, expira 2026-12-17 (renovação automática já agendada pelo Certbot).                                                                                                                                                                                                                                                        |
| Firewall/hardening       | Mesma decisão do Multi MCPs: não configurado (nada de ufw, root ainda aceita senha).                                                                                                                                                                                                                                                                                        |

### Variáveis de ambiente (server-only, nunca commitadas)

`SUPABASE_SERVICE_ROLE_KEY`, `CREDENCIAIS_CIFRA_CHAVE` — vivem só no `.env` do
servidor (`/opt/apps/conciliacao/.env`) e no `.env` local. `CREDENCIAIS_CIFRA_CHAVE`
foi gerada do zero na criação do projeto (nunca reaproveitar de outro projeto) —
depois que houver credenciais reais criptografadas com ela (tokens MCP/fallback),
essa chave não pode mais ser trocada sem antes migrar os dados, ou eles ficam
ilegíveis pra sempre.

### Contas cadastradas

- Login do app (Supabase Auth): `william@huntsales.com.br` — senha não fica
  documentada aqui; resetar via Supabase Auth Admin API/dashboard quando precisar.
- Cadastro público desabilitado — todo usuário novo precisa ser criado manualmente.

### Integrações configuradas

- **Asaas**: servidor MCP público do Multi MCPs (`mcp.smartapps.ia.br/api/public/mcp/asaas/...`).
  A chave de acesso vai embutida na própria URL (padrão do Multi MCPs,
  `{slug}/{chave}` no path) — não precisa de token/header adicional.
- **Granatum**: idem, servidor MCP público do Multi MCPs
  (`mcp.smartapps.ia.br/api/public/mcp/granatum/...`).
- **Conta configurada**: "ASAAS IP", `conta_id_granatum = 133081` (ver nota no
  Histórico acima sobre não confundir com outro tenant).
- `tool_mapping` preenchido automaticamente ao clicar "Testar conexão" nas
  Integrações — nomes reais confirmados: `recuperar_extrato` (Asaas),
  `listar_lancamentos`/`listar_categorias`/`listar_centros_custo`/`listar_contas`/
  `criar_lancamento`/`editar_lancamento` (Granatum).

## Decisões e incidentes importantes

1. **Banco em nuvem, não local**: plano inicial era SQLite local; trocado a
   pedido explícito do William antes de codar. Ver `CLAUDE.md`.
2. **Duas contas Granatum "ASAAS IP" diferentes**: descoberto testando com dados
   reais — a URL MCP pública do Multi MCPs aponta pra um tenant diferente do
   acesso MCP direto que a sessão do Claude Code já tinha. Sempre confirmar o
   `conta_id` batendo o saldo da conta com o saldo do extrato Asaas antes de
   assumir que é a conta certa.
3. **Porta do container em servidor multi-app**: o `deploy.sh` copiado do Multi
   MCPs usava porta `3000` (igual ao servidor de referência) — colidia com o
   container `multi-mcps` já rodando nela. Corrigido pra `3004` (primeira porta
   livre) antes do primeiro deploy bem-sucedido.
4. **Container "fantasma" após deploy que falha por porta ocupada**: um `docker
run` que falha ao dar bind na porta pode deixar um container parado em estado
   `Created` (não `Running`) segurando o nome — o `docker rm -f` do deploy
   seguinte remove esse container normalmente antes de tentar de novo; se um
   deploy falhar por "port is already allocated" mesmo depois de corrigir a
   porta, verificar `docker ps -a --filter name=<projeto>` por um container
   parado.
5. **`gh` local tem duas contas autenticadas** (`corpsolutions` e `HuntSales`) —
   sempre confirmar com `gh auth status` qual está ativa antes de operações em
   repositório (deploy key, push), já que este projeto usa `HuntSales`, diferente
   do padrão `corpsolutions` do Multi MCPs.
6. **Erro real em produção (2026-09-18): `HTTP 422 — "Você não pode adicionar
lançamentos em uma categoria com filhos"`**. Causa: o seletor de categoria/centro
   de custo era um cascata de 2 níveis fixos (Categoria + Subcategoria), mas a
   árvore real do Granatum tem até 4 níveis de profundidade (ex.: Despesas
   operacionais → Despesas Comerciais → Marketing e publicidade → Tráfego pago) —
   dava pra escolher um nó que ainda tinha filhos, e a API do Granatum só aceita
   folha (sem filhos) em `categoria_id`/`centro_custo_lucro_id`. Corrigido trocando
   os dois seletores (edição inline e criação a partir do Asaas) por um único
   select por hierarquia, listando **só as folhas** (`folhas()`, movida pra
   `src/lib/hierarquia.ts` para poder ser usada tanto pelo frontend quanto pelas
   server functions) com o caminho completo (`caminho`, ex. "Despesas
   operacionais > Despesas Comerciais > Marketing e publicidade > Tráfego
   pago") como rótulo — funciona pra qualquer profundidade de árvore.
7. **Sugestão de categoria/centro por IA (2026-09-18)**: pedido do William para
   pré-preencher categoria/centro ao criar lançamento a partir de um item do
   Asaas sem par, usando OpenAI + histórico. Integração OpenAI configurável em
   Integrações (chave + modelo). Restrição importante seguida à risca: a IA só
   pode escolher entre categorias/centros **já cadastrados e folha** — o schema
   JSON da resposta (`response_format: json_schema`, `strict: true`) usa um
   `enum` travado nos ids reais, nunca permite inventar ou criar categoria/
   centro novo. Ver `CLAUDE.md` para os detalhes técnicos.
8. **Conector visual entre pares ficava desalinhado (2026-09-18)**: a grade das
   duas colunas esticava (`items-stretch`) pra altura do card mais alto (quase
   sempre o do Granatum, por causa dos selects), então a linha de ligação
   ficava centralizada na altura errada. Corrigido alinhando pelo topo
   (`items-start`) e fixando a linha a uma distância constante do topo, junto
   com nós/glow pra ficar mais visível.
9. **Saldos (2026-09-18)**: pedido do William para mostrar, além dos totais do
   período, o saldo atual no Asaas, no Granatum, e o saldo do Granatum
   projetado depois de conciliar os pendentes do filtro. Saldo do Asaas via
   nova função de integração `saldo` (tool real: `recuperar_saldo_da_conta`) —
   já mapeada manualmente em produção (`tool_mapping`) pra não depender do
   usuário clicar em "Testar conexão" de novo. Saldo do Granatum vem de graça
   do `listar_contas` (campo `saldo`, já existia na API, só não estava sendo
   lido).
10. **Conciliação manual virou um diálogo, não um clique direto (2026-09-18)**:
    pedido do William para poder revisar/preencher categoria e centro de custo
    no momento de ligar manualmente um Asaas sem par a um Granatum sem par
    (antes o botão "Conciliar selecionados" ligava na hora, sem chance de
    corrigir a categorização). Agora abre `FormConciliarManual`, que também
    dispara sugestão por IA/histórico quando o lançamento do Granatum ainda
    está sem categoria.
11. **Fluxo de conciliação manual ainda não era descobrível (2026-09-18)**:
    feedback direto do William — marcar checkbox em cada lado e procurar o
    botão "Conciliar selecionados" na barra de filtros não era óbvio. Trocado
    por um botão "Ligar" direto em cada card sem par: clicar entra em "modo de
    vínculo" (faixa no topo avisando o que fazer), todo card sem par do outro
    lado vira alvo destacado com botão "Ligar aqui", clicar nele abre o mesmo
    `FormConciliarManual` de antes. Ver `CLAUDE.md` (`modoVinculo`) pros
    detalhes técnicos.
12. **Criação em lote (2026-09-18)**: item do briefing original que ainda
    faltava — selecionar vários lançamentos do Asaas sem par e criar todos no
    Granatum com a mesma categoria e centro de custo (cada um mantendo sua
    própria descrição/valor/data). `criarLoteAPartirDoAsaas` roda sequencial,
    item por item nunca aborta no meio por causa de uma falha isolada.
13. **Multi-empresa (2026-09-18/19)**: ver `CLAUDE.md` (seção "Multi-empresa")
    pra arquitetura completa. Ponto de atenção pra quem mexer no código: toda
    função em `asaas.server.ts`/`granatum.server.ts`/`openai.server.ts` usa
    `supabaseAdmin` (bypassa RLS) e recebe `empresaId` manualmente — esquecer de
    filtrar por `empresa_id` numa query nova vaza dado entre empresas, a
    proteção do banco (RLS) não cobre esse caminho porque ele nem passa pela
    RLS.
14. **Resend: domínio errado por causa da conta ser outra (2026-09-19)**: a
    chave `RESEND_API_KEY` deste projeto é de uma **conta Resend diferente**
    da usada pelo Multi MCPs — mesmo sintoma já documentado lá (memoria.md do
    Multi MCPs, item 8): `notify.smartapps.ia.br` responde 403 "domain not
    verified" com essa chave, porque verificação de domínio é por conta, não
    global. Essa conta nova já tinha `mail.smartapps.ia.br` verificado
    (`GET /domains` no Resend confirmou), então o remetente padrão em
    `email.server.ts` foi trocado pra esse domínio em vez de tentar verificar
    `notify.smartapps.ia.br` de novo. Testado com envio real (`POST /emails`
    direto na API) antes de considerar resolvido.
15. **`.env` não aceita valor com espaço (2026-09-19)**: `deploy.sh` faz
    `. ./.env` (lê como shell script) antes do build, pra exportar as
    `VITE_*` como `--build-arg`. Um `EMAIL_REMETENTE=Nome <email>` com espaço
    quebra isso com "Syntax error: newline unexpected" e derruba o deploy
    inteiro — não só a variável problemática. Como o mesmo `.env` também é
    lido puro (sem parsing de shell) por `docker run --env-file`, colocar a
    variável entre aspas troca um problema por outro (aspas viram parte
    literal do valor). Solução: deixar essa variável de fora do `.env` e usar
    só o default hardcoded no código quando o valor não for um token simples.

## Estado atual e pendências conhecidas

- Fluxo de "sugestão" (ambiguidade sem desempate claro na engine) ainda não foi
  exercitado manualmente na tela — os dados reais testados não geraram nenhuma
  ambiguidade. Vale testar o botão Confirmar/Rejeitar antes de confiar 100% nele.
- Fallback REST direto (Asaas e Granatum) implementado mas nunca exercitado de
  verdade — os dois MCPs cobriram 100% das funções necessárias no teste real.
- Hardening de segurança do servidor: deliberadamente adiado, mesma decisão do
  Multi MCPs.
- Sugestão por IA ainda não foi testada com uma chave OpenAI real — só
  typecheck/build. Vale configurar a chave em Integrações e testar na prática
  antes de confiar no pré-preenchimento em produção.
- ~~`RESEND_API_KEY` ainda não configurada~~ — configurada e testada em
  2026-09-19 (ver item 14 abaixo).
