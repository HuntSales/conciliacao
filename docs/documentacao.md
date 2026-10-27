# Conciliação Asaas × Granatum — Documentação

Conciliação bancária entre o extrato do **Asaas** (conta bancária) e os
lançamentos do **Granatum** (financeiro), multi-empresa. Este arquivo é a
fonte da verdade da documentação; a página "Conciliação" em
**Notion → Hunt Sales → Doc Sistemas** é espelho dele. Guia técnico detalhado
em `CLAUDE.md`; histórico e decisões em `memoria.md`.

- **Endereço:** https://conciliacao.smartapps.ia.br
- **Repositório:** `HuntSales/conciliacao` (privado), branch `main`
- **Atualizado em:** 2026-10-27

---

## 1. Visão geral

Todo dia o saldo da conta Asaas precisa bater com o saldo da conta "ASAAS IP"
no Granatum. O sistema:

- busca o extrato do Asaas e os lançamentos do Granatum do período;
- **liga sozinho** o que bate por valor e data, e **sugere** o que é provável
  (fatura em aberto, paga fora do período, paga com atraso e juros);
- deixa **criar no Granatum**, direto da tela, o que está no Asaas e falta lá,
  já com categoria e centro de custo sugeridos (histórico ou IA);
- **acha sozinho o período** em que o saldo bate e resolve tudo com **um
  clique** ("Lançar e conciliar").

Fala com o Asaas e o Granatum pelos servidores MCP da plataforma Multi MCPs
(com reserva de acesso direto à API REST). Nada é alterado no Asaas; no
Granatum, só cria, edita e dá baixa em lançamentos — nunca cria categoria nem
centro de custo, e nunca exclui.

---

## 2. Uso diário (fluxo recomendado)

1. Abra **Conciliação**. O sistema ajusta o período sozinho (ver 3.1) e mostra
   no topo: "Período ajustado ao saldo do Asaas: de X a Y".
2. Confira os cards:
   - itens do Asaas que vão ser **criados** já vêm marcados, com descrição,
     categoria e centro de custo preenchidos — corrija o que precisar;
   - **sugestões** (linha tracejada dourada entre os cards) vão ser
     conciliadas; clique na linha pra **interromper** uma ligação errada.
3. Clique no botão verde **"Lançar e conciliar (N)"**. Ele concilia todas as
   sugestões (dando baixa no Granatum nas que estão em aberto) e cria os
   marcados, um por um, sem parar no meio se algum falhar.
4. A tela busca de novo. Com tudo resolvido aparece **"Saldo do Granatum bate
   com o do Asaas"**.

Se a faixa do topo disser que nenhum período de até 15 dias fecha o saldo, a
tela fica em "hoje" e mostra quanto falta — investigar lançamento ignorado, em
data errada, ou movimento que não passou pelo Asaas.

---

## 3. Tela de Conciliação

### 3.1 Ajuste ao saldo (ao abrir e no botão "Ajustar ao saldo")

Repete o que se fazia à mão: concilia **só hoje** e confere se o "saldo no
Granatum após conciliar" bate ao centavo com o saldo do Asaas; se não bater,
tenta **de ontem até hoje**; e assim por diante, um dia por vez, até **15
dias**. Para não ficar lento, busca os 15 dias no Asaas/Granatum uma vez só e
testa cada período em memória — o resultado é o mesmo de buscar período por
período. Depois do ajuste, tudo que pode ser criado já fica marcado.

O filtro de período manual (Hoje / Esta semana / Este mês / datas, tolerância
de dias) e o botão "Buscar lançamentos" continuam disponíveis.

### 3.2 Resumo e saldos

- Totais do período no Asaas e no Granatum, diferença, conciliados e pendentes.
- **Saldo no Asaas** (tempo real), **Saldo no Granatum** (da conta) e **Saldo no
  Granatum após conciliar** = saldo do Granatum + itens do Asaas que ainda
  mexem no saldo (sem nada no Granatum → serão criados; ligados a lançamento
  em aberto → serão baixados). Ignorados e os que "já existem no Granatum" não
  entram.

### 3.3 Tipos de ligação

| Situação | Como aparece | O que acontece |
| --- | --- | --- |
| Valor exato + mesma data (ou dentro da tolerância), lançamento já baixado | Linha cheia, "Automático" | Gravado sozinho na hora da busca |
| Valor exato, mas empate entre candidatos ou lançamento **em aberto** | Linha tracejada, "Sugestão" | Só grava com "Confirmar" ou "Lançar e conciliar" (baixa só por clique) |
| Fatura em aberto com o **mesmo valor**, vencida até 10 dias antes ou até 5 depois do período | Sugestão + chip "Fora do período" | Confirmar dá baixa com a data do Asaas |
| Fatura em aberto **paga com atraso**, valor recebido maior (juros/multa) | Sugestão + chip "Pago com atraso" e aviso com o acréscimo | Confirmar dá baixa e passa o valor do lançamento para o recebido |
| Item do Asaas que parece já existir no Granatum (mesmo identificador, ou mesmo valor em outra data do período) | Aviso "Já existe no Granatum" + "Ligar a ele" | Sem checkbox, fora do lote; por valor dá pra "Criar mesmo assim" com segundo clique |
| Ligação manual | Botão "Ligar" num card e "Ligar aqui" no outro lado | Abre o formulário lado a lado, avisa se valor/data não batem |

**Pago com atraso** — regra: lançamento em aberto; pago de 0 a **10 dias**
depois do vencimento; valor recebido **maior** em até **10%** (desconto não
entra); e mesmo cliente — a referência externa da cobrança do Asaas (ex.:
"7444") aparece na descrição do Granatum, ou o nome do cliente bate. A
diferença vai **no mesmo lançamento** (não cria lançamento de juros à parte).
Caso que motivou: ATM — R$ 3.688,30 vencido em 19/10, recebido R$ 3.920,78 em
20/10.

### 3.4 Ações nos cards

- **Asaas sem par:** descrição, categoria e centro editáveis; "Criar no
  Granatum" (cria já baixado e concilia); checkbox para o lote; "Ligar";
  "Ignorar".
- **Granatum:** descrição/categoria/centro editáveis (sem categoria vem
  pré-preenchido com a sugestão); "Salvar"; "Confirmar" (sugestão);
  "Desfazer" (par gravado); "Ligar"; "Ignorar". Os cards do Granatum não têm
  checkbox — o Granatum é só pra mostrar.
- **Interromper ligação:** clique na linha tracejada (no celular, botão
  "Interromper"). É **permanente**: aquele par nunca mais é proposto, mas cada
  lado continua livre pra outro par. Clicar de novo restaura.
- **Ignorar:** confirmação dupla. O item sai da conciliação, dos pendentes e do
  saldo projetado; aparece só no filtro "Ignorados", com "Voltar a
  considerar". Nada é alterado no Asaas/Granatum.

### 3.5 Lote

Com itens do Asaas marcados aparece a faixa de seleção:

- **Criar todos / Criar N selecionados** — cada um com os campos do próprio
  card. Recusa antes se algum estiver sem categoria.
- **Mesma categoria para todos** — uma categoria e um centro para todos.
- **Ignorar todos.**
- **Selecionar todos os pendentes** marca só o que ainda pode ser criado.

O botão verde **"Lançar e conciliar"** faz o lote de criação e a confirmação
de todas as sugestões juntos.

### 3.6 Sem duplicidade

Todo lançamento criado a partir do Asaas grava `identificador_externo = <id
do Asaas>`. Antes de criar, o sistema confere no Granatum; desfazer o par não
libera criar de novo.

---

## 4. Sugestão de categoria e centro de custo

Depois de cada busca, uma única chamada sugere categoria/centro para todos os
pendentes (itens do Asaas sem par e lançamentos do Granatum sem categoria),
na ordem mais barata primeiro:

1. **Histórico** — conciliações já feitas no app + últimos 180 dias da conta
   no Granatum, por similaridade de descrição.
2. **Busca textual no Granatum** — pega lançamentos mais antigos.
3. **IA (OpenAI)** — só para o que sobrou, em lote, escolhendo **apenas**
   entre as categorias/centros que existem (o modelo não inventa).
4. Sem nada disso: histórico mais distante, ou fica em branco.

O resultado fica em cache durante a sessão (não gasta token de novo com o
mesmo item). Falha da IA nunca trava nada. A chave da OpenAI é configurada por
empresa em **Integrações**.

---

## 5. Aba Lançamentos

Lançar direto no Granatum em **qualquer** conta (inclusive bancos sem extrato
integrado), separado da conciliação.

- Tela inicial com dois botões grandes: **Conciliação** e **Lançamentos**. No
  celular o menu mostra só esses dois.
- Lista as contas com saldo; a última conta usada fica salva no aparelho.
- **Entrada por voz** (microfone do navegador, sem custo): "gasolina no posto
  Shell 150 reais" vira descrição + valor (e o tipo, quando a frase diz
  "comprei"/"recebi").
- Categoria/centro sugeridos pela mesma regra da conciliação, usando o
  histórico da conta escolhida.
- **Já pago** (padrão) ou em aberto (a data vira vencimento).
- **Único / Parcelado / Recorrente:** parcelado divide o total e acerta os
  centavos na 1ª parcela; recorrente sem fim ou N vezes (semanal, quinzenal,
  mensal, bimestral, trimestral, semestral, anual). A frase entende "em 10x",
  "todo mês" etc.
- Reenviar o mesmo "Salvar" não duplica.

---

## 6. Outras telas

- **Integrações** — URL do MCP do Asaas e do Granatum (e credencial REST de
  reserva), "Testar conexão" (detecta sozinho qual ferramenta faz cada
  função), conta do Granatum que representa o Asaas, chave da OpenAI.
- **Histórico** — conciliações feitas e alterações no Granatum (antes/depois
  de cada edição, baixa e ajuste de valor).
- **Admin** (só super admin) — cadastro de empresas; o convite de acesso sai
  por e-mail (Resend) e a pessoa define a senha em `/redefinir-senha`.

### Multi-empresa

Cada empresa tem integrações, conta, conciliações e histórico próprios,
isolados no banco (RLS). Empresas hoje: **Hunt Sales** (conta Granatum
"ASAAS IP" `123499`) e **Corp Connect** (`133081`). Cadastro público
desabilitado.

---

## 7. Arquitetura técnica

### 7.1 Stack

TanStack Start (React 19 + Vite + Nitro, build `node-server`), Tailwind v4 +
Radix/shadcn, Supabase (Postgres em nuvem + Auth, **sem banco local**), Resend
(e-mail), OpenAI (sugestão), Vitest. Mesma stack e padrão do projeto irmão
Multi MCPs, que hospeda os MCPs do Asaas e do Granatum.

### 7.2 Arquivos principais

| Arquivo | Função |
| --- | --- |
| `src/lib/matching.ts` | Engine de conciliação, **pura e testada**: `conciliar`, `detectarJaNoGranatum`, `detectarPagoComAtraso` |
| `src/lib/conciliacao.functions.ts` | Server functions da conciliação: `buscarLancamentos` (com ajuste ao saldo), `confirmarPar` (baixa e ajuste de valor), criação, ignorar, interromper, sugestões |
| `src/lib/lancamentos.functions.ts` | Aba Lançamentos |
| `src/lib/integracoes.functions.ts` | Configuração e detecção automática das ferramentas MCP |
| `src/lib/empresas.functions.ts` | Admin / multi-empresa |
| `src/lib/mcp/mcp-client.server.ts` | Cliente MCP genérico (JSON-RPC sobre HTTP/SSE) |
| `src/lib/mcp/asaas.server.ts` / `granatum.server.ts` | Funções de cada provedor (MCP ou REST de reserva) |
| `src/lib/ia/openai.server.ts` | Sugestão de categoria/centro por IA |
| `src/lib/extrair-valor.ts`, `src/lib/parcelas.ts` | Interpretação da frase falada e divisão de parcelas (puros, testados) |
| `src/routes/_authenticated/conciliacao.tsx` | Tela de conciliação |
| `src/components/conciliacao/*` | Cards, formulários e diálogos da conciliação |

### 7.3 Banco (Supabase)

Toda tabela de negócio tem `empresa_id` e RLS por empresa: `integracoes_mcp`,
`credenciais_fallback` (criptografadas), `conta_granatum`, `tool_mapping`,
`pares_conciliacao`, `log_alteracoes_granatum`, `integracoes_ia`,
`lancamentos_ignorados`, `sugestoes_recusadas`. Mais `empresas`, `profiles`,
`user_roles`. Migrations em `supabase/migrations/`.

### 7.4 Regras que não podem quebrar

- Toda função de integração recebe `empresaId` e filtra por ele (o acesso ao
  banco no servidor ignora o RLS) — esquecer vaza dado entre empresas.
- **Baixa no Granatum só por clique** do usuário ("Confirmar", "Ligar" ou
  "Lançar e conciliar"); a busca nunca dá baixa sozinha.
- **Nunca duplicar lançamento** no Granatum (identificador externo + conferência
  antes de criar).
- Respostas das ferramentas MCP são cortadas em 100 mil caracteres: listagens
  paginadas em páginas pequenas (Granatum: 50) e resposta inválida nunca vira
  lista vazia.
- Regra nova de casamento entra em `matching.ts`, com teste.
- Nunca trocar `CREDENCIAIS_CIFRA_CHAVE` (as credenciais salvas ficariam
  ilegíveis).

---

## 8. Infraestrutura e operação

- **Servidor:** VPS `multi-mcps-server` (179.199.140.100), compartilhado com
  outros apps — não mexer nos containers/sites dos outros.
- **Pasta:** `/opt/apps/conciliacao` · **Container:** `conciliacao` →
  `127.0.0.1:3004`, atrás do Nginx com HTTPS (Let's Encrypt).
- **Banco:** Supabase, projeto `hqtfxurhvwyvqpxeoyuj`.
- **Segredos:** `/opt/apps/conciliacao/.env` (`SUPABASE_SERVICE_ROLE_KEY`,
  `CREDENCIAIS_CIFRA_CHAVE`, Resend etc.) — nunca commitados.

### Deploy

```bash
npx tsc -p tsconfig.json --noEmit && npm run lint && npx vitest run
gh auth switch -u HuntSales
git push origin main
ssh multi-mcps-server "cd /opt/apps/conciliacao && sh deploy.sh"
```

`deploy.sh` faz `git pull`, `docker build` e **recria** o container (nunca
`docker restart`). Migration nova: `supabase db push` e regenerar os tipos
antes do deploy.

### Rodar local

```bash
npm install
npm run dev        # porta 8080
npx vitest run
```

### Problemas comuns

| Sintoma | Causa / solução |
| --- | --- |
| Saldo não bate em nenhum período de 15 dias | Lançamento ignorado, em data errada no Granatum, ou movimento fora do Asaas — a faixa do topo mostra quanto falta |
| Lançamento do Granatum "sumiu" da busca | Em aberto entra pela data de vencimento; baixado, pela data de pagamento |
| Pagamento atrasado não foi sugerido | Mais de 10 dias de atraso, mais de 10% de acréscimo, pago com desconto, ou nome/referência diferentes — usar "Ligar" |
| Saldo do Asaas aparece "—" | Ferramenta `saldo` não mapeada: clicar "Testar conexão" em Integrações |
| Busca lenta | ~3 s o período; a sugestão de categoria (180 dias de histórico) leva ~20 s e roda depois, sem travar a tela |

---

## 9. Histórico de entregas

| Data | Entrega |
| --- | --- |
| 18/09/2026 | Base: conciliação automática, criação/edição no Granatum, histórico, saldos, sugestão por IA, conciliação manual, criação em lote |
| 18-19/09/2026 | Multi-empresa (admin, convite por e-mail, isolamento por empresa) |
| 23/09/2026 | Campos inline nos cards e sugestão histórico-primeiro; "Criar todos" com a categoria de cada card |
| 24-25/09/2026 | Lançamentos em aberto (vencimento), baixa só por clique, Ignorar e Ignorar todos |
| 29/09/2026 | Aba Lançamentos (voz, parcelado, recorrente) |
| 05/10/2026 | Sem duplicidade ("Já existe no Granatum"), fatura em aberto fora do período, paginação contra o corte de 100 mil caracteres, conciliar sugestões em lote e interromper ligação |
| 06/10/2026 | Empresa Corp Connect |
| 17/10/2026 | Ajuste ao saldo dia a dia ao abrir a tela e botão único "Lançar e conciliar" (verde) |
| 20/10/2026 | Pago com atraso e juros/multa: sugestão e ajuste do valor na baixa |
| 27/10/2026 | Esta documentação (repositório + Notion) |
