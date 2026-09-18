const FUSO = "America/Sao_Paulo";

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarDataCurta(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Data de hoje no fuso America/Sao_Paulo, formato AAAA-MM-DD. */
export function hojeIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: FUSO });
}

export function inicioSemanaIso(): string {
  const hoje = new Date(`${hojeIso()}T12:00:00`);
  const diaSemana = hoje.getDay();
  const diff = diaSemana === 0 ? 6 : diaSemana - 1;
  hoje.setDate(hoje.getDate() - diff);
  return hoje.toLocaleDateString("sv-SE", { timeZone: FUSO });
}

export function inicioMesIso(): string {
  const hoje = hojeIso();
  return `${hoje.slice(0, 7)}-01`;
}

export function somarDias(iso: string, dias: number): string {
  const data = new Date(`${iso}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

export function diferencaDias(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00Z`).getTime();
  const db = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((da - db) / 86_400_000);
}
