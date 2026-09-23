import { Sparkles } from "lucide-react";
import type { SugestaoParaLancamento } from "@/lib/conciliacao.functions";

/** Linha curta dizendo de onde veio a categoria/centro pré-preenchidos. */
export function AvisoSugestao({
  sugestao,
  buscando,
}: {
  sugestao: SugestaoParaLancamento | undefined;
  buscando: boolean;
}) {
  if (buscando) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> Buscando sugestão de categoria e centro de custo…
      </p>
    );
  }
  if (!sugestao || sugestao.origem === "nenhuma") return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-gold">
      <Sparkles className="h-3.5 w-3.5" />
      {sugestao.origem === "ia"
        ? "Sugerido por IA — confira antes de salvar."
        : "Sugerido pelo histórico de lançamentos parecidos — confira antes de salvar."}
    </p>
  );
}
