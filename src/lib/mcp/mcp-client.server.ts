// Cliente MCP genérico: fala JSON-RPC 2.0 com um servidor MCP remoto (HTTP ou SSE),
// para as duas únicas operações que este app precisa: `tools/list` e `tools/call`.

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpServerConfig = {
  url: string;
  transporte: "http" | "sse";
  token?: string | null;
};

type JsonRpcResposta<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

let proximoId = 1;

function extrairJsonDoSse(texto: string): unknown {
  const linha = texto
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .filter(Boolean)
    .pop();
  if (!linha) throw new Error("MCP (SSE): resposta sem evento 'data'");
  return JSON.parse(linha);
}

async function chamarRpc<T>(config: McpServerConfig, method: string, params?: unknown): Promise<T> {
  const corpo = { jsonrpc: "2.0" as const, id: proximoId++, method, params };
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (config.token) headers["authorization"] = `Bearer ${config.token}`;

  let resposta: Response;
  try {
    resposta = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(corpo),
    });
  } catch (erro) {
    throw new Error(
      `Falha de rede ao chamar MCP: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }

  const texto = await resposta.text();
  if (!resposta.ok) {
    throw new Error(`MCP respondeu HTTP ${resposta.status}: ${texto.slice(0, 500)}`);
  }

  const tipo = resposta.headers.get("content-type") ?? "";
  let json: unknown;
  try {
    json = tipo.includes("text/event-stream") ? extrairJsonDoSse(texto) : JSON.parse(texto);
  } catch {
    throw new Error(`MCP respondeu corpo inválido: ${texto.slice(0, 300)}`);
  }

  const rpc = json as JsonRpcResposta<T>;
  if (rpc.error) throw new Error(`MCP erro ${rpc.error.code}: ${rpc.error.message}`);
  if (rpc.result === undefined) throw new Error("MCP: resposta sem campo 'result'");
  return rpc.result;
}

export async function listarTools(config: McpServerConfig): Promise<McpTool[]> {
  await chamarRpc(config, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "conciliacao-asaas-granatum", version: "1.0.0" },
  }).catch(() => undefined);

  const resultado = await chamarRpc<{ tools?: McpTool[] }>(config, "tools/list");
  return resultado.tools ?? [];
}

export async function chamarTool<T = unknown>(
  config: McpServerConfig,
  nome: string,
  argumentos: Record<string, unknown>,
): Promise<T> {
  const resultado = await chamarRpc<{
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }>(config, "tools/call", { name: nome, arguments: argumentos });

  if (resultado.isError) {
    const mensagem =
      resultado.content
        ?.map((c) => c.text)
        .filter(Boolean)
        .join("\n") || `Falha ao chamar a tool ${nome}`;
    throw new Error(mensagem);
  }

  const textoBruto = resultado.content?.find((c) => c.type === "text")?.text;
  if (textoBruto === undefined) return resultado as unknown as T;
  try {
    return JSON.parse(textoBruto) as T;
  } catch {
    return textoBruto as unknown as T;
  }
}
