import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { criptografar, descriptografar } from "@/lib/crypto.server";
import { listarTools, chamarTool, type McpServerConfig, type McpTool } from "./mcp-client.server";
import type { LancamentoAsaas } from "./tipos";

const BASE_URL: Record<"producao" | "sandbox", string> = {
  producao: "https://api.asaas.com/v3",
  sandbox: "https://sandbox.asaas.com/api/v3",
};

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
    .eq("provedor", "asaas")
    .maybeSingle();
  if (!data) return null;
  return { ...data, transporte: data.transporte as "http" | "sse" | null };
}

async function carregarFallback(empresaId: string): Promise<{
  token: string;
  ambiente: "producao" | "sandbox";
} | null> {
  const { data } = await supabaseAdmin
    .from("credenciais_fallback")
    .select("token_cifrado, ambiente")
    .eq("empresa_id", empresaId)
    .eq("provedor", "asaas")
    .maybeSingle();
  if (!data?.token_cifrado) return null;
  return {
    token: descriptografar(data.token_cifrado),
    ambiente: (data.ambiente as "producao" | "sandbox") ?? "producao",
  };
}

async function carregarToolMapping(empresaId: string, funcao: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("tool_mapping")
    .select("tool_name")
    .eq("empresa_id", empresaId)
    .eq("provedor", "asaas")
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

export async function testarConexaoAsaas(empresaId: string): Promise<{
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

type ExtratoBrutoAsaas = {
  data: Array<{ id: string; date: string; description: string; value: number }>;
  hasMore: boolean;
  limit: number;
  offset: number;
};

function normalizarTransacao(t: {
  id: string;
  date: string;
  description: string;
  value: number;
}): LancamentoAsaas {
  return {
    id: t.id,
    data: t.date,
    descricao: t.description,
    valor: t.value,
    tipo: t.value < 0 ? "despesa" : "receita",
  };
}

async function buscarPaginaViaMcp(
  config: McpServerConfig,
  toolName: string,
  dataInicio: string,
  dataFim: string,
  offset: number,
): Promise<ExtratoBrutoAsaas> {
  return chamarTool<ExtratoBrutoAsaas>(config, toolName, {
    startDate: dataInicio,
    finishDate: dataFim,
    limit: 100,
    offset,
  });
}

async function buscarPaginaViaRest(
  token: string,
  ambiente: "producao" | "sandbox",
  dataInicio: string,
  dataFim: string,
  offset: number,
): Promise<ExtratoBrutoAsaas> {
  const url = new URL(`${BASE_URL[ambiente]}/financialTransactions`);
  url.searchParams.set("startDate", dataInicio);
  url.searchParams.set("finishDate", dataFim);
  url.searchParams.set("limit", "100");
  url.searchParams.set("offset", String(offset));

  const resposta = await fetch(url, { headers: { access_token: token } });
  if (!resposta.ok) {
    throw new Error(`Asaas respondeu HTTP ${resposta.status}: ${await resposta.text()}`);
  }
  return (await resposta.json()) as ExtratoBrutoAsaas;
}

/** Busca o extrato completo do período, paginando os dois lados (MCP ou REST). */
export async function buscarExtratoAsaas(
  empresaId: string,
  dataInicio: string,
  dataFim: string,
): Promise<LancamentoAsaas[]> {
  const integracao = await carregarIntegracao(empresaId);
  const config = integracao ? configMcp(integracao) : null;
  const toolExtrato = config ? await carregarToolMapping(empresaId, "extrato") : null;

  const resultado: LancamentoAsaas[] = [];
  let offset = 0;

  if (config && toolExtrato) {
    for (;;) {
      const pagina = await buscarPaginaViaMcp(config, toolExtrato, dataInicio, dataFim, offset);
      resultado.push(...pagina.data.map(normalizarTransacao));
      if (!pagina.hasMore || pagina.data.length === 0) break;
      offset += pagina.limit || 100;
    }
    return resultado;
  }

  const fallback = await carregarFallback(empresaId);
  if (!fallback) {
    throw new Error(
      "Nenhuma tool MCP mapeada para 'extrato' e nenhuma credencial de fallback REST configurada para o Asaas.",
    );
  }

  for (;;) {
    const pagina = await buscarPaginaViaRest(
      fallback.token,
      fallback.ambiente,
      dataInicio,
      dataFim,
      offset,
    );
    resultado.push(...pagina.data.map(normalizarTransacao));
    if (!pagina.hasMore || pagina.data.length === 0) break;
    offset += pagina.limit || 100;
  }
  return resultado;
}

/** Saldo atual (em tempo real) da conta Asaas. */
export async function buscarSaldoAsaas(empresaId: string): Promise<number> {
  const integracao = await carregarIntegracao(empresaId);
  const config = integracao ? configMcp(integracao) : null;
  const toolSaldo = config ? await carregarToolMapping(empresaId, "saldo") : null;

  if (config && toolSaldo) {
    const resultado = await chamarTool<{ balance: number }>(config, toolSaldo, {});
    return resultado.balance;
  }

  const fallback = await carregarFallback(empresaId);
  if (!fallback) {
    throw new Error(
      "Nenhuma tool MCP mapeada para 'saldo' e nenhuma credencial de fallback REST configurada para o Asaas.",
    );
  }
  const resposta = await fetch(`${BASE_URL[fallback.ambiente]}/finance/balance`, {
    headers: { access_token: fallback.token },
  });
  if (!resposta.ok) {
    throw new Error(`Asaas respondeu HTTP ${resposta.status}: ${await resposta.text()}`);
  }
  const corpo = (await resposta.json()) as { balance: number };
  return corpo.balance;
}

export async function salvarIntegracaoAsaas(
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
      provedor: "asaas",
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

export async function salvarFallbackAsaas(
  empresaId: string,
  dados: { token: string; ambiente: "producao" | "sandbox" },
): Promise<void> {
  await supabaseAdmin.from("credenciais_fallback").upsert(
    {
      empresa_id: empresaId,
      provedor: "asaas",
      token_cifrado: criptografar(dados.token),
      ambiente: dados.ambiente,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "empresa_id,provedor" },
  );
}
