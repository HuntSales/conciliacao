-- Nova função de integração: saldo atual da conta (Asaas). Granatum não
-- precisa de tool própria — o saldo já vem no retorno de listar_contas.
alter table tool_mapping drop constraint if exists tool_mapping_funcao_check;
alter table tool_mapping add constraint tool_mapping_funcao_check check (
  funcao in (
    'extrato',
    'lancamentos',
    'categorias',
    'centros_custo',
    'contas',
    'criar_lancamento',
    'editar_lancamento',
    'saldo'
  )
);
