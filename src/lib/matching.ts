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

/** Chave de um par Asaas × Granatum, pra conjuntos de pares proibidos. */
export function chavePar(asaasId: string, granatumId: string): string {
  return `${asaasId}|${granatumId}`;
}

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
 *
 * `proibidos` (chaves de `chavePar`): ligações que o usuário interrompeu —
 * esse par nunca é proposto, mas cada lado continua livre pra outro par.
 */
export function conciliar(
  asaas: CandidatoAsaas[],
  granatum: CandidatoGranatum[],
  toleranciaDias = 0,
  proibidos: ReadonlySet<string> = new Set(),
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
          valoresIguais(a.valor, g.valor) &&
          Math.abs(diferencaDias(a.data, g.data)) === distancia &&
          !proibidos.has(chavePar(a.id, g.id)),
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

export type JaNoGranatum = {
  granatumId: string;
  /** "identificador": criado a partir deste item (certeza); "valor": mesmo valor, sem par. */
  motivo: "identificador" | "valor";
};

/**
 * Para os itens do Asaas que sobraram sem par, aponta o lançamento do
 * Granatum (também sem par) que provavelmente é o mesmo — pra impedir criar
 * duplicado. Primeiro pelo `identificador_externo` (= id do Asaas, gravado ao
 * criar a partir da conciliação); depois por valor exato, em qualquer data do
 * período, preferindo a data mais próxima e, empatando, a descrição mais
 * parecida. 1:1: um lançamento do Granatum só segura um item do Asaas.
 */
export function detectarJaNoGranatum(
  asaas: CandidatoAsaas[],
  granatum: (CandidatoGranatum & { identificadorExterno: string | null })[],
  proibidos: ReadonlySet<string> = new Set(),
): Map<string, JaNoGranatum> {
  const resultado = new Map<string, JaNoGranatum>();
  const usados = new Set<string>();

  for (const a of asaas) {
    const g = granatum.find(
      (x) =>
        x.identificadorExterno === a.id &&
        !usados.has(x.id) &&
        !proibidos.has(chavePar(a.id, x.id)),
    );
    if (!g) continue;
    resultado.set(a.id, { granatumId: g.id, motivo: "identificador" });
    usados.add(g.id);
  }

  const restantes = asaas
    .filter((a) => !resultado.has(a.id))
    .sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : x.id.localeCompare(y.id)));
  for (const a of restantes) {
    const melhor = granatum
      .filter(
        (g) =>
          !usados.has(g.id) &&
          valoresIguais(a.valor, g.valor) &&
          !proibidos.has(chavePar(a.id, g.id)),
      )
      .map((g) => ({
        g,
        dias: Math.abs(diferencaDias(a.data, g.data)),
        score: similaridadeDescricao(a.descricao, g.descricao),
      }))
      .sort((x, y) => x.dias - y.dias || y.score - x.score || x.g.id.localeCompare(y.g.id))[0];
    if (!melhor) continue;
    resultado.set(a.id, { granatumId: melhor.g.id, motivo: "valor" });
    usados.add(melhor.g.id);
  }

  return resultado;
}
