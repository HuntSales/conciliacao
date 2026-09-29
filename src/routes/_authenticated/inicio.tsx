import { createFileRoute, Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, GitCompareArrows, History, Plug, ReceiptText, Shield } from "lucide-react";
import { Shell } from "@/components/corp/Shell";
import { montarNav } from "@/components/corp/nav-padrao";
import { useSuperAdmin } from "@/lib/use-super-admin";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => ({ meta: [{ title: "Início — Conciliação" }] }),
  component: InicioPage,
});

function Atalho({
  para,
  icone: Icone,
  titulo,
  descricao,
}: {
  para: string;
  icone: LucideIcon;
  titulo: string;
  descricao: string;
}) {
  return (
    <Link
      to={para}
      className="corp-card corp-card-hover fade-up group flex items-center gap-4 p-5 sm:flex-col sm:items-start sm:gap-6 sm:p-8"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-primary/30 bg-primary/5">
        <Icone className="h-7 w-7 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="display text-3xl sm:text-4xl">{titulo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary sm:hidden" />
    </Link>
  );
}

function InicioPage() {
  const superAdmin = useSuperAdmin();
  const nav = montarNav("inicio", superAdmin.data ?? false);

  return (
    <Shell itens={nav} contexto="Início">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <Atalho
            para="/conciliacao"
            icone={GitCompareArrows}
            titulo="Conciliação"
            descricao="Extrato do Asaas × lançamentos do Granatum."
          />
          <Atalho
            para="/lancamentos"
            icone={ReceiptText}
            titulo="Lançamentos"
            descricao="Lance uma compra ou recebimento em qualquer conta, falando ou digitando."
          />
        </div>

        <nav className="flex flex-wrap justify-center gap-2">
          <Link to="/integracoes" className="chip hover:text-primary">
            <Plug className="h-3.5 w-3.5" /> Integrações
          </Link>
          <Link to="/historico" className="chip hover:text-primary">
            <History className="h-3.5 w-3.5" /> Histórico
          </Link>
          {superAdmin.data ? (
            <Link to="/admin" className="chip hover:text-primary">
              <Shield className="h-3.5 w-3.5" /> Admin
            </Link>
          ) : null}
        </nav>
      </div>
    </Shell>
  );
}
