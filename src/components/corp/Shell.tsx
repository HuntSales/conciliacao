import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Backdrop } from "./Backdrop";

export type ItemNav = { rotulo: string; para: string; exato?: boolean; soDesktop?: boolean };

export function Shell({
  itens,
  contexto,
  usuario,
  children,
}: {
  itens: ItemNav[];
  contexto: string;
  usuario?: string | null | undefined;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  const sair = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/auth" });
  };

  return (
    <div className="relative min-h-screen">
      <Backdrop intensidade="baixa" />
      <header className="relative z-10 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-8 sm:px-6">
          <Link to="/" className="display shrink-0 text-lg tracking-wide sm:text-2xl">
            Concilia<span className="text-primary">ção</span>
          </Link>
          <span className="hidden sm:inline-flex">
            <span className="chip">{contexto}</span>
          </span>
          <nav className="ml-auto flex items-center gap-1">
            {itens.map((item) => (
              <Link
                key={item.para}
                to={item.para}
                activeOptions={{ exact: item.exato ?? false }}
                activeProps={{ className: "text-primary border-primary/60" }}
                className={`border-b-2 border-transparent px-3 py-2 font-label text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground ${item.soDesktop ? "hidden md:inline-block" : ""}`}
              >
                {item.rotulo}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3 border-l border-border pl-2 sm:pl-4">
            {usuario ? (
              <span className="hidden text-xs text-muted-foreground md:block">{usuario}</span>
            ) : null}
            <Button variant="ghostCorp" size="sm" onClick={sair}>
              <LogOut /> <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}

export function TituloPagina({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string;
  subtitulo?: string | undefined;
  acao?: ReactNode;
}) {
  return (
    <div className="fade-up mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
      <div>
        <h1 className="display text-4xl md:text-5xl">{titulo}</h1>
        {subtitulo ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitulo}</p>
        ) : null}
      </div>
      {acao}
    </div>
  );
}
