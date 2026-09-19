-- Multi-empresa: cada empresa tem suas próprias integrações, conta,
-- conciliações e histórico. Um usuário pode ser super_admin (gerencia
-- empresas em /admin), empresa_admin/empresa_membro (usa a conciliação da
-- própria empresa), ou os dois ao mesmo tempo.

create type app_role as enum ('super_admin', 'empresa_admin', 'empresa_membro');
create type empresa_status as enum ('ativa', 'suspensa');

create table empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  cnpj text unique,
  email text not null,
  status empresa_status not null default 'ativa',
  criado_em timestamptz not null default now()
);

create table profiles (
  id uuid primary key,
  empresa_id uuid references empresas (id) on delete set null,
  nome text,
  email text,
  papel app_role not null default 'empresa_membro',
  criado_em timestamptz not null default now()
);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role app_role not null,
  criado_em timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = _user_id and role = _role);
$$;

create or replace function current_empresa_id()
returns uuid language sql stable security definer set search_path = public as $$
  select empresa_id from profiles where id = auth.uid();
$$;

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nome, email, papel, empresa_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', new.email),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'papel')::app_role, 'empresa_membro'),
    nullif(new.raw_user_meta_data ->> 'empresa_id', '')::uuid
  )
  on conflict (id) do nothing;

  insert into user_roles (user_id, role)
  values (new.id, coalesce((new.raw_user_meta_data ->> 'papel')::app_role, 'empresa_membro'))
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

alter table empresas enable row level security;
alter table profiles enable row level security;
alter table user_roles enable row level security;

create policy "empresas super admin" on empresas for all to authenticated
  using (has_role(auth.uid(), 'super_admin')) with check (has_role(auth.uid(), 'super_admin'));
create policy "empresas propria" on empresas for select to authenticated
  using (id = current_empresa_id());

create policy "profiles super admin" on profiles for all to authenticated
  using (has_role(auth.uid(), 'super_admin')) with check (has_role(auth.uid(), 'super_admin'));
create policy "profiles proprio" on profiles for select to authenticated
  using (id = auth.uid() or empresa_id = current_empresa_id());
create policy "profiles atualiza proprio" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "user_roles leitura propria" on user_roles for select to authenticated
  using (user_id = auth.uid() or has_role(auth.uid(), 'super_admin'));

-- Multi-tenancy nas tabelas de negócio já existentes.
alter table integracoes_mcp add column if not exists empresa_id uuid references empresas (id) on delete cascade;
alter table credenciais_fallback add column if not exists empresa_id uuid references empresas (id) on delete cascade;
alter table conta_granatum add column if not exists empresa_id uuid references empresas (id) on delete cascade;
alter table tool_mapping add column if not exists empresa_id uuid references empresas (id) on delete cascade;
alter table pares_conciliacao add column if not exists empresa_id uuid references empresas (id) on delete cascade;
alter table log_alteracoes_granatum add column if not exists empresa_id uuid references empresas (id) on delete cascade;
alter table integracoes_ia add column if not exists empresa_id uuid references empresas (id) on delete cascade;

-- Backfill: cria a empresa "Hunt Sales" (ambiente já cadastrado) e vincula o
-- usuário existente como empresa_admin + super_admin, e todos os dados de
-- negócio já criados a essa empresa. CNPJ fica em branco por ora — o usuário
-- corrige depois em /admin (coluna é opcional de propósito por causa disso).
do $$
declare
  v_empresa_id uuid;
  v_user_id uuid;
begin
  insert into empresas (razao_social, email)
  values ('Hunt Sales', 'william@huntsales.com.br')
  returning id into v_empresa_id;

  select id into v_user_id from auth.users where email = 'william@huntsales.com.br' limit 1;

  if v_user_id is not null then
    insert into profiles (id, empresa_id, nome, email, papel)
    values (v_user_id, v_empresa_id, 'William', 'william@huntsales.com.br', 'empresa_admin')
    on conflict (id) do update set empresa_id = excluded.empresa_id, papel = excluded.papel;

    insert into user_roles (user_id, role) values (v_user_id, 'empresa_admin')
    on conflict (user_id, role) do nothing;
    insert into user_roles (user_id, role) values (v_user_id, 'super_admin')
    on conflict (user_id, role) do nothing;
  end if;

  update integracoes_mcp set empresa_id = v_empresa_id where empresa_id is null;
  update credenciais_fallback set empresa_id = v_empresa_id where empresa_id is null;
  update conta_granatum set empresa_id = v_empresa_id where empresa_id is null;
  update tool_mapping set empresa_id = v_empresa_id where empresa_id is null;
  update pares_conciliacao set empresa_id = v_empresa_id where empresa_id is null;
  update log_alteracoes_granatum set empresa_id = v_empresa_id where empresa_id is null;
  update integracoes_ia set empresa_id = v_empresa_id where empresa_id is null;
end $$;

alter table integracoes_mcp alter column empresa_id set not null;
alter table credenciais_fallback alter column empresa_id set not null;
alter table conta_granatum alter column empresa_id set not null;
alter table tool_mapping alter column empresa_id set not null;
alter table pares_conciliacao alter column empresa_id set not null;
alter table log_alteracoes_granatum alter column empresa_id set not null;
alter table integracoes_ia alter column empresa_id set not null;

-- Constraints de unicidade eram globais; agora são por empresa.
alter table integracoes_mcp drop constraint if exists integracoes_mcp_provedor_key;
alter table integracoes_mcp add constraint integracoes_mcp_empresa_provedor_key unique (empresa_id, provedor);

alter table credenciais_fallback drop constraint if exists credenciais_fallback_provedor_key;
alter table credenciais_fallback add constraint credenciais_fallback_empresa_provedor_key unique (empresa_id, provedor);

alter table tool_mapping drop constraint if exists tool_mapping_provedor_funcao_key;
alter table tool_mapping add constraint tool_mapping_empresa_provedor_funcao_key unique (empresa_id, provedor, funcao);

alter table integracoes_ia drop constraint if exists integracoes_ia_provedor_key;
alter table integracoes_ia add constraint integracoes_ia_empresa_provedor_key unique (empresa_id, provedor);

alter table conta_granatum add constraint conta_granatum_empresa_key unique (empresa_id);

-- IDs do Asaas/Granatum são únicos dentro de uma conta, não globalmente —
-- duas empresas diferentes podem ter, cada uma, um lançamento com o mesmo id.
alter table pares_conciliacao drop constraint if exists pares_conciliacao_asaas_id_key;
alter table pares_conciliacao drop constraint if exists pares_conciliacao_granatum_id_key;
alter table pares_conciliacao add constraint pares_conciliacao_empresa_asaas_key unique (empresa_id, asaas_id);
alter table pares_conciliacao add constraint pares_conciliacao_empresa_granatum_key unique (empresa_id, granatum_id);

-- Troca a policy "qualquer autenticado" por escopo de empresa.
drop policy if exists "autenticado_tudo" on integracoes_mcp;
create policy "empresa_escopo" on integracoes_mcp for all to authenticated
  using (empresa_id = current_empresa_id()) with check (empresa_id = current_empresa_id());

drop policy if exists "autenticado_tudo" on credenciais_fallback;
create policy "empresa_escopo" on credenciais_fallback for all to authenticated
  using (empresa_id = current_empresa_id()) with check (empresa_id = current_empresa_id());

drop policy if exists "autenticado_tudo" on conta_granatum;
create policy "empresa_escopo" on conta_granatum for all to authenticated
  using (empresa_id = current_empresa_id()) with check (empresa_id = current_empresa_id());

drop policy if exists "autenticado_tudo" on tool_mapping;
create policy "empresa_escopo" on tool_mapping for all to authenticated
  using (empresa_id = current_empresa_id()) with check (empresa_id = current_empresa_id());

drop policy if exists "autenticado_tudo" on pares_conciliacao;
create policy "empresa_escopo" on pares_conciliacao for all to authenticated
  using (empresa_id = current_empresa_id()) with check (empresa_id = current_empresa_id());

drop policy if exists "autenticado_tudo" on log_alteracoes_granatum;
create policy "empresa_escopo" on log_alteracoes_granatum for all to authenticated
  using (empresa_id = current_empresa_id()) with check (empresa_id = current_empresa_id());

drop policy if exists "autenticado_tudo" on integracoes_ia;
create policy "empresa_escopo" on integracoes_ia for all to authenticated
  using (empresa_id = current_empresa_id()) with check (empresa_id = current_empresa_id());
