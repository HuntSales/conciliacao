export type ItemNavBase = { rotulo: string; para: string; exato?: boolean };

type Pagina = "conciliacao" | "integracoes" | "historico" | "admin";

/** Nav padrão das 3 abas do app, com "Admin" aparecendo só para super_admin. */
export function montarNav(atual: Pagina, ehSuperAdmin: boolean): ItemNavBase[] {
  const itens: ItemNavBase[] = [
    { rotulo: "Conciliação", para: "/conciliacao", exato: atual === "conciliacao" },
    { rotulo: "Integrações", para: "/integracoes", exato: atual === "integracoes" },
    { rotulo: "Histórico", para: "/historico", exato: atual === "historico" },
  ];
  if (ehSuperAdmin) itens.push({ rotulo: "Admin", para: "/admin", exato: atual === "admin" });
  return itens;
}
