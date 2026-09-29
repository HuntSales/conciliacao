export type ItemNavBase = { rotulo: string; para: string; exato?: boolean; soDesktop?: boolean };

type Pagina = "inicio" | "conciliacao" | "lancamentos" | "integracoes" | "historico" | "admin";

/**
 * Nav padrão do app, com "Admin" aparecendo só para super_admin. No celular
 * só cabem Conciliação e Lançamentos — o resto fica na tela inicial (logo).
 */
export function montarNav(atual: Pagina, ehSuperAdmin: boolean): ItemNavBase[] {
  const itens: ItemNavBase[] = [
    { rotulo: "Conciliação", para: "/conciliacao", exato: atual === "conciliacao" },
    { rotulo: "Lançamentos", para: "/lancamentos", exato: atual === "lancamentos" },
    {
      rotulo: "Integrações",
      para: "/integracoes",
      exato: atual === "integracoes",
      soDesktop: true,
    },
    { rotulo: "Histórico", para: "/historico", exato: atual === "historico", soDesktop: true },
  ];
  if (ehSuperAdmin)
    itens.push({ rotulo: "Admin", para: "/admin", exato: atual === "admin", soDesktop: true });
  return itens;
}
