# Conciliação Asaas × Granatum

Conciliação bancária automática entre o extrato do Asaas e os lançamentos do Granatum.

## Stack

- TanStack Start (React 19 + Vite + Nitro), build `node-server`
- Tailwind v4 + Radix/shadcn, seguindo `identidade-visual.md`
- Supabase (Postgres em nuvem + Auth) — sem banco local
- Multi-empresa: cada empresa tem suas próprias integrações/conciliações,
  isoladas por RLS (ver `CLAUDE.md`, seção "Multi-empresa")
- Resend para o convite de acesso por e-mail
- Vitest para a engine de conciliação

## Configuração

1. **Instalar dependências**

   ```sh
   npm install
   ```

2. **Variáveis de ambiente** — copie `.env.example` para `.env` e preencha:

   ```
   SUPABASE_URL=
   SUPABASE_PUBLISHABLE_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   SUPABASE_PROJECT_ID=
   VITE_SUPABASE_URL=            # igual ao SUPABASE_URL
   VITE_SUPABASE_PUBLISHABLE_KEY= # igual ao SUPABASE_PUBLISHABLE_KEY
   VITE_SUPABASE_PROJECT_ID=      # igual ao SUPABASE_PROJECT_ID
   CREDENCIAIS_CIFRA_CHAVE=       # 64 caracteres hex (openssl rand -hex 32)
   RESEND_API_KEY=                # chave própria deste projeto — nunca reaproveitar de outro
   EMAIL_REMETENTE=Conciliação <nao-responda@notify.smartapps.ia.br>
   ```

3. **Banco** — as migrations vivem em `supabase/migrations/`. Com o Supabase CLI logado
   (`SUPABASE_ACCESS_TOKEN` ou `supabase login`) e o projeto linkado:

   ```sh
   supabase link --project-ref <ref>
   supabase db push
   supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
   ```

4. **Primeiro usuário (super_admin)** — não há cadastro público. Crie o primeiro
   usuário direto no Supabase Auth (painel do projeto, ou via API Admin com a
   service role key) e faça o primeiro login: ele é promovido a `super_admin`
   automaticamente (`garantirPrimeiroSuperAdmin`, só funciona enquanto não
   existir nenhum super_admin ainda). Esse primeiro usuário não fica
   automaticamente vinculado a nenhuma empresa — `/admin` cadastra _outras_
   empresas, não a própria; para o próprio acesso à conciliação, insira também
   uma linha em `empresas` e ligue o usuário a ela via `profiles`/`user_roles`
   (é exatamente o que a migration `0005_multi_empresa.sql` fez para a Hunt
   Sales, como referência).

5. **Rodar em desenvolvimento**

   ```sh
   npm run dev
   ```

6. **Testes**

   ```sh
   npx vitest run
   ```

## Admin (multi-empresa)

Usuários `super_admin` veem uma aba **Admin** (`/admin`) para cadastrar novas
empresas: razão social, CNPJ e e-mail de acesso. Ao salvar, um convite é
enviado por e-mail (Resend) com um link para a empresa definir a senha e
entrar — cada empresa só enxerga as próprias integrações, conciliações e
histórico (isolado por RLS). Sem `RESEND_API_KEY` configurada, a empresa é
criada mas o convite falha (avisa na tela); reenvie depois em "Reenviar convite".

## Integrações (feito na tela, não em `.env`)

Depois de logado, em **Integrações**:

- Cadastre o servidor MCP do Asaas e do Granatum (URL, transporte HTTP/SSE, token).
  Clique em **Testar conexão** — o app lista as tools do servidor e tenta mapear
  automaticamente qual tool cumpre cada função (extrato, lançamentos, categorias,
  centros de custo, contas, criar/editar lançamento). Corrija manualmente se a
  heurística errar.
- Preencha o fallback REST (token direto do Asaas/Granatum) para as funções sem
  tool mapeada no MCP.
- Selecione a **conta do Granatum** que representa a conta Asaas — todos os
  lançamentos buscados e criados usam essa conta.
- (Opcional) Cadastre uma **chave da OpenAI** e escolha o modelo — usada para
  sugerir e pré-preencher categoria e centro de custo (só entre os já
  cadastrados no Granatum) ao criar um lançamento a partir de um item do Asaas
  sem par. Sem chave, a sugestão só funciona quando há histórico muito parecido.

## Deploy

Self-hosted via Docker + Nginx + Let's Encrypt (`Dockerfile`, `deploy.sh`), no mesmo
padrão do projeto Multi MCPs. Publicado com a skill `subir_servidor`.

```sh
ssh <servidor> "cd /opt/apps/conciliacao && sh deploy.sh"
```

`deploy.sh` sempre recria o container (nunca `docker restart`) para garantir que
mudanças no `.env` sejam aplicadas.
