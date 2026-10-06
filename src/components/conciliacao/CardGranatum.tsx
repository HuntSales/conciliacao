import { useMemo, useState } from "react";
import { AlertTriangle, Check, EyeOff, Link2, RotateCcw, Undo2, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatarDataCurta, formatarMoeda } from "@/lib/format";
import {
  editarLancamento,
  type ItemGranatum,
  type SugestaoParaLancamento,
} from "@/lib/conciliacao.functions";
import { folhas } from "@/lib/hierarquia";
import type { CategoriaGranatum, CentroCustoGranatum } from "@/lib/mcp/tipos";
import type { ModoVinculo } from "./CardAsaas";
import { AvisoSugestao } from "./AvisoSugestao";

/** O que vai pro Granatum ao salvar/confirmar — fica na página pra "Conciliar todas" ler. */
export type CamposGranatum = {
  descricao: string;
  categoriaId: string | null;
  centroCustoId: string | null;
};

function badge(tipoPar: ItemGranatum["tipoPar"], ignorado: boolean, interrompida: boolean) {
  if (ignorado) return <span className="chip">Ignorado</span>;
  if (tipoPar === "sugestao" && interrompida) {
    return <span className="chip border-destructive/50 text-destructive">Interrompida</span>;
  }
  if (tipoPar === "automatico" || tipoPar === "manual") {
    return <span className="chip border-success/40 text-success">Conciliado</span>;
  }
  if (tipoPar === "sugestao") {
    return <span className="chip border-gold/40 text-gold">Sugestão</span>;
  }
  return <span className="chip">Sem par</span>;
}

export function CardGranatum({
  item,
  categorias,
  centros,
  campos,
  onMudarCampos,
  sugestao,
  buscandoSugestao,
  modoVinculo,
  onDesfazer,
  onConfirmarSugestao,
  interrompida,
  onAlternarInterrupcao,
  onIniciarVinculo,
  onCancelarVinculo,
  onLigarAqui,
  onSalvo,
  onIgnorar,
  onRestaurar,
}: {
  item: ItemGranatum;
  categorias: CategoriaGranatum[];
  centros: CentroCustoGranatum[];
  /** Já com a sugestão aplicada no que o usuário ainda não escolheu. */
  campos: CamposGranatum;
  onMudarCampos: (parcial: Partial<CamposGranatum>) => void;
  /** Só vem para lançamento ainda sem categoria no Granatum. */
  sugestao?: SugestaoParaLancamento | undefined;
  buscandoSugestao?: boolean | undefined;
  modoVinculo: ModoVinculo;
  onDesfazer?: (() => void) | undefined;
  /** Recebe o que está nos campos do card — pode ter sido editado/pré-preenchido. */
  onConfirmarSugestao?: ((campos: CamposGranatum) => void) | undefined;
  /** Sugestão cuja ligação o usuário interrompeu (fica fora do "Conciliar todas"). */
  interrompida?: boolean | undefined;
  onAlternarInterrupcao?: (() => void) | undefined;
  onIniciarVinculo: () => void;
  onCancelarVinculo: () => void;
  onLigarAqui: () => void;
  onSalvo: () => void;
  onIgnorar: () => void;
  onRestaurar: () => void;
}) {
  // O Granatum rejeita lançamento em categoria/centro que tenha filhos — só
  // folhas da árvore são opções válidas, qualquer que seja a profundidade.
  const categoriasFolha = useMemo(
    () => folhas(categorias.filter((c) => c.tipo === item.tipo || c.tipo === "mista")),
    [categorias, item.tipo],
  );
  const centrosFolha = useMemo(() => folhas(centros), [centros]);

  const descricao = campos.descricao;
  const categoriaId = campos.categoriaId ?? "";
  const centroCustoId = campos.centroCustoId ?? "";
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      await editarLancamento({
        data: {
          id: item.id,
          descricao,
          categoriaId: categoriaId || undefined,
          centroCustoId: centroCustoId || null,
          antes: {
            descricao: item.descricao,
            categoriaId: item.categoriaId,
            centroCustoId: item.centroCustoId,
          },
        },
      });
      toast.success("Lançamento atualizado no Granatum");
      onSalvo();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar no Granatum");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className={`corp-card corp-card-hover space-y-3 p-4 ${
        item.tipoPar === "sugestao"
          ? interrompida
            ? "border-dashed border-destructive/50"
            : "border-dashed border-gold/50"
          : ""
      } ${modoVinculo === "origem" ? "border-primary shadow-glow" : ""} ${
        modoVinculo === "alvo" ? "border-gold" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {formatarDataCurta(item.data)}
          {item.pago ? null : " · vencimento, em aberto"}
        </p>
        <div className="flex flex-wrap justify-end gap-1">
          {item.foraDoPeriodo && item.tipoPar === "sugestao" ? (
            <span className="chip border-gold bg-gold/10 text-gold">Fora do período</span>
          ) : null}
          {badge(item.tipoPar, item.ignorado, interrompida ?? false)}
        </div>
      </div>

      {item.foraDoPeriodo && item.tipoPar === "sugestao" ? (
        <p className="flex items-start gap-2 border border-gold/60 bg-gold/10 p-3 text-xs text-body">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <span>
            Fatura em aberto com o mesmo valor, vencimento em {formatarDataCurta(item.data)} — fora
            do período buscado. Se for este pagamento, confirme pra dar baixa com a data do Asaas,
            em vez de criar outro lançamento.
          </span>
        </p>
      ) : null}

      <Input value={descricao} onChange={(e) => onMudarCampos({ descricao: e.target.value })} />

      {!item.categoriaId ? (
        <AvisoSugestao sugestao={sugestao} buscando={buscandoSugestao ?? false} />
      ) : null}

      <div className="grid gap-2">
        <div className="space-y-1">
          <Label className="lbl">Categoria</Label>
          <Select value={categoriaId} onValueChange={(v) => onMudarCampos({ categoriaId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {categoriasFolha.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.caminho}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="lbl">Centro de custo</Label>
          <Select value={centroCustoId} onValueChange={(v) => onMudarCampos({ centroCustoId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {centrosFolha.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.caminho}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p
          className={`heading text-lg ${item.tipo === "despesa" ? "text-destructive" : "text-success"}`}
        >
          {formatarMoeda(item.valor)}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          {item.tipoPar === "sugestao" && interrompida ? (
            <Button variant="ghostCorp" size="sm" onClick={onAlternarInterrupcao}>
              <RotateCcw /> Restaurar ligação
            </Button>
          ) : item.tipoPar === "sugestao" ? (
            <>
              <Button
                variant="corp"
                size="sm"
                onClick={() =>
                  onConfirmarSugestao?.({
                    descricao,
                    categoriaId: categoriaId || null,
                    centroCustoId: centroCustoId || null,
                  })
                }
              >
                <Check /> Confirmar
              </Button>
              <Button variant="ghostCorp" size="sm" onClick={onAlternarInterrupcao}>
                <Unlink /> Interromper
              </Button>
            </>
          ) : null}
          {(item.tipoPar === "automatico" || item.tipoPar === "manual") && onDesfazer ? (
            <Button variant="ghostCorp" size="sm" onClick={onDesfazer}>
              <Undo2 /> Desfazer
            </Button>
          ) : null}
          {item.ignorado ? (
            <Button variant="ghostCorp" size="sm" onClick={onRestaurar}>
              <RotateCcw /> Voltar a considerar
            </Button>
          ) : !item.tipoPar ? (
            modoVinculo === "alvo" ? (
              <Button variant="corp" size="sm" onClick={onLigarAqui}>
                <Link2 /> Ligar aqui
              </Button>
            ) : modoVinculo === "origem" ? (
              <Button variant="ghostCorp" size="sm" onClick={onCancelarVinculo}>
                <X /> Cancelar
              </Button>
            ) : (
              <>
                <Button variant="ghostCorp" size="sm" onClick={onIgnorar}>
                  <EyeOff /> Ignorar
                </Button>
                <Button variant="ghostCorp" size="sm" onClick={onIniciarVinculo}>
                  <Link2 /> Ligar
                </Button>
              </>
            )
          ) : null}
          {item.ignorado ? null : (
            <Button variant="corpOutline" size="sm" disabled={salvando} onClick={salvar}>
              {salvando ? "Salvando" : "Salvar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
