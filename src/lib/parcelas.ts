/**
 * Divide um total em N parcelas iguais, em centavos. O Granatum cria todas
 * as parcelas de uma série com o mesmo valor, então a sobra da divisão vai
 * na 1ª (ajustada depois, só ela, sem propagar pras outras).
 * Ex.: 100,00 em 3x → 1ª 33,34 e as outras 33,33.
 */
export function dividirEmParcelas(
  total: number,
  parcelas: number,
): { parcela: number; primeira: number } {
  const centavos = Math.round(Math.abs(total) * 100);
  const base = Math.floor(centavos / parcelas);
  const sobra = centavos - base * parcelas;
  const sinal = total < 0 ? -1 : 1;
  return { parcela: (sinal * base) / 100, primeira: (sinal * (base + sobra)) / 100 };
}

export const PERIODICIDADES = [
  { valor: "D7", rotulo: "Semanal" },
  { valor: "D15", rotulo: "Quinzenal" },
  { valor: "M1", rotulo: "Mensal" },
  { valor: "M2", rotulo: "Bimestral" },
  { valor: "M3", rotulo: "Trimestral" },
  { valor: "M6", rotulo: "Semestral" },
  { valor: "M12", rotulo: "Anual" },
] as const;

export type Periodicidade = (typeof PERIODICIDADES)[number]["valor"];
