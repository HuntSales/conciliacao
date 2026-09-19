import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { criptografar, descriptografar } from "@/lib/crypto.server";

export type ExemploHistorico = {
  descricao: string;
  categoriaId: string;
  centroCustoId: string | null;
};

export type CandidatoOpcao = { id: string; caminho: string };

export type SugestaoCategorizacao = {
  categoriaId: string | null;
  centroCustoId: string | null;
};

async function carregarConfig(
  empresaId: string,
): Promise<{ token: string; modelo: string } | null> {
  const { data } = await supabaseAdmin
    .from("integracoes_ia")
    .select("token_cifrado, modelo")
    .eq("empresa_id", empresaId)
    .eq("provedor", "openai")
    .maybeSingle();
  if (!data?.token_cifrado || !data.modelo) return null;
  return { token: descriptografar(data.token_cifrado), modelo: data.modelo };
}

export async function iaConfigurada(empresaId: string): Promise<boolean> {
  return (await carregarConfig(empresaId)) !== null;
}

export async function salvarIntegracaoIA(
  empresaId: string,
  dados: { token?: string | undefined; modelo: string },
): Promise<void> {
  const { data: existente } = await supabaseAdmin
    .from("integracoes_ia")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("provedor", "openai")
    .maybeSingle();

  await supabaseAdmin.from("integracoes_ia").upsert(
    {
      ...(existente ? { id: existente.id } : {}),
      empresa_id: empresaId,
      provedor: "openai",
      modelo: dados.modelo,
      ...(dados.token ? { token_cifrado: criptografar(dados.token) } : {}),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "empresa_id,provedor" },
  );
}

/**
 * Pede pro modelo escolher a melhor categoria/centro de custo dentre as
 * opções REAIS já cadastradas no Granatum (nunca inventa uma nova — o schema
 * JSON restringe a resposta a um enum com só os ids recebidos).
 */
export async function sugerirCategorizacao(
  empresaId: string,
  args: {
    descricao: string;
    valor: number;
    tipo: "receita" | "despesa";
    categorias: CandidatoOpcao[];
    centros: CandidatoOpcao[];
    historico: ExemploHistorico[];
  },
): Promise<SugestaoCategorizacao | null> {
  const config = await carregarConfig(empresaId);
  if (!config) return null;
  if (args.categorias.length === 0) return null;

  const categoriaIds = args.categorias.map((c) => c.id);
  const centroIds = args.centros.map((c) => c.id);

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      categoria_id: { type: ["string", "null"], enum: [...categoriaIds, null] },
      centro_custo_id: { type: ["string", "null"], enum: [...centroIds, null] },
    },
    required: ["categoria_id", "centro_custo_id"],
  };

  const listaCategorias = args.categorias.map((c) => `${c.id} :: ${c.caminho}`).join("\n");
  const listaCentros = args.centros.map((c) => `${c.id} :: ${c.caminho}`).join("\n");
  const exemplos = args.historico
    .slice(0, 8)
    .map(
      (h) =>
        `- descrição: "${h.descricao}" -> categoria_id: ${h.categoriaId}, centro_custo_id: ${
          h.centroCustoId ?? "null"
        }`,
    )
    .join("\n");

  const prompt = `Você categoriza lançamentos financeiros de uma empresa no sistema Granatum.
Escolha a categoria e o centro de custo mais adequados para o lançamento abaixo,
usando **exclusivamente** um dos ids listados (nunca invente um id novo; se
nenhuma opção fizer sentido, responda null).

Lançamento a categorizar:
- descrição: "${args.descricao}"
- valor: ${args.valor}
- tipo: ${args.tipo}

Categorias disponíveis (id :: caminho completo):
${listaCategorias}

Centros de custo disponíveis (id :: caminho completo):
${listaCentros}
${exemplos ? `\nLançamentos parecidos já categorizados anteriormente:\n${exemplos}` : ""}`;

  let resposta: Response;
  try {
    resposta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        model: config.modelo,
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "sugestao_categorizacao", strict: true, schema },
        },
      }),
    });
  } catch {
    return null; // falha de rede não pode travar o fluxo de criação do lançamento
  }

  if (!resposta.ok) {
    console.error("[IA] OpenAI respondeu erro:", resposta.status, await resposta.text());
    return null;
  }

  try {
    const corpo = (await resposta.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const texto = corpo.choices?.[0]?.message?.content;
    if (!texto) return null;
    const json = JSON.parse(texto) as {
      categoria_id: string | null;
      centro_custo_id: string | null;
    };
    return { categoriaId: json.categoria_id, centroCustoId: json.centro_custo_id };
  } catch (erro) {
    console.error("[IA] falha ao interpretar resposta da OpenAI:", erro);
    return null;
  }
}
