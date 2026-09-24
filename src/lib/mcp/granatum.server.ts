import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { criptografar, descriptografar } from "@/lib/crypto.server";
import { listarTools, chamarTool, type McpServerConfig, type McpTool } from "./mcp-client.server";
import type {
  CategoriaGranatum,
  CentroCustoGranatum,
  ContaGranatum,
  LancamentoGranatum,
} from "./tipos";

type IntegracaoRow = {
  id: string;
  url_mcp: string | null;
  transporte: "http" | "sse" | null;
  token_cifrado: string | null;
};

async function carregarIntegracao(empresaId: string): Promise<IntegracaoRow | null> {
  const { data } = await supabaseAdmin
    .from("integracoes_mcp")
    .select("id, url_mcp, transporte, token_cifrado")
    .eq("empresa_id", empresaId)
    .eq("provedor", "granatum")
    .maybeSingle();
  if (!data) return null;
  return { ...data, transporte: data.transporte as "http" | "sse" | null };
}

async function carregarFallback(
  empresaId: string,
): Promise<{ token: string; urlBase: string } | null> {
  const { data } = await supabaseAdmin
    .from("credenciais_fallback")
    .select("token_cifrado, url_base")
    .eq("empresa_id", empresaId)
    .eq("provedor", "granatum")
    .maybeSingle();
  if (!data?.token_cifrado || !data.url_base) return null;
  return { token: descriptografar(data.token_cifrado), urlBase: data.url_base };
}

async function carregarToolMapping(empresaId: string, funcao: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("tool_mapping")
    .select("tool_name")
    .eq("empresa_id", empresaId)
    .eq("provedor", "granatum")
    .eq("funcao", funcao)
    .maybeSingle();
  return data?.tool_name ?? null;
}

function configMcp(integracao: IntegracaoRow): McpServerConfig | null {
  if (!integracao.url_mcp || !integracao.transporte) return null;
  return {
    url: integracao.url_mcp,
    transporte: integracao.transporte,
    token: integracao.token_cifrado ? descriptografar(integracao.token_cifrado) : null,
  };
}

export async function testarConexaoGranatum(empresaId: string): Promise<{
  status: "conectado" | "erro";
  tools?: McpTool[] | undefined;
  erro?: string | undefined;
}> {
  const integracao = await carregarIntegracao(empresaId);
  const config = integracao ? configMcp(integracao) : null;

  const resultado = await (async () => {
    if (!config) return { status: "erro" as const, erro: "Servidor MCP não configurado" };
    try {
      const tools = await listarTools(config);
      return { status: "conectado" as const, tools };
    } catch (erro) {
      return { status: "erro" as const, erro: erro instanceof Error ? erro.message : String(erro) };
    }
  })();

  if (integracao) {
    await supabaseAdmin
      .from("integracoes_mcp")
      .update({
        status: resultado.status,
        ultimo_erro: resultado.status === "erro" ? resultado.erro : null,
        ultima_checagem: new Date().toISOString(),
      })
      .eq("id", integracao.id);
  }

  return resultado;
}

async function acesso(
  empresaId: string,
  funcao: string,
): Promise<{ mcp: McpServerConfig; tool: string } | null> {
  const integracao = await carregarIntegracao(empresaId);
  const config = integracao ? configMcp(integracao) : null;
  if (!config) return null;
  const tool = await carregarToolMapping(empresaId, funcao);
  if (!tool) return null;
  return { mcp: config, tool };
}

async function restFallback(empresaId: string): Promise<{ token: string; urlBase: string }> {
  const fallback = await carregarFallback(empresaId);
  if (!fallback) {
    throw new Error(
      "Nenhuma tool MCP mapeada e nenhuma credencial de fallback REST configurada para o Granatum.",
    );
  }
  return fallback;
}

// --- contas -----------------------------------------------------------

type ContaBruta = {
  id: number | string;
  descricao: string;
  ativo?: boolean;
  saldo?: string | number;
};

function normalizarConta(c: ContaBruta): ContaGranatum {
  const saldo = typeof c.saldo === "string" ? Number.parseFloat(c.saldo) : (c.saldo ?? 0);
  return { id: String(c.id), nome: c.descricao, saldo };
}

export async function listarContasGranatum(empresaId: string): Promise<ContaGranatum[]> {
  const via = await acesso(empresaId, "contas");
  const brutas = via
    ? await chamarTool<ContaBruta[]>(via.mcp, via.tool, { considerar_inativas: false })
    : await (async () => {
        const { token, urlBase } = await restFallback(empresaId);
        const resposta = await fetch(`${urlBase}/contas`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resposta.ok) throw new Error(`Granatum respondeu HTTP ${resposta.status}`);
        return (await resposta.json()) as ContaBruta[];
      })();

  return brutas.map(normalizarConta);
}

/** Saldo atual (em tempo real) de uma conta específica do Granatum. */
export async function buscarSaldoContaGranatum(
  empresaId: string,
  contaId: string,
): Promise<number> {
  const contas = await listarContasGranatum(empresaId);
  const conta = contas.find((c) => c.id === contaId);
  if (!conta) throw new Error("Conta do Granatum não encontrada — reconfigure em Integrações.");
  return conta.saldo;
}

// --- categorias ---------------------------------------------------------

type CategoriaBruta = {
  id: number | string;
  descricao: string;
  parent_id?: number | string | null;
  tipo_categoria_id: number;
  categorias_filhas?: CategoriaBruta[];
};

function tipoDeCategoria(tipoCategoriaId: number): "receita" | "despesa" | "mista" {
  if (tipoCategoriaId === 2) return "receita";
  if (tipoCategoriaId === 1) return "despesa";
  return "mista";
}

function achatarCategorias(
  nos: CategoriaBruta[],
  parentId: string | null,
  caminhoPai: string,
): CategoriaGranatum[] {
  const saida: CategoriaGranatum[] = [];
  for (const no of nos) {
    const caminho = caminhoPai ? `${caminhoPai} > ${no.descricao}` : no.descricao;
    saida.push({
      id: String(no.id),
      nome: no.descricao,
      parentId,
      tipo: tipoDeCategoria(no.tipo_categoria_id),
      caminho,
    });
    if (no.categorias_filhas?.length) {
      saida.push(...achatarCategorias(no.categorias_filhas, String(no.id), caminho));
    }
  }
  return saida;
}

export async function listarCategoriasGranatum(empresaId: string): Promise<CategoriaGranatum[]> {
  const via = await acesso(empresaId, "categorias");
  const raiz = via
    ? await chamarTool<CategoriaBruta[]>(via.mcp, via.tool, { considerar_inativos: false })
    : await (async () => {
        const { token, urlBase } = await restFallback(empresaId);
        const resposta = await fetch(`${urlBase}/categorias`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resposta.ok) throw new Error(`Granatum respondeu HTTP ${resposta.status}`);
        return (await resposta.json()) as CategoriaBruta[];
      })();

  return achatarCategorias(raiz, null, "");
}

// --- centros de custo -----------------------------------------------------

type CentroCustoBruto = {
  id: number | string;
  descricao: string;
  centros_custo_lucro_filhos?: CentroCustoBruto[];
};

function achatarCentros(
  nos: CentroCustoBruto[],
  parentId: string | null,
  caminhoPai: string,
): CentroCustoGranatum[] {
  const saida: CentroCustoGranatum[] = [];
  for (const no of nos) {
    const caminho = caminhoPai ? `${caminhoPai} > ${no.descricao}` : no.descricao;
    saida.push({ id: String(no.id), nome: no.descricao, parentId, caminho });
    if (no.centros_custo_lucro_filhos?.length) {
      saida.push(...achatarCentros(no.centros_custo_lucro_filhos, String(no.id), caminho));
    }
  }
  return saida;
}

export async function listarCentrosCustoGranatum(
  empresaId: string,
): Promise<CentroCustoGranatum[]> {
  const via = await acesso(empresaId, "centros_custo");
  const raiz = via
    ? await chamarTool<CentroCustoBruto[]>(via.mcp, via.tool, { considerar_inativos: false })
    : await (async () => {
        const { token, urlBase } = await restFallback(empresaId);
        const resposta = await fetch(`${urlBase}/centroscusto`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resposta.ok) throw new Error(`Granatum respondeu HTTP ${resposta.status}`);
        return (await resposta.json()) as CentroCustoBruto[];
      })();

  return achatarCentros(raiz, null, "");
}

// --- lançamentos ------------------------------------------------------

type LancamentoBruto = {
  id: number | string;
  categoria_id: number | string | null;
  centro_custo_lucro_id: number | string | null;
  descricao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  valor: string | number;
  identificador_externo: string | null;
};

function normalizarLancamento(l: LancamentoBruto): LancamentoGranatum | null {
  // Em aberto (a pagar/receber) também entra, pela data de vencimento — mesmo
  // critério do filtro de período da API no regime caixa (padrão): baixado
  // cai no período pela data de pagamento, em aberto pela de vencimento.
  const data = l.data_pagamento ?? l.data_vencimento;
  if (!data) return null;
  const valor = typeof l.valor === "string" ? Number.parseFloat(l.valor) : l.valor;
  return {
    id: String(l.id),
    data,
    pago: Boolean(l.data_pagamento),
    descricao: l.descricao,
    valor,
    tipo: valor < 0 ? "despesa" : "receita",
    categoriaId: l.categoria_id != null ? String(l.categoria_id) : null,
    centroCustoId: l.centro_custo_lucro_id != null ? String(l.centro_custo_lucro_id) : null,
    identificadorExterno: l.identificador_externo || null,
  };
}

/** Lista lançamentos já baixados (pagos/recebidos) da conta configurada, no período. */
export async function listarLancamentosGranatum(
  empresaId: string,
  contaId: string,
  dataInicio: string,
  dataFim: string,
): Promise<LancamentoGranatum[]> {
  const via = await acesso(empresaId, "lancamentos");
  const resultado: LancamentoGranatum[] = [];
  const limit = 500;
  let start = 0;

  if (via) {
    for (;;) {
      const pagina = await chamarTool<LancamentoBruto[]>(via.mcp, via.tool, {
        conta_id: Number(contaId),
        data_inicio: dataInicio,
        data_fim: dataFim,
        limit,
        start,
      });
      for (const l of pagina) {
        const norm = normalizarLancamento(l);
        if (norm) resultado.push(norm);
      }
      if (pagina.length < limit) break;
      start += limit;
    }
    return resultado;
  }

  const { token, urlBase } = await restFallback(empresaId);
  for (;;) {
    const url = new URL(`${urlBase}/lancamentos`);
    url.searchParams.set("conta_id", contaId);
    url.searchParams.set("data_inicio", dataInicio);
    url.searchParams.set("data_fim", dataFim);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("start", String(start));
    const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resposta.ok) throw new Error(`Granatum respondeu HTTP ${resposta.status}`);
    const pagina = (await resposta.json()) as LancamentoBruto[];
    for (const l of pagina) {
      const norm = normalizarLancamento(l);
      if (norm) resultado.push(norm);
    }
    if (pagina.length < limit) break;
    start += limit;
  }
  return resultado;
}

/**
 * Busca textual (server-side, via parâmetro `busca` da própria API do
 * Granatum) por lançamentos com descrição parecida, já baixados — usada para
 * aprender categoria/centro de custo de lançamentos históricos semelhantes.
 * Só funciona pelo caminho MCP (o fallback REST não garante busca livre);
 * falha em silêncio (retorna []) para nunca travar uma sugestão de IA.
 */
export async function buscarLancamentosSimilaresGranatum(
  empresaId: string,
  contaId: string,
  texto: string,
  limit = 20,
): Promise<LancamentoGranatum[]> {
  const via = await acesso(empresaId, "lancamentos");
  if (!via || !texto.trim()) return [];
  try {
    const linhas = await chamarTool<LancamentoBruto[]>(via.mcp, via.tool, {
      conta_id: Number(contaId),
      busca: texto,
      limit,
    });
    return linhas.map(normalizarLancamento).filter((l): l is LancamentoGranatum => l !== null);
  } catch {
    return [];
  }
}

export async function buscarLancamentoPorIdentificadorExterno(
  empresaId: string,
  contaId: string,
  identificadorExterno: string,
): Promise<LancamentoGranatum | null> {
  const via = await acesso(empresaId, "lancamentos");
  if (!via) return null;
  const linhas = await chamarTool<LancamentoBruto[]>(via.mcp, via.tool, {
    conta_id: Number(contaId),
    identificador_externo: identificadorExterno,
    limit: 1,
  });
  const primeira = linhas[0];
  if (!primeira) return null;
  return normalizarLancamento(primeira) ?? null;
}

export type NovoLancamentoGranatum = {
  descricao: string;
  contaId: string;
  categoriaId: string;
  centroCustoId?: string | null | undefined;
  valor: number; // negativo = despesa, positivo = receita
  data: string; // data do extrato — usada como vencimento, competência e pagamento
  identificadorExterno: string;
};

export async function criarLancamentoGranatum(
  empresaId: string,
  dados: NovoLancamentoGranatum,
): Promise<string> {
  const via = await acesso(empresaId, "criar_lancamento");
  const argumentos = {
    descricao: dados.descricao,
    conta_id: Number(dados.contaId),
    categoria_id: Number(dados.categoriaId),
    ...(dados.centroCustoId ? { centro_custo_lucro_id: Number(dados.centroCustoId) } : {}),
    valor: dados.valor,
    data_vencimento: dados.data,
    data_competencia: dados.data,
    data_pagamento: dados.data,
    pagamento_automatico: true,
    identificador_externo: dados.identificadorExterno,
  };

  if (via) {
    const criado = await chamarTool<{ id: number | string }>(via.mcp, via.tool, argumentos);
    return String(criado.id);
  }

  const { token, urlBase } = await restFallback(empresaId);
  const resposta = await fetch(`${urlBase}/lancamentos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(argumentos),
  });
  if (!resposta.ok)
    throw new Error(`Granatum respondeu HTTP ${resposta.status}: ${await resposta.text()}`);
  const criado = (await resposta.json()) as { id: number | string };
  return String(criado.id);
}

export type EdicaoLancamentoGranatum = {
  id: string;
  descricao?: string | undefined;
  categoriaId?: string | undefined;
  centroCustoId?: string | null | undefined;
  /** Preencher dá baixa (marca como pago/recebido) nesta data. */
  dataPagamento?: string | undefined;
};

export async function editarLancamentoGranatum(
  empresaId: string,
  dados: EdicaoLancamentoGranatum,
): Promise<void> {
  const via = await acesso(empresaId, "editar_lancamento");
  const argumentos = {
    id: Number(dados.id),
    ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
    ...(dados.categoriaId !== undefined ? { categoria_id: Number(dados.categoriaId) } : {}),
    ...(dados.centroCustoId !== undefined
      ? { centro_custo_lucro_id: dados.centroCustoId ? Number(dados.centroCustoId) : null }
      : {}),
    ...(dados.dataPagamento !== undefined ? { data_pagamento: dados.dataPagamento } : {}),
  };

  if (via) {
    await chamarTool(via.mcp, via.tool, argumentos);
    return;
  }

  const { token, urlBase } = await restFallback(empresaId);
  const resposta = await fetch(`${urlBase}/lancamentos/${dados.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(argumentos),
  });
  if (!resposta.ok)
    throw new Error(`Granatum respondeu HTTP ${resposta.status}: ${await resposta.text()}`);
}

export async function salvarIntegracaoGranatum(
  empresaId: string,
  dados: {
    nome: string;
    url_mcp: string;
    transporte: "http" | "sse";
    token?: string | undefined;
  },
): Promise<void> {
  const existente = await carregarIntegracao(empresaId);
  await supabaseAdmin.from("integracoes_mcp").upsert(
    {
      ...(existente ? { id: existente.id } : {}),
      empresa_id: empresaId,
      provedor: "granatum",
      nome: dados.nome,
      url_mcp: dados.url_mcp,
      transporte: dados.transporte,
      ...(dados.token ? { token_cifrado: criptografar(dados.token) } : {}),
      status: "nao_testado",
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "empresa_id,provedor" },
  );
}

export async function salvarFallbackGranatum(
  empresaId: string,
  dados: { token: string; urlBase: string },
): Promise<void> {
  await supabaseAdmin.from("credenciais_fallback").upsert(
    {
      empresa_id: empresaId,
      provedor: "granatum",
      token_cifrado: criptografar(dados.token),
      url_base: dados.urlBase,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "empresa_id,provedor" },
  );
}
