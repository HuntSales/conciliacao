export const DOMINIO_APP = "https://conciliacao.smartapps.ia.br";

export function urlApp(caminho: string): string {
  const sufixo = caminho.startsWith("/") ? caminho : `/${caminho}`;
  return `${DOMINIO_APP}${sufixo}`;
}
