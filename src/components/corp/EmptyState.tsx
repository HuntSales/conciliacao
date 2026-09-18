import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  acao?: ReactNode;
}) {
  return (
    <div className="corp-card fade-up flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center border border-primary/30 bg-primary/5">
        <Icone className="h-6 w-6 text-primary" />
      </div>
      <h3 className="heading text-lg">{titulo}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{descricao}</p>
      {acao ? <div className="pt-2">{acao}</div> : null}
    </div>
  );
}
