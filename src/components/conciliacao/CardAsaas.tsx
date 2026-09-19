import { Link2, Plus, X } from "lucide-react";
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

export type ModoVinculo = "nenhum" | "origem" | "alvo";

export function CardAsaas({
  item,
  modoVinculo,
  selecionadoLote,
  onSelecionarLote,
  onCriarNoGranatum,
  onIniciarVinculo,
  onCancelarVinculo,
  onLigarAqui,
}: {
  item: ItemAsaas;
  modoVinculo: ModoVinculo;
  selecionadoLote?: boolean | undefined;
  onSelecionarLote?: ((marcado: boolean) => void) | undefined;
  onCriarNoGranatum: () => void;
  onIniciarVinculo: () => void;
  onCancelarVinculo: () => void;
  onLigarAqui: () => void;
}) {
  return (
    <div
      className={`corp-card corp-card-hover p-4 ${
        item.tipoPar === "sugestao" ? "border-dashed border-gold/50" : ""
      } ${modoVinculo === "origem" ? "border-primary shadow-glow" : ""} ${
        modoVinculo === "alvo" ? "border-gold" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {!item.tipoPar && onSelecionarLote ? (
            <Checkbox
              checked={selecionadoLote ?? false}
              onCheckedChange={(v) => onSelecionarLote(Boolean(v))}
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
      <div className="mt-3 flex items-center justify-between gap-2">
        <p
          className={`heading text-lg ${item.tipo === "despesa" ? "text-destructive" : "text-success"}`}
        >
          {formatarMoeda(item.valor)}
        </p>
        {!item.tipoPar ? (
          <div className="flex gap-2">
            {modoVinculo === "alvo" ? (
              <Button variant="corp" size="sm" onClick={onLigarAqui}>
                <Link2 /> Ligar aqui
              </Button>
            ) : modoVinculo === "origem" ? (
              <Button variant="ghostCorp" size="sm" onClick={onCancelarVinculo}>
                <X /> Cancelar
              </Button>
            ) : (
              <>
                <Button variant="ghostCorp" size="sm" onClick={onIniciarVinculo}>
                  <Link2 /> Ligar
                </Button>
                <Button variant="corpOutline" size="sm" onClick={onCriarNoGranatum}>
                  <Plus /> Criar no Granatum
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
