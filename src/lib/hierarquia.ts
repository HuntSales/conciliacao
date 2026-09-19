export type NoHierarquico = { id: string; nome: string; parentId: string | null };

export function nivelSuperior<T extends NoHierarquico>(itens: T[]): T[] {
  return itens.filter((i) => i.parentId === null);
}

export function filhosDe<T extends NoHierarquico>(itens: T[], paiId: string | null): T[] {
  if (!paiId) return [];
  return itens.filter((i) => i.parentId === paiId);
}

/** Sobe a árvore até o nó raiz (nível "categoria"/"centro"). */
export function noRaizDe<T extends NoHierarquico>(itens: T[], id: string | null): string | null {
  if (!id) return null;
  let atual = itens.find((i) => i.id === id);
  if (!atual) return null;
  const visitados = new Set<string>();
  while (atual.parentId && !visitados.has(atual.id)) {
    visitados.add(atual.id);
    const pai = itens.find((i) => i.id === atual!.parentId);
    if (!pai) break;
    atual = pai;
  }
  return atual.id;
}

/**
 * Só as folhas da árvore (sem filhos) — o Granatum rejeita lançamento em
 * categoria/centro que tenha filhos ("Você não pode adicionar lançamentos em
 * uma categoria com filhos"), então só folhas podem ser escolhidas de fato,
 * não importa a profundidade da árvore.
 */
export function folhas<T extends NoHierarquico>(itens: T[]): T[] {
  const comFilhos = new Set(itens.filter((i) => i.parentId !== null).map((i) => i.parentId));
  return itens.filter((i) => !comFilhos.has(i.id));
}
