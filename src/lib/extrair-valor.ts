/**
 * Interpreta uma frase falada ou digitada ("gasolina no posto Shell 150
 * reais") separando descrição e valor, sem IA. Pensado pro texto que o
 * reconhecimento de voz do navegador devolve em pt-BR, que já escreve os
 * números em algarismos ("R$ 150", "150 reais", "150,50", "1.200").
 */

export type FraseInterpretada = {
  descricao: string;
  /** Sempre positivo — o sinal vem do tipo. */
  valor: number | null;
  /** Só quando a frase deixa claro ("comprei", "recebi"); senão null. */
  tipo: "receita" | "despesa" | null;
  /** "em 10x", "todo mês"... — null quando a frase não fala em repetição. */
  repeticao:
    | { modo: "parcelado"; parcelas: number }
    | { modo: "recorrente"; periodicidade: "D7" | "M1" | "M12" }
    | null;
};

// "em 10x", "10 vezes", "parcelado em 3 parcelas" — sai antes de procurar o
// valor, senão o 10 de "3000 em 10x" viraria o valor.
const PARCELAS =
  /(?:\bparcelad[oa]\s+)?(?:\bem\s+)?\b(\d{1,3})\s*(?:x|vezes|parcelas)(?![\p{L}\d])/iu;
const RECORRENCIAS: Array<[RegExp, "D7" | "M1" | "M12"]> = [
  [/\b(?:todo m[eê]s|todos os meses|por m[eê]s|mensal(?:mente)?|recorrente)(?![\p{L}])/iu, "M1"],
  [/\b(?:toda semana|todas as semanas|por semana|semanal(?:mente)?)(?![\p{L}])/iu, "D7"],
  [/\b(?:todo ano|todos os anos|por ano|anual(?:mente)?)(?![\p{L}])/iu, "M12"],
];

// Número em pt-BR: milhar com ponto (1.234), decimal com vírgula (150,50),
// decimal com ponto só com 1–2 casas (150.50), opcionalmente "mil",
// "reais" e "e 50 centavos".
const NUMERO =
  /(R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+\.\d{1,2}(?!\d)|\d+)(?:,(\d{1,2}))?(\s*mil\b)?(\s*(?:reais|real|contos?|pilas?)\b)?(?:\s*e\s*(\d{1,2})\s*centavos?\b)?/gi;

const VERBOS_DESPESA = /^(?:comprei|paguei|gastei|compra de|pagamento de|pagamento)\s+/i;
const VERBOS_RECEITA = /^(?:recebi|recebimento de|recebimento|entrada de|venda de|vendi)\s+/i;

/** Conectores que sobram grudados no valor ("no valor de 150", "150 de almoço"). */
const CONECTOR_ANTES = /\s*(?:no valor de|valor de|custou|por|de|foi)\s*$/i;
const CONECTOR_DEPOIS = /^\s*(?:de|em|no|na|com)\s+/i;

function paraNumero(inteiro: string, decimais: string | undefined): number {
  const temDecimalComPonto = /^\d+\.\d{1,2}$/.test(inteiro) && decimais === undefined;
  if (temDecimalComPonto) return Number.parseFloat(inteiro);
  const semMilhar = inteiro.replace(/\./g, "");
  return Number.parseFloat(`${semMilhar}.${decimais ?? "0"}`);
}

export function interpretarFrase(texto: string): FraseInterpretada {
  let original = texto.trim().replace(/\s+/g, " ");

  let repeticao: FraseInterpretada["repeticao"] = null;
  const parcelas = PARCELAS.exec(original);
  if (parcelas && Number(parcelas[1]) >= 2) {
    repeticao = { modo: "parcelado", parcelas: Number(parcelas[1]) };
    original = original.replace(parcelas[0], " ").replace(/\bparcelad[oa]\b/i, " ");
  } else {
    for (const [padrao, periodicidade] of RECORRENCIAS) {
      const m = padrao.exec(original);
      if (!m) continue;
      repeticao = { modo: "recorrente", periodicidade };
      original = original.replace(m[0], " ");
      break;
    }
  }
  original = original.replace(/\s+/g, " ").trim();

  type Candidato = { inicio: number; fim: number; valor: number; forte: boolean };
  const candidatos: Candidato[] = [];
  for (const m of original.matchAll(NUMERO)) {
    const [trecho, cifrao, inteiro, decimais, mil, moeda, centavos] = m;
    if (!inteiro) continue;
    let valor = paraNumero(inteiro, decimais);
    if (mil) valor *= 1000;
    if (centavos) valor += Number.parseInt(centavos, 10) / 100;
    candidatos.push({
      inicio: m.index ?? 0,
      fim: (m.index ?? 0) + trecho.length,
      valor: Math.round(valor * 100) / 100,
      forte: Boolean(cifrao || moeda || centavos),
    });
  }

  // Preferência: número com "R$"/"reais"; empate, o último da frase (o valor
  // costuma vir no fim: "posto 24 horas gasolina 150").
  const escolhido =
    [...candidatos].reverse().find((c) => c.forte) ?? candidatos[candidatos.length - 1] ?? null;

  let descricao = original;
  if (escolhido) {
    const antes = original.slice(0, escolhido.inicio).replace(CONECTOR_ANTES, "");
    const depois = original.slice(escolhido.fim).replace(CONECTOR_DEPOIS, "");
    descricao = `${antes} ${depois}`;
  }

  let tipo: FraseInterpretada["tipo"] = null;
  descricao = descricao.replace(/\s+/g, " ").trim();
  if (VERBOS_RECEITA.test(descricao)) {
    tipo = "receita";
    descricao = descricao.replace(VERBOS_RECEITA, "");
  } else if (VERBOS_DESPESA.test(descricao)) {
    tipo = "despesa";
    descricao = descricao.replace(VERBOS_DESPESA, "");
  }
  descricao = descricao.replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "");
  if (descricao) descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1);

  return {
    descricao,
    valor: escolhido && escolhido.valor > 0 ? escolhido.valor : null,
    tipo,
    repeticao,
  };
}
