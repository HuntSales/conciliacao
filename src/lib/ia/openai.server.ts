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

export type ItemParaCategorizar = {
  chave: string;
  descricao: string;
  valor: number;
  tipo: "receita" | "despesa";
  /** Lançamentos parecidos já categorizados, mais parecidos primeiro. */
  exemplos: ExemploHistorico[];
};

/** Quantos itens vão numa única chamada — a lista de categorias/centros vai uma vez só. */
const ITENS_POR_CHAMADA = 20;

/**
 * Pede pro modelo escolher a melhor categoria/centro de custo de vários
 * lançamentos de uma vez, dentre as opções REAIS já cadastradas no Granatum
 * (nunca inventa uma nova — o schema JSON restringe a resposta a um enum com
 * só os ids recebidos). Agrupar economiza tokens: a lista de categorias e
 * centros, que é a maior parte do prompt, vai uma vez por lote e não uma vez
 * por lançamento. Devolve só as chaves que o modelo respondeu; falha de
 * rede/API devolve mapa vazio (a sugestão é sempre best-effort).
 */
export async function sugerirCategorizacaoLote(
  empresaId: string,
  args: {
    itens: ItemParaCategorizar[];
    categorias: CandidatoOpcao[];
    centros: CandidatoOpcao[];
  },
): Promise<Map<string, SugestaoCategorizacao>> {
  const resultado = new Map<string, SugestaoCategorizacao>();
  const config = await carregarConfig(empresaId);
  if (!config || args.categorias.length === 0 || args.itens.length === 0) return resultado;

  for (let i = 0; i < args.itens.length; i += ITENS_POR_CHAMADA) {
    const parte = args.itens.slice(i, i + ITENS_POR_CHAMADA);
    const respostas = await chamarOpenAI(config, parte, args.categorias, args.centros);
    for (const [chave, sugestao] of respostas) resultado.set(chave, sugestao);
  }
  return resultado;
}

async function chamarOpenAI(
  config: { token: string; modelo: string },
  itens: ItemParaCategorizar[],
  categorias: CandidatoOpcao[],
  centros: CandidatoOpcao[],
): Promise<Map<string, SugestaoCategorizacao>> {
  const resultado = new Map<string, SugestaoCategorizacao>();
  // Índice curto (0, 1, 2…) em vez da chave real: menos tokens e o enum
  // garante que o modelo só responda itens que existem.
  const indices = itens.map((_, i) => String(i));

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      sugestoes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            item: { type: "string", enum: indices },
            categoria_id: {
              type: ["string", "null"],
              enum: [...categorias.map((c) => c.id), null],
            },
            centro_custo_id: {
              type: ["string", "null"],
              enum: [...centros.map((c) => c.id), null],
            },
          },
          required: ["item", "categoria_id", "centro_custo_id"],
        },
      },
    },
    required: ["sugestoes"],
  };

  const listaCategorias = categorias.map((c) => `${c.id} :: ${c.caminho}`).join("\n");
  const listaCentros = centros.map((c) => `${c.id} :: ${c.caminho}`).join("\n");
  const listaItens = itens
    .map((item, i) => {
      const exemplos = item.exemplos
        .slice(0, 5)
        .map(
          (h) =>
            `    - "${h.descricao}" -> categoria_id: ${h.categoriaId}, centro_custo_id: ${
              h.centroCustoId ?? "null"
            }`,
        )
        .join("\n");
      return `[${i}] descrição: "${item.descricao}" | valor: ${item.valor} | tipo: ${item.tipo}${
        exemplos ? `\n  parecidos já categorizados:\n${exemplos}` : ""
      }`;
    })
    .join("\n");

  const prompt = `Você categoriza lançamentos financeiros de uma empresa no sistema Granatum.
Para cada lançamento abaixo, escolha a categoria e o centro de custo mais
adequados usando **exclusivamente** um dos ids listados (nunca invente um id
novo; se nenhuma opção fizer sentido, responda null). A categoria precisa ser
compatível com o tipo (receita/despesa) do lançamento. Responda um item por
lançamento, usando o número entre colchetes como "item".

Lançamentos a categorizar:
${listaItens}

Categorias disponíveis (id :: caminho completo):
${listaCategorias}

Centros de custo disponíveis (id :: caminho completo):
${listaCentros}`;

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
          json_schema: { name: "sugestoes_categorizacao", strict: true, schema },
        },
      }),
    });
  } catch {
    return resultado; // falha de rede não pode travar o fluxo de criação do lançamento
  }

  if (!resposta.ok) {
    console.error("[IA] OpenAI respondeu erro:", resposta.status, await resposta.text());
    return resultado;
  }

  try {
    const corpo = (await resposta.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const texto = corpo.choices?.[0]?.message?.content;
    if (!texto) return resultado;
    const json = JSON.parse(texto) as {
      sugestoes: Array<{
        item: string;
        categoria_id: string | null;
        centro_custo_id: string | null;
      }>;
    };
    for (const s of json.sugestoes) {
      const item = itens[Number(s.item)];
      if (!item) continue;
      resultado.set(item.chave, { categoriaId: s.categoria_id, centroCustoId: s.centro_custo_id });
    }
  } catch (erro) {
    console.error("[IA] falha ao interpretar resposta da OpenAI:", erro);
  }
  return resultado;
}
