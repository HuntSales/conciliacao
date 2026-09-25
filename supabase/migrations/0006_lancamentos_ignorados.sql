-- Lançamentos (de qualquer lado) que o usuário mandou ignorar na conciliação:
-- somem da lista de pendentes, nunca entram na engine de matching nem viram
-- sugestão. Reversível (a linha é apagada ao "voltar a considerar").
create table if not exists lancamentos_ignorados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  provedor text not null check (provedor in ('asaas', 'granatum')),
  lancamento_id text not null,
  -- Cópia de como estava ao ignorar, só pra exibição/auditoria.
  data date,
  valor numeric(14, 2),
  descricao text,
  usuario_id uuid references auth.users (id),
  criado_em timestamptz not null default now(),
  unique (empresa_id, provedor, lancamento_id)
);

alter table lancamentos_ignorados enable row level security;

create policy "empresa_escopo" on lancamentos_ignorados for all to authenticated
  using (empresa_id = current_empresa_id()) with check (empresa_id = current_empresa_id());
