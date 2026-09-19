import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enviarEmail, linkOficial } from "@/lib/email.server";

type Tipo = "recovery" | "invite";

/** Gera o link de acesso e envia pelo Resend. Retorna aviso quando falha. */
export async function enviarLinkAcesso(
  email: string,
  tipo: Tipo,
  metadados?: Record<string, unknown>,
): Promise<{ enviado: boolean; aviso?: string }> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink(
    tipo === "invite"
      ? { type: "invite", email, options: { data: metadados ?? {} } }
      : { type: "recovery", email },
  );
  if (error || !data?.properties?.hashed_token) {
    return { enviado: false, aviso: error?.message ?? "Não foi possível gerar o link de acesso" };
  }

  const url = linkOficial(data.properties.hashed_token, tipo);
  const conteudo =
    tipo === "invite"
      ? {
          assunto: "Seu acesso ao sistema de Conciliação",
          titulo: "Acesso liberado",
          paragrafos: [
            "Sua empresa foi cadastrada no sistema de Conciliação Asaas × Granatum.",
            "Defina sua senha para entrar. O link é pessoal e expira em algumas horas.",
          ],
          botao: { texto: "Definir senha", url },
        }
      : {
          assunto: "Redefinição de senha — Conciliação",
          titulo: "Redefinir senha",
          paragrafos: [
            "Recebemos um pedido de redefinição de senha para este e-mail.",
            "Se não foi você, ignore esta mensagem. O link expira em algumas horas.",
          ],
          botao: { texto: "Criar nova senha", url },
        };

  const resultado = await enviarEmail({ para: [email], ...conteudo });
  return resultado.enviado
    ? { enviado: true }
    : { enviado: false, aviso: resultado.erro ?? "Falha no envio" };
}
