-- Integração de IA (OpenAI) para sugerir categoria/centro de custo ao criar
-- lançamento no Granatum a partir de um item do Asaas sem par.
create table if not exists integracoes_ia (
  id uuid primary key default gen_random_uuid(),
  provedor text not null unique default 'openai',
  token_cifrado text,
  modelo text,
  atualizado_em timestamptz not null default now()
);

alter table integracoes_ia enable row level security;

create policy "autenticado_tudo" on integracoes_ia for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Histórico local: guarda o que foi usado em cada par, para aprender e
-- sugerir categoria/centro em lançamentos futuros com descrição parecida.
alter table pares_conciliacao add column if not exists descricao text;
alter table pares_conciliacao add column if not exists categoria_id text;
alter table pares_conciliacao add column if not exists centro_custo_id text;
