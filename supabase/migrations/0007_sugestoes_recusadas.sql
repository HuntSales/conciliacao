-- Ligações sugeridas que o usuário interrompeu na conciliação: aquele par
-- (item do Asaas + lançamento do Granatum) nunca mais é proposto — nem pela
-- engine, nem como "já existe no Granatum". Cada lado continua livre pra
-- ligar com outro. Reversível (a linha é apagada ao restaurar).
create table if not exists sugestoes_recusadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  asaas_id text not null,
  granatum_id text not null,
  usuario_id uuid references auth.users (id),
  criado_em timestamptz not null default now(),
  unique (empresa_id, asaas_id, granatum_id)
);

alter table sugestoes_recusadas enable row level security;

create policy "empresa_escopo" on sugestoes_recusadas for all to authenticated
  using (empresa_id = current_empresa_id()) with check (empresa_id = current_empresa_id());
