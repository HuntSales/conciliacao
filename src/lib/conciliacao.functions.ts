import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buscarExtratoAsaas } from "@/lib/mcp/asaas.server";
import {
  listarLancamentosGranatum,
  listarCategoriasGranatum,
  listarCentrosCustoGranatum,
  criarLancamentoGranatum,
  editarLancamentoGranatum,
  buscarLancamentosSimilaresGranatum,
} from "@/lib/mcp/granatum.server";
import {
  conciliar,
  similaridadeDescricao,
  type CandidatoAsaas,
  type CandidatoGranatum,
} from "@/lib/matching";
import { folhas } from "@/lib/hierarquia";
import { sugerirCategorizacao, iaConfigurada, type ExemploHistorico } from "@/lib/ia/openai.server";
import type { LancamentoAsaas, LancamentoGranatum } from "@/lib/mcp/tipos";

async function contaConfigurada(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("conta_granatum")
    .select("conta_id_granatum")
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.conta_id_granatum) {
    throw new Error(
      "Configure a conta do Granatum na aba Integrações antes de buscar lançamentos.",
    );
  }
  return data.conta_id_granatum;
}

export const listarCadastros = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [categorias, centrosCusto] = await Promise.all([
      listarCategoriasGranatum(),
      listarCentrosCustoGranatum(),
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => periodoSchema.parse(d))
  .handler(async ({ data }) => {
    const contaId = await contaConfigurada();

    const [asaas, granatum] = await Promise.all([
      buscarExtratoAsaas(data.dataInicio, data.dataFim),
      listarLancamentosGranatum(contaId, data.dataInicio, data.dataFim),
    ]);

    const asaasIds = new Set(asaas.map((a) => a.id));
    const granatumIds = new Set(granatum.map((g) => g.id));

    const { data: paresExistentes } = await supabaseAdmin
      .from("pares_conciliacao")
      .select("asaas_id, granatum_id, tipo")
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
            asaas_id: p.asaasId,
            granatum_id: p.granatumId,
            data: g?.data ?? data.dataInicio,
            valor: g?.valor ?? 0,
            tipo: "automatico" as const,
            usuario_id: userData.user?.id ?? null,
          };
        }),
        { onConflict: "asaas_id" },
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
      },
    };
  });

const confirmarParSchema = z.object({
  asaasId: z.string(),
  granatumId: z.string(),
  data: z.string(),
  valor: z.number(),
  tipo: z.enum(["automatico", "manual", "sugestao"]).default("manual"),
});

export const confirmarPar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => confirmarParSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("pares_conciliacao").upsert(
      {
        asaas_id: data.asaasId,
        granatum_id: data.granatumId,
        data: data.data,
        valor: data.valor,
        tipo: data.tipo,
        usuario_id: context.userId,
      },
      { onConflict: "asaas_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const desfazerParSchema = z.object({ asaasId: z.string() });

export const desfazerPar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => desfazerParSchema.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("pares_conciliacao")
      .delete()
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => editarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { antes, ...edicao } = data;

    try {
      await editarLancamentoGranatum(edicao);
    } catch (erro) {
      throw new Error(erro instanceof Error ? erro.message : "Falha ao editar no Granatum");
    }

    await supabaseAdmin.from("log_alteracoes_granatum").insert({
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
      .eq("granatum_id", data.id);

    return { ok: true };
  });

const criarASchema = z.object({
  asaasId: z.string(),
  data: z.string(),
  descricao: z.string().min(1),
  valor: z.number(),
  categoriaId: z.string(),
  centroCustoId: z.string().nullable().optional(),
});

export const criarLancamentoAPartirDoAsaas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => criarASchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: parExistente } = await supabaseAdmin
      .from("pares_conciliacao")
      .select("granatum_id")
      .eq("asaas_id", data.asaasId)
      .maybeSingle();
    if (parExistente) {
      throw new Error("Este lançamento do Asaas já está conciliado com um lançamento do Granatum.");
    }

    const { data: contaRow } = await supabaseAdmin
      .from("conta_granatum")
      .select("conta_id_granatum")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!contaRow?.conta_id_granatum)
      throw new Error("Configure a conta do Granatum em Integrações.");

    const granatumId = await criarLancamentoGranatum({
      descricao: data.descricao,
      contaId: contaRow.conta_id_granatum,
      categoriaId: data.categoriaId,
      centroCustoId: data.centroCustoId ?? null,
      valor: data.valor,
      data: data.data,
      identificadorExterno: data.asaasId,
    });

    await supabaseAdmin.from("pares_conciliacao").insert({
      asaas_id: data.asaasId,
      granatum_id: granatumId,
      data: data.data,
      valor: data.valor,
      tipo: "manual",
      usuario_id: context.userId,
      descricao: data.descricao,
      categoria_id: data.categoriaId,
      centro_custo_id: data.centroCustoId ?? null,
    });

    return { ok: true, granatumId };
  });

const sugerirSchema = z.object({
  descricao: z.string().min(1),
  valor: z.number(),
  tipo: z.enum(["receita", "despesa"]),
});

export type SugestaoParaLancamento = {
  categoriaId: string | null;
  centroCustoId: string | null;
  origem: "ia" | "historico" | "nenhuma";
};

export const sugerirParaLancamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sugerirSchema.parse(d))
  .handler(async ({ data }): Promise<SugestaoParaLancamento> => {
    const [categorias, centros] = await Promise.all([
      listarCategoriasGranatum(),
      listarCentrosCustoGranatum(),
    ]);
    const categoriasFolha = folhas(
      categorias.filter((c) => c.tipo === data.tipo || c.tipo === "mista"),
    );
    const centrosFolha = folhas(centros);
    const idsCategoriaValidos = new Set(categoriasFolha.map((c) => c.id));
    const idsCentroValidos = new Set(centrosFolha.map((c) => c.id));

    // Histórico local: o que este app já lançou/editou no Granatum.
    const { data: paresHistorico } = await supabaseAdmin
      .from("pares_conciliacao")
      .select("descricao, categoria_id, centro_custo_id")
      .not("categoria_id", "is", null)
      .order("criado_em", { ascending: false })
      .limit(300);

    const historicoLocal: ExemploHistorico[] = (paresHistorico ?? [])
      .filter(
        (p): p is { descricao: string; categoria_id: string; centro_custo_id: string | null } =>
          Boolean(p.descricao && p.categoria_id),
      )
      .map((p) => ({
        descricao: p.descricao,
        categoriaId: p.categoria_id,
        centroCustoId: p.centro_custo_id,
      }));

    // Histórico "ao vivo" no próprio Granatum (busca textual pela API deles),
    // best-effort — nunca trava a sugestão se a conta não estiver configurada
    // ou a busca falhar.
    let historicoRemoto: ExemploHistorico[] = [];
    try {
      const contaId = await contaConfigurada();
      const encontrados = await buscarLancamentosSimilaresGranatum(contaId, data.descricao, 20);
      historicoRemoto = encontrados
        .filter((l) => l.categoriaId)
        .map((l) => ({
          descricao: l.descricao,
          categoriaId: l.categoriaId as string,
          centroCustoId: l.centroCustoId,
        }));
    } catch {
      /* conta não configurada ainda — segue só com o histórico local */
    }

    const historicoCombinado = [...historicoLocal, ...historicoRemoto]
      .filter((h) => idsCategoriaValidos.has(h.categoriaId))
      .map((h) => ({ ...h, score: similaridadeDescricao(h.descricao, data.descricao) }))
      .sort((a, b) => b.score - a.score);

    if (await iaConfigurada()) {
      const sugestao = await sugerirCategorizacao({
        descricao: data.descricao,
        valor: data.valor,
        tipo: data.tipo,
        categorias: categoriasFolha.map((c) => ({ id: c.id, caminho: c.caminho })),
        centros: centrosFolha.map((c) => ({ id: c.id, caminho: c.caminho })),
        historico: historicoCombinado,
      });
      if (sugestao) {
        return {
          categoriaId: sugestao.categoriaId,
          centroCustoId:
            sugestao.centroCustoId && idsCentroValidos.has(sugestao.centroCustoId)
              ? sugestao.centroCustoId
              : null,
          origem: "ia",
        };
      }
    }

    const melhor = historicoCombinado[0];
    if (melhor && melhor.score > 0.15) {
      return {
        categoriaId: melhor.categoriaId,
        centroCustoId:
          melhor.centroCustoId && idsCentroValidos.has(melhor.centroCustoId)
            ? melhor.centroCustoId
            : null,
        origem: "historico",
      };
    }

    return { categoriaId: null, centroCustoId: null, origem: "nenhuma" };
  });
