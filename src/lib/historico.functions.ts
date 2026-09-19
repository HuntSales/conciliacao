import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireEmpresa } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const periodoSchema = z.object({ dataInicio: z.string(), dataFim: z.string() });

export const listarHistoricoConciliacoes = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => periodoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: pares, error } = await supabaseAdmin
      .from("pares_conciliacao")
      .select("id, asaas_id, granatum_id, data, valor, tipo, criado_em")
      .eq("empresa_id", context.empresaId)
      .gte("data", data.dataInicio)
      .lte("data", data.dataFim)
      .order("data", { ascending: false });
    if (error) throw new Error(error.message);
    return pares ?? [];
  });

export const listarHistoricoAlteracoes = createServerFn({ method: "POST" })
  .middleware([requireEmpresa])
  .inputValidator((d: unknown) => periodoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: logs, error } = await supabaseAdmin
      .from("log_alteracoes_granatum")
      .select("id, lancamento_id, antes, depois, criado_em")
      .eq("empresa_id", context.empresaId)
      .gte("criado_em", `${data.dataInicio}T00:00:00`)
      .lte("criado_em", `${data.dataFim}T23:59:59`)
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return logs ?? [];
  });
