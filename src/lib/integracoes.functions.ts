import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mascarar } from "@/lib/crypto.server";
import type { FuncaoIntegracao, Provedor } from "@/lib/mcp/tipos";
import {
  testarConexaoAsaas,
  salvarIntegracaoAsaas,
  salvarFallbackAsaas,
} from "@/lib/mcp/asaas.server";
import {
  testarConexaoGranatum,
  salvarIntegracaoGranatum,
  salvarFallbackGranatum,
  listarContasGranatum,
} from "@/lib/mcp/granatum.server";
import { salvarIntegracaoIA as salvarIntegracaoIAInterno } from "@/lib/ia/openai.server";

const FUNCOES: FuncaoIntegracao[] = [
  "saldo",
  "extrato",
  "lancamentos",
  "categorias",
  "centros_custo",
  "contas",
  "criar_lancamento",
  "editar_lancamento",
];

const PADROES: Record<FuncaoIntegracao, RegExp> = {
  // Antes de "contas": "recuperar_saldo_da_conta" também termina em "conta" e
  // não pode ser confundida com a tool de listar contas.
  saldo: /saldo/i,
  extrato: /extrato/i,
  lancamentos: /listar.*lancamento|lancamentos$/i,
  categorias: /categoria/i,
  centros_custo: /centro.*custo/i,
  contas: /contas?$/i,
  criar_lancamento: /criar.*lancamento/i,
  editar_lancamento: /editar.*lancamento|atualizar.*lancamento/i,
};

function detectarFuncao(nomeTool: string): FuncaoIntegracao | null {
  for (const funcao of FUNCOES) {
    if (PADROES[funcao].test(nomeTool)) return funcao;
  }
  return null;
}

async function autoDetectarMapeamento(provedor: Provedor, toolNames: string[]) {
  const { data: existentes } = await supabaseAdmin
    .from("tool_mapping")
    .select("funcao")
    .eq("provedor", provedor);
  const jaMapeadas = new Set((existentes ?? []).map((e) => e.funcao));

  const detectados = new Map<FuncaoIntegracao, string>();
  for (const nome of toolNames) {
    const funcao = detectarFuncao(nome);
    if (funcao && !jaMapeadas.has(funcao) && !detectados.has(funcao)) {
      detectados.set(funcao, nome);
    }
  }

  for (const [funcao, tool_name] of detectados) {
    await supabaseAdmin
      .from("tool_mapping")
      .upsert({ provedor, funcao, tool_name }, { onConflict: "provedor,funcao" });
  }
}

export const listarIntegracoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: integracoes } = await supabaseAdmin
      .from("integracoes_mcp")
      .select(
        "provedor, nome, url_mcp, transporte, token_cifrado, status, ultimo_erro, ultima_checagem",
      );
    const { data: fallbacks } = await supabaseAdmin
      .from("credenciais_fallback")
      .select("provedor, token_cifrado, ambiente, url_base");
    const { data: mapeamentos } = await supabaseAdmin
      .from("tool_mapping")
      .select("provedor, funcao, tool_name");
    const { data: conta } = await supabaseAdmin
      .from("conta_granatum")
      .select("id, conta_id_granatum, nome")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: ia } = await supabaseAdmin
      .from("integracoes_ia")
      .select("token_cifrado, modelo")
      .eq("provedor", "openai")
      .maybeSingle();

    return {
      integracoes: (integracoes ?? []).map((i) => ({
        ...i,
        token_mascarado: mascarar(i.token_cifrado ? "****tokensalvo" : null),
        token_cifrado: undefined,
      })),
      fallbacks: (fallbacks ?? []).map((f) => ({
        ...f,
        token_mascarado: mascarar(f.token_cifrado ? "****tokensalvo" : null),
        token_cifrado: undefined,
      })),
      mapeamentos: mapeamentos ?? [],
      conta: conta ?? null,
      ia: ia
        ? {
            modelo: ia.modelo,
            token_mascarado: mascarar(ia.token_cifrado ? "****tokensalvo" : null),
          }
        : null,
    };
  });

const salvarIntegracaoSchema = z.object({
  provedor: z.enum(["asaas", "granatum"]),
  nome: z.string().min(1),
  url_mcp: z.string().url(),
  transporte: z.enum(["http", "sse"]),
  token: z.string().optional(),
});

export const salvarIntegracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => salvarIntegracaoSchema.parse(d))
  .handler(async ({ data }) => {
    if (data.provedor === "asaas") await salvarIntegracaoAsaas(data);
    else await salvarIntegracaoGranatum(data);
    return { ok: true };
  });

const testarConexaoSchema = z.object({ provedor: z.enum(["asaas", "granatum"]) });

export const testarConexao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => testarConexaoSchema.parse(d))
  .handler(async ({ data }) => {
    const resultado =
      data.provedor === "asaas" ? await testarConexaoAsaas() : await testarConexaoGranatum();

    const toolNames = resultado.tools?.map((t) => t.name);
    if (resultado.status === "conectado" && toolNames) {
      await autoDetectarMapeamento(data.provedor, toolNames);
    }

    return { status: resultado.status, erro: resultado.erro, toolNames };
  });

const salvarFallbackSchema = z.discriminatedUnion("provedor", [
  z.object({
    provedor: z.literal("asaas"),
    token: z.string().min(1),
    ambiente: z.enum(["producao", "sandbox"]),
  }),
  z.object({
    provedor: z.literal("granatum"),
    token: z.string().min(1),
    urlBase: z.string().url(),
  }),
]);

export const salvarFallback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => salvarFallbackSchema.parse(d))
  .handler(async ({ data }) => {
    if (data.provedor === "asaas") await salvarFallbackAsaas(data);
    else await salvarFallbackGranatum(data);
    return { ok: true };
  });

const salvarMapeamentoSchema = z.object({
  provedor: z.enum(["asaas", "granatum"]),
  funcao: z.enum([
    "extrato",
    "lancamentos",
    "categorias",
    "centros_custo",
    "contas",
    "criar_lancamento",
    "editar_lancamento",
    "saldo",
  ]),
  tool_name: z.string().min(1),
});

export const salvarMapeamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => salvarMapeamentoSchema.parse(d))
  .handler(async ({ data }) => {
    await supabaseAdmin.from("tool_mapping").upsert(data, { onConflict: "provedor,funcao" });
    return { ok: true };
  });

export const listarContasParaConfiguracao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => listarContasGranatum());

const salvarContaSchema = z.object({
  conta_id_granatum: z.string().min(1),
  nome: z.string().min(1),
});

export const salvarContaConfigurada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => salvarContaSchema.parse(d))
  .handler(async ({ data }) => {
    const { data: existente } = await supabaseAdmin
      .from("conta_granatum")
      .select("id")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabaseAdmin.from("conta_granatum").upsert({
      ...(existente ? { id: existente.id } : {}),
      conta_id_granatum: data.conta_id_granatum,
      nome: data.nome,
      atualizado_em: new Date().toISOString(),
    });
    return { ok: true };
  });

const salvarIntegracaoIASchema = z.object({
  token: z.string().optional(),
  modelo: z.string().min(1),
});

export const salvarIntegracaoIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => salvarIntegracaoIASchema.parse(d))
  .handler(async ({ data }) => {
    await salvarIntegracaoIAInterno(data);
    return { ok: true };
  });
