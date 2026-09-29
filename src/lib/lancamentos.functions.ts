import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireEmpresa } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buscarLancamentoPorIdentificadorExterno,
  criarLancamentoGranatum,
  listarContasGranatum,
  listarLancamentosGranatum,
} from "@/lib/mcp/granatum.server";
import { sugerirVarios, type SugestaoParaLancamento } from "@/lib/conciliacao.functions";
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

const criarSchema = z.object({
  contaId: z.string(),
  descricao: z.string().trim().min(1).max(500),
  /** Positivo — o sinal sai do tipo. */
  valor: z.number().positive(),
  tipo: z.enum(["receita", "despesa"]),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pago: z.boolean(),
  categoriaId: z.string().min(1),
  centroCustoId: z.string().nullable().optional(),
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
    if (existente) return { ok: true, granatumId: existente.id, duplicado: true };

    const valor = data.tipo === "despesa" ? -data.valor : data.valor;
    const granatumId = await criarLancamentoGranatum(context.empresaId, {
      descricao: data.descricao,
      contaId: data.contaId,
      categoriaId: data.categoriaId,
      centroCustoId: data.centroCustoId ?? null,
      valor,
      data: data.data,
      identificadorExterno,
      emAberto: !data.pago,
    });

    await supabaseAdmin.from("log_alteracoes_granatum").insert({
      empresa_id: context.empresaId,
      lancamento_id: granatumId,
      antes: null,
      depois: {
        criadoEm: "lancamentos",
        contaId: data.contaId,
        descricao: data.descricao,
        valor,
        data: data.data,
        pago: data.pago,
        categoriaId: data.categoriaId,
        centroCustoId: data.centroCustoId ?? null,
      },
      usuario_id: context.userId ?? null,
    });

    return { ok: true, granatumId, duplicado: false };
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
