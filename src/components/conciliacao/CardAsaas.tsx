import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatarDataCurta, formatarMoeda } from "@/lib/format";
import type { ItemAsaas } from "@/lib/conciliacao.functions";

function badge(tipoPar: ItemAsaas["tipoPar"]) {
  if (tipoPar === "automatico" || tipoPar === "manual") {
    return <span className="chip border-success/40 text-success">Conciliado</span>;
  }
  if (tipoPar === "sugestao") {
    return <span className="chip border-gold/40 text-gold">Sugestão</span>;
  }
  return <span className="chip">Sem par</span>;
}

export function CardAsaas({
  item,
  selecionavel,
  selecionado,
  onSelecionar,
  onCriarNoGranatum,
}: {
  item: ItemAsaas;
  selecionavel: boolean;
  selecionado: boolean;
  onSelecionar: (marcado: boolean) => void;
  onCriarNoGranatum: () => void;
}) {
  return (
    <div
      className={`corp-card corp-card-hover p-4 ${
        item.tipoPar === "sugestao" ? "border-dashed border-gold/50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {selecionavel ? (
            <Checkbox
              checked={selecionado}
              onCheckedChange={(v) => onSelecionar(Boolean(v))}
              className="mt-1"
            />
          ) : null}
          <div>
            <p className="text-xs text-muted-foreground">{formatarDataCurta(item.data)}</p>
            <p className="mt-0.5 text-sm text-body">{item.descricao}</p>
          </div>
        </div>
        {badge(item.tipoPar)}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p
          className={`heading text-lg ${item.tipo === "despesa" ? "text-destructive" : "text-success"}`}
        >
          {formatarMoeda(item.valor)}
        </p>
        {!item.tipoPar ? (
          <Button variant="corpOutline" size="sm" onClick={onCriarNoGranatum}>
            <Plus /> Criar no Granatum
          </Button>
        ) : null}
      </div>
    </div>
  );
}
