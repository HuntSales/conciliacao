# Conciliação Asaas × Granatum

Conciliação bancária automática entre o extrato do Asaas e os lançamentos do Granatum.

## Stack

- TanStack Start (React 19 + Vite + Nitro), build `node-server`
- Tailwind v4 + Radix/shadcn, seguindo `identidade-visual.md`
- Supabase (Postgres em nuvem + Auth) — sem banco local
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
   ```

3. **Banco** — as migrations vivem em `supabase/migrations/`. Com o Supabase CLI logado
   (`SUPABASE_ACCESS_TOKEN` ou `supabase login`) e o projeto linkado:

   ```sh
   supabase link --project-ref <ref>
   supabase db push
   supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
   ```

4. **Usuário de login** — não há cadastro público. Crie o primeiro usuário direto no
   Supabase Auth (painel do projeto, ou via API Admin com a service role key).

5. **Rodar em desenvolvimento**

   ```sh
   npm run dev
   ```

6. **Testes**

   ```sh
   npx vitest run
   ```

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

## Deploy

Self-hosted via Docker + Nginx + Let's Encrypt (`Dockerfile`, `deploy.sh`), no mesmo
padrão do projeto Multi MCPs. Publicado com a skill `subir_servidor`.

```sh
ssh <servidor> "cd /opt/apps/conciliacao && sh deploy.sh"
```

`deploy.sh` sempre recria o container (nunca `docker restart`) para garantir que
mudanças no `.env` sejam aplicadas.
