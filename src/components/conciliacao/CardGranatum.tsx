import { useMemo, useState } from "react";
import { Check, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { editarLancamento, type ItemGranatum } from "@/lib/conciliacao.functions";
import { filhosDe, nivelSuperior, noRaizDe } from "./cadastros";
import type { CategoriaGranatum, CentroCustoGranatum } from "@/lib/mcp/tipos";

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
  selecionavel,
  selecionado,
  onSelecionar,
  onDesfazer,
  onConfirmarSugestao,
  onRejeitarSugestao,
  onSalvo,
}: {
  item: ItemGranatum;
  categorias: CategoriaGranatum[];
  centros: CentroCustoGranatum[];
  selecionavel: boolean;
  selecionado: boolean;
  onSelecionar: (marcado: boolean) => void;
  onDesfazer?: (() => void) | undefined;
  onConfirmarSugestao?: (() => void) | undefined;
  onRejeitarSugestao?: (() => void) | undefined;
  onSalvo: () => void;
}) {
  const categoriasDoTipo = useMemo(
    () => categorias.filter((c) => c.tipo === item.tipo || c.tipo === "mista"),
    [categorias, item.tipo],
  );
  const categoriaTopoInicial = noRaizDe(categoriasDoTipo, item.categoriaId) ?? "";
  const categoriaSubInicial =
    item.categoriaId && item.categoriaId !== categoriaTopoInicial ? item.categoriaId : "";
  const centroTopoInicial = noRaizDe(centros, item.centroCustoId) ?? "";
  const centroSubInicial =
    item.centroCustoId && item.centroCustoId !== centroTopoInicial ? item.centroCustoId : "";

  const [descricao, setDescricao] = useState(item.descricao);
  const [categoriaTopo, setCategoriaTopo] = useState(categoriaTopoInicial);
  const [categoriaSub, setCategoriaSub] = useState(categoriaSubInicial);
  const [centroTopo, setCentroTopo] = useState(centroTopoInicial);
  const [centroSub, setCentroSub] = useState(centroSubInicial);
  const [salvando, setSalvando] = useState(false);

  const subcategorias = filhosDe(categoriasDoTipo, categoriaTopo || null);
  const subcentros = filhosDe(centros, centroTopo || null);

  const salvar = async () => {
    setSalvando(true);
    try {
      await editarLancamento({
        data: {
          id: item.id,
          descricao,
          categoriaId: categoriaSub || categoriaTopo || undefined,
          centroCustoId: centroSub || centroTopo || null,
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
          <p className="text-xs text-muted-foreground">{formatarDataCurta(item.data)}</p>
        </div>
        {badge(item.tipoPar)}
      </div>

      <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="lbl">Categoria</Label>
          <Select
            value={categoriaTopo}
            onValueChange={(v) => {
              setCategoriaTopo(v);
              setCategoriaSub("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {nivelSuperior(categoriasDoTipo).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="lbl">Subcategoria</Label>
          <Select
            value={categoriaSub}
            onValueChange={setCategoriaSub}
            disabled={subcategorias.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={subcategorias.length ? "Selecione" : "—"} />
            </SelectTrigger>
            <SelectContent>
              {subcategorias.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="lbl">Centro de custo</Label>
          <Select
            value={centroTopo}
            onValueChange={(v) => {
              setCentroTopo(v);
              setCentroSub("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {nivelSuperior(centros).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="lbl">Subcentro</Label>
          <Select value={centroSub} onValueChange={setCentroSub} disabled={subcentros.length === 0}>
            <SelectTrigger>
              <SelectValue placeholder={subcentros.length ? "Selecione" : "—"} />
            </SelectTrigger>
            <SelectContent>
              {subcentros.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p
          className={`heading text-lg ${item.tipo === "despesa" ? "text-destructive" : "text-success"}`}
        >
          {formatarMoeda(item.valor)}
        </p>
        <div className="flex gap-2">
          {item.tipoPar === "sugestao" ? (
            <>
              <Button variant="corp" size="sm" onClick={onConfirmarSugestao}>
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
          <Button variant="corpOutline" size="sm" disabled={salvando} onClick={salvar}>
            {salvando ? "Salvando" : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
