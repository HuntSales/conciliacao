import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function chave(): Buffer {
  const bruta = process.env["CREDENCIAIS_CIFRA_CHAVE"];
  if (!bruta) throw new Error("CREDENCIAIS_CIFRA_CHAVE nao configurada");
  return createHash("sha256").update(bruta).digest();
}

export function criptografar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${dados.toString("base64")}`;
}

export function descriptografar(valor: string): string {
  const [versao, iv, tag, dados] = valor.split(".");
  if (versao !== "v1" || !iv || !tag || !dados) throw new Error("Token invalido");
  const decipher = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dados, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

export function mascarar(token: string | null | undefined): string {
  if (!token) return "";
  return `****${token.slice(-4)}`;
}
