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
