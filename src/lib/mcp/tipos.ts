export type LancamentoAsaas = {
  id: string;
  data: string;
  descricao: string;
  valor: number; // negativo = despesa, positivo = receita
  tipo: "receita" | "despesa";
};

export type LancamentoGranatum = {
  id: string;
  data: string; // data_pagamento
  descricao: string;
  valor: number; // absoluto
  tipo: "receita" | "despesa";
  categoriaId: string | null;
  centroCustoId: string | null;
  identificadorExterno: string | null;
};

export type CategoriaGranatum = {
  id: string;
  nome: string;
  parentId: string | null;
  tipo: "receita" | "despesa" | "mista";
  caminho: string;
};

export type CentroCustoGranatum = {
  id: string;
  nome: string;
  parentId: string | null;
  caminho: string;
};

export type ContaGranatum = {
  id: string;
  nome: string;
};

export type FuncaoIntegracao =
  | "extrato"
  | "lancamentos"
  | "categorias"
  | "centros_custo"
  | "contas"
  | "criar_lancamento"
  | "editar_lancamento";

export type Provedor = "asaas" | "granatum";
