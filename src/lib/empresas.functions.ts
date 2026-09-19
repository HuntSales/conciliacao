import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth, requireSuperAdmin } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validarCnpj, apenasDigitos } from "@/lib/cnpj";

/**
 * Promove o usuário atual a super_admin se ainda não existir nenhum na
 * plataforma — resolve o problema do "primeiro administrador" sem precisar
 * de acesso direto ao banco. Chamado uma vez, logo após o login.
 */
export const garantirPrimeiroSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) > 0) return { promovido: false };

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "super_admin" }, { onConflict: "user_id,role" });
    return { promovido: true };
  });

export const souSuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    return Boolean(data);
  });

export const listarEmpresas = createServerFn({ method: "GET" })
  .middleware([requireSuperAdmin])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("empresas")
      .select("id, razao_social, cnpj, email, status, criado_em")
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const criarEmpresaSchema = z.object({
  razao_social: z.string().min(2),
  cnpj: z.string().refine(validarCnpj, "CNPJ inválido"),
  email: z.string().email(),
});

export const criarEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((d: unknown) => criarEmpresaSchema.parse(d))
  .handler(async ({ data }) => {
    const cnpjLimpo = apenasDigitos(data.cnpj);

    const { data: empresa, error } = await supabaseAdmin
      .from("empresas")
      .insert({ razao_social: data.razao_social, cnpj: cnpjLimpo, email: data.email })
      .select("id")
      .single();
    if (error) {
      throw new Error(
        error.message.includes("cnpj") ? "Já existe uma empresa com este CNPJ" : error.message,
      );
    }

    const { enviarLinkAcesso } = await import("@/lib/acesso-email.server");
    const envio = await enviarLinkAcesso(data.email, "invite", {
      nome: data.razao_social,
      papel: "empresa_admin",
      empresa_id: empresa.id,
    });

    return {
      empresa_id: empresa.id,
      aviso_convite: envio.enviado ? null : (envio.aviso ?? "Falha ao enviar o convite"),
    };
  });

const atualizarEmpresaSchema = z.object({
  id: z.string().uuid(),
  razao_social: z.string().min(2),
  cnpj: z.string().refine(validarCnpj, "CNPJ inválido").optional(),
  email: z.string().email(),
  status: z.enum(["ativa", "suspensa"]),
});

export const atualizarEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((d: unknown) => atualizarEmpresaSchema.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("empresas")
      .update({
        razao_social: data.razao_social,
        ...(data.cnpj ? { cnpj: apenasDigitos(data.cnpj) } : {}),
        email: data.email,
        status: data.status,
      })
      .eq("id", data.id);
    if (error) {
      throw new Error(
        error.message.includes("cnpj") ? "Já existe uma empresa com este CNPJ" : error.message,
      );
    }
    return { ok: true };
  });

const reenviarConviteSchema = z.object({ empresa_id: z.string().uuid() });

export const reenviarConvite = createServerFn({ method: "POST" })
  .middleware([requireSuperAdmin])
  .inputValidator((d: unknown) => reenviarConviteSchema.parse(d))
  .handler(async ({ data }) => {
    const { data: empresa } = await supabaseAdmin
      .from("empresas")
      .select("razao_social, email")
      .eq("id", data.empresa_id)
      .maybeSingle();
    if (!empresa) throw new Error("Empresa não encontrada");

    const { enviarLinkAcesso } = await import("@/lib/acesso-email.server");
    const envio = await enviarLinkAcesso(empresa.email, "invite", {
      nome: empresa.razao_social,
      papel: "empresa_admin",
      empresa_id: data.empresa_id,
    });
    if (!envio.enviado) throw new Error(envio.aviso ?? "Falha ao enviar o convite");
    return { ok: true };
  });
