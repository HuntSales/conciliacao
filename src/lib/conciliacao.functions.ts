import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireEmpresa } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buscarExtratoAsaas, buscarSaldoAsaas } from "@/lib/mcp/asaas.server";
import {
  listarLancamentosGranatum,
  listarCategoriasGranatum,
  listarCentrosCustoGranatum,
  criarLancamentoGranatum,
  editarLancamentoGranatum,
  buscarLancamentosSimilaresGranatum,
  buscarSaldoContaGranatum,
} from "@/lib/mcp/granatum.server";
import {
  conciliar,
  similaridadeDescricao,
  type CandidatoAsaas,
  type CandidatoGranatum,
} from "@/lib/matching";
import { folhas } from "@/lib/hierarquia";
import {
  sugerirCategorizacaoLote,
  iaConfigurada,
  type ExemploHistorico,
} from "@/lib/ia/openai.server";
import type { LancamentoAsaas, LancamentoGranatum } from "@/lib/mcp/tipos";

async function contaConfigurada(empresaId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("conta_granatum")
    .select("conta_id_granatum")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!data?.conta_id_granatum) {
    throw new Error(
      "Configure a conta do Granatum na aba Integrações antes de buscar lançamentos.",
    );
  }
  return data.conta_id_granatum;
}

export const listarCadastros = createServerFn({ method: "GET" })
  .middleware([requireEmpresa])
  .handler(async ({ context }) => {
    const [categorias, centrosCusto] = await Promise.all([
      listarCategoriasGranatum(context.empresaId),
      listarCentrosCustoGranatum(context.empresaId),
    ]);
    return { categorias, centrosCusto };
  });

const periodoSchema = z.object({
  dataInicio: z.string(),
  dataFim: z.string(),
  toleranciaDias: z.number().int().min(0).max(3).default(0),
});

export type ItemAsaas = LancamentoAsaas & {
  parGranatumId: string | null;
  tipoPar: "automatico" | "manual" | "sugestao" | null;
};

export type ItemGranatum = LancamentoGranatum & {
  parAsaasId: string | null;
  tipoPar: "automatico" | "manual" | "sugestao" | null;
};

export const buscarLancamentos = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => periodoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const empresaId = context.empresaId;
    const contaId = await contaConfigurada(empresaId);

    const [asaas, granatum, saldoAsaas, saldoGranatum] = await Promise.all([
      buscarExtratoAsaas(empresaId, data.dataInicio, data.dataFim),
      listarLancamentosGranatum(empresaId, contaId, data.dataInicio, data.dataFim),
      buscarSaldoAsaas(empresaId).catch(() => null),
      buscarSaldoContaGranatum(empresaId, contaId).catch(() => null),
    ]);

    const asaasIds = new Set(asaas.map((a) => a.id));
    const granatumIds = new Set(granatum.map((g) => g.id));

    const { data: paresExistentes } = await supabaseAdmin
      .from("pares_conciliacao")
      .select("asaas_id, granatum_id, tipo")
      .eq("empresa_id", empresaId)
      .or(
        `asaas_id.in.(${[...asaasIds].join(",") || '""'}),granatum_id.in.(${
          [...granatumIds].join(",") || '""'
        })`,
      );

    const paresPorAsaas = new Map<string, { granatumId: string; tipo: string }>();
    const paresPorGranatum = new Map<string, { asaasId: string; tipo: string }>();
    for (const p of paresExistentes ?? []) {
      paresPorAsaas.set(p.asaas_id, { granatumId: p.granatum_id, tipo: p.tipo });
      paresPorGranatum.set(p.granatum_id, { asaasId: p.asaas_id, tipo: p.tipo });
    }

    const asaasRestante = asaas.filter((a) => !paresPorAsaas.has(a.id));
    const granatumRestante = granatum.filter((g) => !paresPorGranatum.has(g.id));

    const candidatosAsaas: CandidatoAsaas[] = asaasRestante.map((a) => ({
      id: a.id,
      data: a.data,
      valor: a.valor,
      descricao: a.descricao,
    }));
    const candidatosGranatum: CandidatoGranatum[] = granatumRestante.map((g) => ({
      id: g.id,
      data: g.data,
      valor: g.valor,
      descricao: g.descricao,
    }));

    const resultado = conciliar(candidatosAsaas, candidatosGranatum, data.toleranciaDias);

    const novosAutomaticos = resultado.pares.filter((p) => p.tipo === "automatico");
    if (novosAutomaticos.length > 0) {
      const { data: userData } = await supabaseAdmin.auth.getUser();
      await supabaseAdmin.from("pares_conciliacao").upsert(
        novosAutomaticos.map((p) => {
          const g = granatum.find((x) => x.id === p.granatumId);
          return {
            empresa_id: empresaId,
            asaas_id: p.asaasId,
            granatum_id: p.granatumId,
            data: g?.data ?? data.dataInicio,
            valor: g?.valor ?? 0,
            tipo: "automatico" as const,
            usuario_id: userData.user?.id ?? null,
          };
        }),
        { onConflict: "empresa_id,asaas_id" },
      );
      for (const p of novosAutomaticos) {
        paresPorAsaas.set(p.asaasId, { granatumId: p.granatumId, tipo: "automatico" });
        paresPorGranatum.set(p.granatumId, { asaasId: p.asaasId, tipo: "automatico" });
      }
    }

    for (const p of resultado.pares.filter((x) => x.tipo === "sugestao")) {
      paresPorAsaas.set(p.asaasId, { granatumId: p.granatumId, tipo: "sugestao" });
      paresPorGranatum.set(p.granatumId, { asaasId: p.asaasId, tipo: "sugestao" });
    }

    const itensAsaas: ItemAsaas[] = asaas.map((a) => {
      const par = paresPorAsaas.get(a.id);
      return {
        ...a,
        parGranatumId: par?.granatumId ?? null,
        tipoPar: (par?.tipo as ItemAsaas["tipoPar"]) ?? null,
      };
    });
    const itensGranatum: ItemGranatum[] = granatum.map((g) => {
      const par = paresPorGranatum.get(g.id);
      return {
        ...g,
        parAsaasId: par?.asaasId ?? null,
        tipoPar: (par?.tipo as ItemGranatum["tipoPar"]) ?? null,
      };
    });

    return {
      asaas: itensAsaas,
      granatum: itensGranatum,
      resumo: {
        totalAsaas: asaas.reduce((s, a) => s + a.valor, 0),
        totalGranatum: granatum.reduce((s, g) => s + g.valor, 0),
        conciliadosAsaas: itensAsaas.filter((a) => a.tipoPar && a.tipoPar !== "sugestao").length,
        conciliadosGranatum: itensGranatum.filter((g) => g.tipoPar && g.tipoPar !== "sugestao")
          .length,
        pendentesAsaas: itensAsaas.filter((a) => !a.tipoPar || a.tipoPar === "sugestao").length,
        pendentesGranatum: itensGranatum.filter((g) => !g.tipoPar || g.tipoPar === "sugestao")
          .length,
        saldoAsaas,
        saldoGranatum,
        // Projeta o saldo do Granatum depois que os itens do Asaas ainda sem
        // nenhum lançamento no Granatum forem criados (sugestão já é um
        // lançamento real, só não confirmado — já está no saldo atual).
        saldoGranatumProjetado:
          saldoGranatum === null
            ? null
            : saldoGranatum + itensAsaas.filter((a) => !a.tipoPar).reduce((s, a) => s + a.valor, 0),
      },
    };
  });

const confirmarParSchema = z.object({
  asaasId: z.string(),
  granatumId: z.string(),
  data: z.string(),
  valor: z.number(),
  tipo: z.enum(["automatico", "manual", "sugestao"]).default("manual"),
  descricao: z.string().optional(),
  categoriaId: z.string().optional(),
  centroCustoId: z.string().nullable().optional(),
});

export const confirmarPar = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => confirmarParSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("pares_conciliacao").upsert(
      {
        empresa_id: context.empresaId,
        asaas_id: data.asaasId,
        granatum_id: data.granatumId,
        data: data.data,
        valor: data.valor,
        tipo: data.tipo,
        ...(data.descricao !== undefined ? { descricao: data.descricao } : {}),
        ...(data.categoriaId !== undefined ? { categoria_id: data.categoriaId } : {}),
        ...(data.centroCustoId !== undefined ? { centro_custo_id: data.centroCustoId } : {}),
        usuario_id: context.userId,
      },
      { onConflict: "empresa_id,asaas_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const desfazerParSchema = z.object({ asaasId: z.string() });

export const desfazerPar = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => desfazerParSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("pares_conciliacao")
      .delete()
      .eq("empresa_id", context.empresaId)
      .eq("asaas_id", data.asaasId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const editarSchema = z.object({
  id: z.string(),
  descricao: z.string().optional(),
  categoriaId: z.string().optional(),
  centroCustoId: z.string().nullable().optional(),
  // Estado exibido na tela antes da edição, para o log de auditoria.
  antes: z.object({
    descricao: z.string(),
    categoriaId: z.string().nullable(),
    centroCustoId: z.string().nullable(),
  }),
});

export const editarLancamento = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => editarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { antes, ...edicao } = data;

    try {
      await editarLancamentoGranatum(context.empresaId, edicao);
    } catch (erro) {
      throw new Error(erro instanceof Error ? erro.message : "Falha ao editar no Granatum");
    }

    await supabaseAdmin.from("log_alteracoes_granatum").insert({
      empresa_id: context.empresaId,
      lancamento_id: data.id,
      antes,
      depois: {
        descricao: data.descricao,
        categoriaId: data.categoriaId,
        centroCustoId: data.centroCustoId,
      },
      usuario_id: context.userId,
    });

    // Mantém o histórico local (usado para aprender e sugerir categorização
    // futura) em sincronia com a última edição, se este lançamento já for
    // parte de um par conciliado.
    await supabaseAdmin
      .from("pares_conciliacao")
      .update({
        ...(data.descricao !== undefined ? { descricao: data.descricao } : {}),
        ...(data.categoriaId !== undefined ? { categoria_id: data.categoriaId } : {}),
        ...(data.centroCustoId !== undefined ? { centro_custo_id: data.centroCustoId } : {}),
      })
      .eq("empresa_id", context.empresaId)
      .eq("granatum_id", data.id);

    return { ok: true };
  });

const itemParaCriarSchema = z.object({
  asaasId: z.string(),
  data: z.string(),
  descricao: z.string().min(1),
  valor: z.number(),
  categoriaId: z.string(),
  centroCustoId: z.string().nullable().optional(),
});

type ItemParaCriar = z.infer<typeof itemParaCriarSchema>;

/** Núcleo compartilhado entre a criação individual e a criação em lote. */
async function criarUmLancamentoAPartirDoAsaas(
  empresaId: string,
  item: ItemParaCriar,
  usuarioId: string | undefined,
): Promise<string> {
  const { data: parExistente } = await supabaseAdmin
    .from("pares_conciliacao")
    .select("granatum_id")
    .eq("empresa_id", empresaId)
    .eq("asaas_id", item.asaasId)
    .maybeSingle();
  if (parExistente) {
    throw new Error("Este lançamento do Asaas já está conciliado com um lançamento do Granatum.");
  }

  const { data: contaRow } = await supabaseAdmin
    .from("conta_granatum")
    .select("conta_id_granatum")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!contaRow?.conta_id_granatum)
    throw new Error("Configure a conta do Granatum em Integrações.");

  const granatumId = await criarLancamentoGranatum(empresaId, {
    descricao: item.descricao,
    contaId: contaRow.conta_id_granatum,
    categoriaId: item.categoriaId,
    centroCustoId: item.centroCustoId ?? null,
    valor: item.valor,
    data: item.data,
    identificadorExterno: item.asaasId,
  });

  await supabaseAdmin.from("pares_conciliacao").insert({
    empresa_id: empresaId,
    asaas_id: item.asaasId,
    granatum_id: granatumId,
    data: item.data,
    valor: item.valor,
    tipo: "manual",
    usuario_id: usuarioId ?? null,
    descricao: item.descricao,
    categoria_id: item.categoriaId,
    centro_custo_id: item.centroCustoId ?? null,
  });

  return granatumId;
}

export const criarLancamentoAPartirDoAsaas = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => itemParaCriarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const granatumId = await criarUmLancamentoAPartirDoAsaas(
      context.empresaId,
      data,
      context.userId,
    );
    return { ok: true, granatumId };
  });

const criarLoteSchema = z.object({
  itens: z
    .array(
      z.object({
        asaasId: z.string(),
        data: z.string(),
        descricao: z.string().min(1),
        valor: z.number(),
      }),
    )
    .min(1),
  categoriaId: z.string(),
  centroCustoId: z.string().nullable().optional(),
});

export type ResultadoLote = {
  asaasId: string;
  ok: boolean;
  erro?: string;
};

export const criarLoteAPartirDoAsaas = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => criarLoteSchema.parse(d))
  .handler(async ({ data, context }): Promise<ResultadoLote[]> => {
    const resultados: ResultadoLote[] = [];
    for (const item of data.itens) {
      try {
        await criarUmLancamentoAPartirDoAsaas(
          context.empresaId,
          {
            asaasId: item.asaasId,
            data: item.data,
            descricao: item.descricao,
            valor: item.valor,
            categoriaId: data.categoriaId,
            centroCustoId: data.centroCustoId ?? null,
          },
          context.userId,
        );
        resultados.push({ asaasId: item.asaasId, ok: true });
      } catch (erro) {
        resultados.push({
          asaasId: item.asaasId,
          ok: false,
          erro: erro instanceof Error ? erro.message : "Falha desconhecida",
        });
      }
    }
    return resultados;
  });

const itemSugestaoSchema = z.object({
  chave: z.string(),
  descricao: z.string().min(1),
  valor: z.number(),
  tipo: z.enum(["receita", "despesa"]),
});

type ItemSugestao = z.infer<typeof itemSugestaoSchema>;

export type SugestaoParaLancamento = {
  categoriaId: string | null;
  centroCustoId: string | null;
  origem: "ia" | "historico" | "nenhuma";
};

/**
 * A partir desta similaridade (Jaccard sobre tokens) o histórico é confiável
 * o bastante pra sugerir sozinho, sem gastar token com a IA.
 */
const LIMIAR_HISTORICO_FORTE = 0.5;
/** Sem IA configurada, aceita um histórico mais distante que isso. */
const LIMIAR_HISTORICO_FRACO = 0.15;
/** Janela do histórico do próprio Granatum carregado de uma vez (sem tokens). */
const DIAS_HISTORICO_GRANATUM = 180;

function chaveDescricao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Sugere categoria/centro para vários lançamentos, na ordem mais barata
 * primeiro: (1) histórico local + últimos meses do Granatum, carregados uma
 * vez só pra todo o lote; (2) busca textual no Granatum só pros que ainda não
 * tiveram um parecido forte; (3) IA, numa única chamada agrupada, só pro que
 * sobrou. Descrições repetidas no lote são resolvidas uma vez só.
 */
async function sugerirVarios(
  empresaId: string,
  itens: ItemSugestao[],
): Promise<Record<string, SugestaoParaLancamento>> {
  const hoje = new Date();
  const inicioHistorico = new Date(hoje.getTime() - DIAS_HISTORICO_GRANATUM * 86_400_000);
  const contaId = await contaConfigurada(empresaId).catch(() => null);

  const [categorias, centros, paresHistorico, lancamentosRecentes] = await Promise.all([
    listarCategoriasGranatum(empresaId),
    listarCentrosCustoGranatum(empresaId),
    // Histórico local: o que este app já lançou/editou no Granatum.
    supabaseAdmin
      .from("pares_conciliacao")
      .select("descricao, categoria_id, centro_custo_id")
      .eq("empresa_id", empresaId)
      .not("categoria_id", "is", null)
      .order("criado_em", { ascending: false })
      .limit(1000)
      .then((r) => r.data ?? []),
    // Histórico do próprio Granatum (inclusive o que foi lançado fora do app),
    // best-effort — nunca trava a sugestão se a busca falhar.
    contaId
      ? listarLancamentosGranatum(
          empresaId,
          contaId,
          inicioHistorico.toISOString().slice(0, 10),
          hoje.toISOString().slice(0, 10),
        ).catch(() => [])
      : Promise.resolve([]),
  ]);

  const centrosFolha = folhas(centros);
  const idsCentroValidos = new Set(centrosFolha.map((c) => c.id));
  const categoriasPorTipo = {
    receita: folhas(categorias.filter((c) => c.tipo === "receita" || c.tipo === "mista")),
    despesa: folhas(categorias.filter((c) => c.tipo === "despesa" || c.tipo === "mista")),
  };
  const idsCategoriaPorTipo = {
    receita: new Set(categoriasPorTipo.receita.map((c) => c.id)),
    despesa: new Set(categoriasPorTipo.despesa.map((c) => c.id)),
  };

  const historicoBase: ExemploHistorico[] = [
    ...paresHistorico
      .filter(
        (p): p is { descricao: string; categoria_id: string; centro_custo_id: string | null } =>
          Boolean(p.descricao && p.categoria_id),
      )
      .map((p) => ({
        descricao: p.descricao,
        categoriaId: p.categoria_id,
        centroCustoId: p.centro_custo_id,
      })),
    ...lancamentosRecentes
      .filter((l) => l.categoriaId)
      .map((l) => ({
        descricao: l.descricao,
        categoriaId: l.categoriaId as string,
        centroCustoId: l.centroCustoId,
      })),
  ];

  const ranquear = (item: ItemSugestao, historico: ExemploHistorico[]) =>
    historico
      .filter((h) => idsCategoriaPorTipo[item.tipo].has(h.categoriaId))
      .map((h) => ({ ...h, score: similaridadeDescricao(h.descricao, item.descricao) }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score);

  const deHistorico = (h: ExemploHistorico): SugestaoParaLancamento => ({
    categoriaId: h.categoriaId,
    centroCustoId:
      h.centroCustoId && idsCentroValidos.has(h.centroCustoId) ? h.centroCustoId : null,
    origem: "historico",
  });

  // Um representante por descrição+tipo — itens repetidos herdam a resposta.
  const grupos = new Map<string, { item: ItemSugestao; chaves: string[] }>();
  for (const item of itens) {
    const k = `${item.tipo}|${chaveDescricao(item.descricao)}`;
    const g = grupos.get(k);
    if (g) g.chaves.push(item.chave);
    else grupos.set(k, { item, chaves: [item.chave] });
  }

  const resolvidos = new Map<string, SugestaoParaLancamento>();
  const ranking = new Map<string, ReturnType<typeof ranquear>>();

  // (1) Histórico já carregado.
  for (const [k, { item }] of grupos) {
    const r = ranquear(item, historicoBase);
    ranking.set(k, r);
    if (r[0] && r[0].score >= LIMIAR_HISTORICO_FORTE) resolvidos.set(k, deHistorico(r[0]));
  }

  // (2) Busca textual no Granatum (sem tokens), só pros que ainda faltam —
  // pega lançamentos mais antigos que a janela carregada acima.
  if (contaId) {
    const pendentes = [...grupos].filter(([k]) => !resolvidos.has(k));
    const CONCORRENCIA = 4;
    for (let i = 0; i < pendentes.length; i += CONCORRENCIA) {
      await Promise.all(
        pendentes.slice(i, i + CONCORRENCIA).map(async ([k, { item }]) => {
          const encontrados = await buscarLancamentosSimilaresGranatum(
            empresaId,
            contaId,
            item.descricao,
            20,
          );
          const extras: ExemploHistorico[] = encontrados
            .filter((l) => l.categoriaId)
            .map((l) => ({
              descricao: l.descricao,
              categoriaId: l.categoriaId as string,
              centroCustoId: l.centroCustoId,
            }));
          if (extras.length === 0) return;
          const r = [...(ranking.get(k) ?? []), ...ranquear(item, extras)].sort(
            (a, b) => b.score - a.score,
          );
          ranking.set(k, r);
          if (r[0] && r[0].score >= LIMIAR_HISTORICO_FORTE) resolvidos.set(k, deHistorico(r[0]));
        }),
      );
    }
  }

  // (3) IA só pro que sobrou, numa chamada agrupada.
  const paraIA = [...grupos].filter(([k]) => !resolvidos.has(k));
  if (paraIA.length > 0 && (await iaConfigurada(empresaId))) {
    const tiposPresentes = new Set(paraIA.map(([, g]) => g.item.tipo));
    const categoriasIA = new Map<string, { id: string; caminho: string }>();
    for (const tipo of tiposPresentes) {
      for (const c of categoriasPorTipo[tipo])
        categoriasIA.set(c.id, { id: c.id, caminho: c.caminho });
    }
    const respostas = await sugerirCategorizacaoLote(empresaId, {
      itens: paraIA.map(([k, { item }]) => ({
        chave: k,
        descricao: item.descricao,
        valor: item.valor,
        tipo: item.tipo,
        exemplos: ranking.get(k) ?? [],
      })),
      categorias: [...categoriasIA.values()],
      centros: centrosFolha.map((c) => ({ id: c.id, caminho: c.caminho })),
    });
    for (const [k, { item }] of paraIA) {
      const s = respostas.get(k);
      // A lista enviada junta receita+despesa quando o lote mistura os dois —
      // descarta categoria de tipo incompatível com o item.
      if (!s?.categoriaId || !idsCategoriaPorTipo[item.tipo].has(s.categoriaId)) continue;
      resolvidos.set(k, {
        categoriaId: s.categoriaId,
        centroCustoId:
          s.centroCustoId && idsCentroValidos.has(s.centroCustoId) ? s.centroCustoId : null,
        origem: "ia",
      });
    }
  }

  // Sem IA (ou IA sem resposta): aceita um histórico mais distante.
  for (const [k] of grupos) {
    if (resolvidos.has(k)) continue;
    const melhor = ranking.get(k)?.[0];
    if (melhor && melhor.score > LIMIAR_HISTORICO_FRACO) resolvidos.set(k, deHistorico(melhor));
  }

  const saida: Record<string, SugestaoParaLancamento> = {};
  for (const [k, { chaves }] of grupos) {
    const s = resolvidos.get(k) ?? { categoriaId: null, centroCustoId: null, origem: "nenhuma" };
    for (const chave of chaves) saida[chave] = s;
  }
  return saida;
}

const sugerirLoteSchema = z.object({
  itens: z.array(itemSugestaoSchema).min(1).max(500),
});

/**
 * Sugestões de todos os pendentes da tela de uma vez, chamada logo depois da
 * busca — os campos já aparecem preenchidos nos cards, sem abrir diálogo.
 */
export const sugerirEmLote = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => sugerirLoteSchema.parse(d))
  .handler(async ({ data, context }) => sugerirVarios(context.empresaId, data.itens));
