// Engine de conciliação: função pura, sem I/O — recebe os dois lados já
// normalizados (despesa = valor negativo, receita = valor positivo, nos dois
// lados) e devolve os pares encontrados.

export type CandidatoAsaas = {
  id: string;
  data: string; // AAAA-MM-DD
  valor: number; // negativo = despesa, positivo = receita
  descricao: string;
};

export type CandidatoGranatum = {
  id: string;
  data: string; // AAAA-MM-DD
  valor: number; // negativo = despesa, positivo = receita (já normalizado)
  descricao: string;
};

export type ParEncontrado = {
  asaasId: string;
  granatumId: string;
  tipo: "automatico" | "sugestao";
};

export type ResultadoConciliacao = {
  pares: ParEncontrado[];
  asaasSemPar: string[];
  granatumSemPar: string[];
};

const CENTAVOS = 100;

function valoresIguais(a: number, b: number): boolean {
  return Math.round(a * CENTAVOS) === Math.round(b * CENTAVOS);
}

function diferencaDias(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00Z`).getTime();
  const db = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((da - db) / 86_400_000);
}

function normalizarTexto(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Similaridade de Jaccard sobre tokens (palavras) das duas descrições, 0..1. */
export function similaridadeDescricao(a: string, b: string): number {
  const ta = new Set(normalizarTexto(a));
  const tb = new Set(normalizarTexto(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersecao = 0;
  for (const t of ta) if (tb.has(t)) intersecao += 1;
  const uniao = ta.size + tb.size - intersecao;
  return uniao === 0 ? 0 : intersecao / uniao;
}

/**
 * Concilia lançamentos Asaas × Granatum.
 *
 * Regra: valor exato (em centavos) e data igual batem automaticamente. Com
 * `toleranciaDias > 0`, aceita diferença de até N dias. Quando mais de um
 * candidato do outro lado bate no mesmo valor/janela de data, desempata pela
 * maior similaridade de descrição — se o desempate for claro (melhor
 * candidato estritamente à frente do segundo), o par sai automático; senão,
 * o melhor candidato ainda é proposto, mas como "sugestao" (o app não liga
 * automaticamente, só sugere, e o usuário confirma).
 *
 * A junção é sempre 1:1: um item nunca aparece em mais de um par, mesmo entre
 * pares do tipo "sugestao" (a sugestão já reserva os dois lados para não
 * competir com outras sugestões enquanto aguarda confirmação).
 */
export function conciliar(
  asaas: CandidatoAsaas[],
  granatum: CandidatoGranatum[],
  toleranciaDias = 0,
): ResultadoConciliacao {
  const asaasDisponiveis = new Map(asaas.map((a) => [a.id, a]));
  const granatumDisponiveis = new Map(granatum.map((g) => [g.id, g]));
  const pares: ParEncontrado[] = [];

  // Processa por distância de data crescente, para que matches de data exata
  // sejam decididos antes de matches dentro da tolerância.
  for (let distancia = 0; distancia <= toleranciaDias; distancia++) {
    // Ordena por data para tornar o resultado determinístico.
    const granatumOrdenados = [...granatumDisponiveis.values()].sort((a, b) =>
      a.data < b.data ? -1 : a.data > b.data ? 1 : a.id.localeCompare(b.id),
    );

    for (const g of granatumOrdenados) {
      if (!granatumDisponiveis.has(g.id)) continue; // já usado nesta mesma passada

      const candidatos = [...asaasDisponiveis.values()].filter(
        (a) =>
          valoresIguais(a.valor, g.valor) && Math.abs(diferencaDias(a.data, g.data)) === distancia,
      );

      if (candidatos.length === 0) continue;

      if (candidatos.length === 1) {
        const [a] = candidatos;
        if (!a) continue;
        pares.push({ asaasId: a.id, granatumId: g.id, tipo: "automatico" });
        asaasDisponiveis.delete(a.id);
        granatumDisponiveis.delete(g.id);
        continue;
      }

      const ranqueados = candidatos
        .map((a) => ({ a, score: similaridadeDescricao(a.descricao, g.descricao) }))
        .sort((x, y) => y.score - x.score);

      const melhor = ranqueados[0];
      const segundo = ranqueados[1];
      if (!melhor) continue;
      const desempateClaro = !segundo || melhor.score > segundo.score;

      pares.push({
        asaasId: melhor.a.id,
        granatumId: g.id,
        tipo: desempateClaro ? "automatico" : "sugestao",
      });
      asaasDisponiveis.delete(melhor.a.id);
      granatumDisponiveis.delete(g.id);
    }
  }

  return {
    pares,
    asaasSemPar: [...asaasDisponiveis.keys()],
    granatumSemPar: [...granatumDisponiveis.keys()],
  };
}
