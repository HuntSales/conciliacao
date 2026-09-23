import { useEffect, useMemo, useState } from "react";
import { Check, Link2, Undo2, X } from "lucide-react";
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

export type CamposGranatum = {
  descricao: string;
  categoriaId: string | null;
  centroCustoId: string | null;
};

function badge(tipoPar: ItemGranatum["tipoPar"]) {
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
  sugestao,
  buscandoSugestao,
  modoVinculo,
  onDesfazer,
  onConfirmarSugestao,
  onRejeitarSugestao,
  onIniciarVinculo,
  onCancelarVinculo,
  onLigarAqui,
  onSalvo,
}: {
  item: ItemGranatum;
  categorias: CategoriaGranatum[];
  centros: CentroCustoGranatum[];
  /** Só vem para lançamento ainda sem categoria no Granatum. */
  sugestao?: SugestaoParaLancamento | undefined;
  buscandoSugestao?: boolean | undefined;
  modoVinculo: ModoVinculo;
  onDesfazer?: (() => void) | undefined;
  /** Recebe o que está nos campos do card — pode ter sido editado/pré-preenchido. */
  onConfirmarSugestao?: ((campos: CamposGranatum) => void) | undefined;
  onRejeitarSugestao?: (() => void) | undefined;
  onIniciarVinculo: () => void;
  onCancelarVinculo: () => void;
  onLigarAqui: () => void;
  onSalvo: () => void;
}) {
  // O Granatum rejeita lançamento em categoria/centro que tenha filhos — só
  // folhas da árvore são opções válidas, qualquer que seja a profundidade.
  const categoriasFolha = useMemo(
    () => folhas(categorias.filter((c) => c.tipo === item.tipo || c.tipo === "mista")),
    [categorias, item.tipo],
  );
  const centrosFolha = useMemo(() => folhas(centros), [centros]);

  const [descricao, setDescricao] = useState(item.descricao);
  const [categoriaId, setCategoriaId] = useState(item.categoriaId ?? "");
  const [centroCustoId, setCentroCustoId] = useState(item.centroCustoId ?? "");
  const [salvando, setSalvando] = useState(false);

  // Sem categoria no Granatum: pré-preenche com a sugestão (histórico/IA),
  // mas só grava quando o usuário clicar em Salvar ou Confirmar.
  useEffect(() => {
    if (!sugestao || item.categoriaId) return;
    if (sugestao.categoriaId) setCategoriaId((atual) => atual || sugestao.categoriaId!);
    if (sugestao.centroCustoId) setCentroCustoId((atual) => atual || sugestao.centroCustoId!);
  }, [sugestao, item.categoriaId]);

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
        item.tipoPar === "sugestao" ? "border-dashed border-gold/50" : ""
      } ${modoVinculo === "origem" ? "border-primary shadow-glow" : ""} ${
        modoVinculo === "alvo" ? "border-gold" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">{formatarDataCurta(item.data)}</p>
        {badge(item.tipoPar)}
      </div>

      <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />

      {!item.categoriaId ? (
        <AvisoSugestao sugestao={sugestao} buscando={buscandoSugestao ?? false} />
      ) : null}

      <div className="grid gap-2">
        <div className="space-y-1">
          <Label className="lbl">Categoria</Label>
          <Select value={categoriaId} onValueChange={setCategoriaId}>
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
          <Select value={centroCustoId} onValueChange={setCentroCustoId}>
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
          {item.tipoPar === "sugestao" ? (
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
              <Button variant="ghostCorp" size="sm" onClick={onRejeitarSugestao}>
                <X /> Rejeitar
              </Button>
            </>
          ) : null}
          {(item.tipoPar === "automatico" || item.tipoPar === "manual") && onDesfazer ? (
            <Button variant="ghostCorp" size="sm" onClick={onDesfazer}>
              <Undo2 /> Desfazer
            </Button>
          ) : null}
          {!item.tipoPar ? (
            modoVinculo === "alvo" ? (
              <Button variant="corp" size="sm" onClick={onLigarAqui}>
                <Link2 /> Ligar aqui
              </Button>
            ) : modoVinculo === "origem" ? (
              <Button variant="ghostCorp" size="sm" onClick={onCancelarVinculo}>
                <X /> Cancelar
              </Button>
            ) : (
              <Button variant="ghostCorp" size="sm" onClick={onIniciarVinculo}>
                <Link2 /> Ligar
              </Button>
            )
          ) : null}
          <Button variant="corpOutline" size="sm" disabled={salvando} onClick={salvar}>
            {salvando ? "Salvando" : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
