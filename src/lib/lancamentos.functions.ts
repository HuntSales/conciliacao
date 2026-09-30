import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireEmpresa } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buscarLancamentoPorIdentificadorExterno,
  criarLancamentoGranatum,
  editarLancamentoGranatum,
  listarContasGranatum,
  listarLancamentosGranatum,
} from "@/lib/mcp/granatum.server";
import { sugerirVarios, type SugestaoParaLancamento } from "@/lib/conciliacao.functions";
import { dividirEmParcelas } from "@/lib/parcelas";
import { somarDias, hojeIso } from "@/lib/format";

/**
 * Aba Lançamentos: lançar direto no Granatum, em qualquer conta (inclusive
 * bancos que não têm integração de extrato), a partir de uma frase falada ou
 * digitada. Independente da conciliação — não grava par nem mexe no que a
 * conciliação usa.
 */

async function garantirContaDaEmpresa(empresaId: string, contaId: string): Promise<void> {
  const contas = await listarContasGranatum(empresaId);
  if (!contas.some((c) => c.id === contaId)) {
    throw new Error("Conta não encontrada no Granatum — atualize a lista de contas.");
  }
}

/** Contas do Granatum da empresa, com saldo, e qual é a da conciliação (Asaas). */
export const listarContasLancamento = createServerFn({ method: "GET" })
  .middleware([requireEmpresa])
  .handler(async ({ context }) => {
    const [contas, { data: configurada }] = await Promise.all([
      listarContasGranatum(context.empresaId),
      supabaseAdmin
        .from("conta_granatum")
        .select("conta_id_granatum")
        .eq("empresa_id", context.empresaId)
        .maybeSingle(),
    ]);
    return { contas, contaConciliacaoId: configurada?.conta_id_granatum ?? null };
  });

const sugerirSchema = z.object({
  contaId: z.string(),
  descricao: z.string().min(1).max(500),
  valor: z.number(),
  tipo: z.enum(["receita", "despesa"]),
});

/** Mesma sugestão da conciliação (histórico → busca no Granatum → IA), usando a conta escolhida como histórico. */
export const sugerirParaLancamento = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => sugerirSchema.parse(d))
  .handler(async ({ data, context }): Promise<SugestaoParaLancamento> => {
    const r = await sugerirVarios(
      context.empresaId,
      [{ chave: "novo", descricao: data.descricao, valor: data.valor, tipo: data.tipo }],
      data.contaId,
    );
    return r["novo"] ?? { categoriaId: null, centroCustoId: null, origem: "nenhuma" };
  });

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodicidade = z.enum(["D7", "D15", "M1", "M2", "M3", "M6", "M12"]);

const criarSchema = z.object({
  contaId: z.string(),
  descricao: z.string().trim().min(1).max(500),
  /** Positivo — o sinal sai do tipo. No parcelado é o TOTAL da compra. */
  valor: z.number().positive(),
  tipo: z.enum(["receita", "despesa"]),
  /** Vencimento (único: também a data de pagamento; série: 1º vencimento). */
  data,
  /** Único: pago/recebido. Série: a 1ª ocorrência já paga. */
  pago: z.boolean(),
  categoriaId: z.string().min(1),
  centroCustoId: z.string().nullable().optional(),
  repeticao: z
    .discriminatedUnion("modo", [
      z.object({ modo: z.literal("unico") }),
      z.object({
        modo: z.literal("parcelado"),
        parcelas: z.number().int().min(2).max(120),
        periodicidade,
        /** Competência de todas as parcelas (orientação do Granatum). */
        dataCompra: data,
      }),
      z.object({
        modo: z.literal("recorrente"),
        periodicidade,
        /** null = sem fim (`infinito` no Granatum). */
        vezes: z.number().int().min(2).max(120).nullable(),
      }),
    ])
    .default({ modo: "unico" }),
  /**
   * Gerado no navegador uma vez por lançamento: se o "Salvar" for enviado
   * duas vezes (rede lenta, clique duplo), o segundo acha o primeiro no
   * Granatum pelo `identificador_externo` e não duplica.
   */
  idempotencia: z.string().uuid(),
});

export const criarLancamentoManual = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => criarSchema.parse(d))
  .handler(async ({ data, context }) => {
    await garantirContaDaEmpresa(context.empresaId, data.contaId);
    const identificadorExterno = `manual:${data.idempotencia}`;

    const existente = await buscarLancamentoPorIdentificadorExterno(
      context.empresaId,
      data.contaId,
      identificadorExterno,
    ).catch(() => null);
    if (existente) return { ok: true, granatumId: existente.id, duplicado: true, aviso: null };

    const total = data.tipo === "despesa" ? -data.valor : data.valor;
    const rep = data.repeticao;
    // Parcelado: o Granatum repete o mesmo valor em todas as parcelas, então
    // manda o valor da parcela e ajusta só a 1ª com a sobra dos centavos.
    const divisao = rep.modo === "parcelado" ? dividirEmParcelas(total, rep.parcelas) : null;

    const granatumId = await criarLancamentoGranatum(context.empresaId, {
      descricao: data.descricao,
      contaId: data.contaId,
      categoriaId: data.categoriaId,
      centroCustoId: data.centroCustoId ?? null,
      valor: divisao ? divisao.parcela : total,
      data: data.data,
      identificadorExterno,
      emAberto: !data.pago,
      ...(rep.modo === "parcelado"
        ? {
            repeticao: { periodicidade: rep.periodicidade, total: rep.parcelas },
            dataCompetencia: rep.dataCompra,
          }
        : rep.modo === "recorrente"
          ? {
              repeticao: { periodicidade: rep.periodicidade, total: rep.vezes },
              // Cada ocorrência na competência do próprio vencimento (com
              // competência fixa, uma série com N vezes repetiria a mesma).
              dataCompetencia: null,
            }
          : {}),
    });

    // O lançamento já existe: falhar aqui não pode virar erro (a pessoa
    // tentaria de novo). Só avisa pra ajustar à mão.
    let aviso: string | null = null;
    if (divisao && divisao.primeira !== divisao.parcela) {
      try {
        await editarLancamentoGranatum(context.empresaId, {
          id: granatumId,
          valor: divisao.primeira,
        });
      } catch {
        aviso = `Parcelas criadas, mas não consegui ajustar a 1ª para ${Math.abs(divisao.primeira).toFixed(2).replace(".", ",")} — ajuste no Granatum.`;
      }
    }

    await supabaseAdmin.from("log_alteracoes_granatum").insert({
      empresa_id: context.empresaId,
      lancamento_id: granatumId,
      antes: null,
      depois: {
        criadoEm: "lancamentos",
        contaId: data.contaId,
        descricao: data.descricao,
        valor: total,
        data: data.data,
        pago: data.pago,
        categoriaId: data.categoriaId,
        centroCustoId: data.centroCustoId ?? null,
        repeticao: rep,
      },
      usuario_id: context.userId ?? null,
    });

    return { ok: true, granatumId, duplicado: false, aviso };
  });

const recentesSchema = z.object({ contaId: z.string() });

/** Últimos lançamentos da conta (30 dias), pra conferir antes de lançar de novo. */
export const listarRecentesDaConta = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => recentesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const hoje = hojeIso();
    const lancamentos = await listarLancamentosGranatum(
      context.empresaId,
      data.contaId,
      somarDias(hoje, -30),
      somarDias(hoje, 30),
    );
    return lancamentos
      .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
      .slice(0, 15);
  });
