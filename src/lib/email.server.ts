import { DOMINIO_APP } from "@/lib/dominio";

const RESEND_API = "https://api.resend.com/emails";

function remetente(): string {
  return process.env["EMAIL_REMETENTE"] ?? "Conciliação <nao-responda@mail.smartapps.ia.br>";
}

export type Botao = { texto: string; url: string };

function montarHtml(titulo: string, paragrafos: string[], botao?: Botao): string {
  const corpo = paragrafos
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#D8D8D0">${p}</p>`,
    )
    .join("");
  const cta = botao
    ? `<p style="margin:28px 0 0"><a href="${botao.url}" style="display:inline-block;background:#FF5A1F;color:#0A0A0A;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:14px 26px;text-decoration:none">${botao.texto}</a></p>
       <p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#888880;word-break:break-all">Se o botão não funcionar, copie este endereço no navegador:<br>${botao.url}</p>`
    : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#111111;border:1px solid #2A2A2A">
        <tr><td style="height:3px;background:#FF5A1F"></td></tr>
        <tr><td style="padding:32px 32px 40px">
          <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#FF5A1F">Conciliação</p>
          <h1 style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.2;text-transform:uppercase;color:#F5F5F0">${titulo}</h1>
          ${corpo}
          ${cta}
        </td></tr>
        <tr><td style="padding:18px 32px 26px;border-top:1px solid #2A2A2A">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#888880">${DOMINIO_APP}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Envia e-mail pelo Resend. Nunca lança: falha só vira log + retorno. */
export async function enviarEmail(opcoes: {
  para: string[];
  assunto: string;
  titulo: string;
  paragrafos: string[];
  botao?: Botao;
}): Promise<{ enviado: boolean; erro?: string }> {
  const destinos = opcoes.para.filter(Boolean);
  if (destinos.length === 0) return { enviado: false, erro: "sem destinatário" };

  const resendKey = process.env["RESEND_API_KEY"];
  if (!resendKey) {
    console.error("Envio de e-mail indisponível: RESEND_API_KEY ausente");
    return { enviado: false, erro: "credenciais de e-mail ausentes" };
  }

  const texto = [
    opcoes.titulo,
    ...opcoes.paragrafos,
    ...(opcoes.botao ? [opcoes.botao.url] : []),
  ].join("\n\n");

  try {
    const resposta = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: remetente(),
        to: destinos,
        subject: opcoes.assunto,
        html: montarHtml(opcoes.titulo, opcoes.paragrafos, opcoes.botao),
        text: texto,
      }),
    });
    if (!resposta.ok) {
      const detalhe = await resposta.text();
      console.error(`Falha no envio de e-mail [${resposta.status}]: ${detalhe}`);
      let mensagem = "Falha ao enviar o e-mail. Verifique a configuração de e-mail da plataforma.";
      try {
        const corpo = JSON.parse(detalhe) as { message?: string };
        if (corpo.message) mensagem = corpo.message;
      } catch {
        // resposta não veio em JSON: mantém a mensagem genérica
      }
      return { enviado: false, erro: mensagem };
    }
    return { enviado: true };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : "erro desconhecido";
    console.error(`Falha no envio de e-mail: ${msg}`);
    return { enviado: false, erro: msg };
  }
}

/** Monta o link de acesso no domínio oficial a partir do token gerado pelo backend. */
export function linkOficial(tokenHash: string, tipo: "recovery" | "invite"): string {
  const q = new URLSearchParams({ token_hash: tokenHash, type: tipo });
  return `${DOMINIO_APP}/redefinir-senha?${q.toString()}`;
}
