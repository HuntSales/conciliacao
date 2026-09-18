-- Conciliação Asaas × Granatum — schema inicial.
-- Ferramenta de uso interno: qualquer usuário autenticado enxerga tudo
-- (sem multi-tenancy), então as policies de RLS abaixo só exigem sessão válida.

create table if not exists integracoes_mcp (
  id uuid primary key default gen_random_uuid(),
  provedor text not null check (provedor in ('asaas', 'granatum')),
  nome text not null,
  url_mcp text,
  transporte text check (transporte in ('http', 'sse')),
  token_cifrado text,
  status text not null default 'nao_testado' check (status in ('nao_testado', 'conectado', 'erro')),
  ultimo_erro text,
  ultima_checagem timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (provedor)
);

create table if not exists credenciais_fallback (
  id uuid primary key default gen_random_uuid(),
  provedor text not null unique check (provedor in ('asaas', 'granatum')),
  token_cifrado text,
  ambiente text check (ambiente in ('producao', 'sandbox')),
  atualizado_em timestamptz not null default now()
);

create table if not exists conta_granatum (
  id uuid primary key default gen_random_uuid(),
  conta_id_granatum text not null,
  nome text,
  atualizado_em timestamptz not null default now()
);

create table if not exists tool_mapping (
  id uuid primary key default gen_random_uuid(),
  provedor text not null check (provedor in ('asaas', 'granatum')),
  funcao text not null check (
    funcao in (
      'extrato',
      'lancamentos',
      'categorias',
      'centros_custo',
      'contas',
      'criar_lancamento',
      'editar_lancamento'
    )
  ),
  tool_name text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (provedor, funcao)
);

create table if not exists pares_conciliacao (
  id uuid primary key default gen_random_uuid(),
  asaas_id text not null unique,
  granatum_id text not null unique,
  data date not null,
  valor numeric(14, 2) not null,
  tipo text not null check (tipo in ('automatico', 'manual', 'sugestao')),
  usuario_id uuid references auth.users (id),
  criado_em timestamptz not null default now()
);

create index if not exists pares_conciliacao_data_idx on pares_conciliacao (data);

create table if not exists log_alteracoes_granatum (
  id uuid primary key default gen_random_uuid(),
  lancamento_id text not null,
  antes jsonb,
  depois jsonb,
  usuario_id uuid references auth.users (id),
  criado_em timestamptz not null default now()
);

create index if not exists log_alteracoes_lancamento_idx on log_alteracoes_granatum (lancamento_id);

alter table integracoes_mcp enable row level security;
alter table credenciais_fallback enable row level security;
alter table conta_granatum enable row level security;
alter table tool_mapping enable row level security;
alter table pares_conciliacao enable row level security;
alter table log_alteracoes_granatum enable row level security;

create policy "autenticado_tudo" on integracoes_mcp for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "autenticado_tudo" on credenciais_fallback for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "autenticado_tudo" on conta_granatum for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "autenticado_tudo" on tool_mapping for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "autenticado_tudo" on pares_conciliacao for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "autenticado_tudo" on log_alteracoes_granatum for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
