import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  criarLoteAPartirDoAsaas,
  type ItemAsaas,
  type SugestaoParaLancamento,
} from "@/lib/conciliacao.functions";
import { folhas } from "@/lib/hierarquia";
import type { CategoriaGranatum, CentroCustoGranatum } from "@/lib/mcp/tipos";

export function FormCriarLote({
  itens,
  sugestoes,
  categorias,
  centros,
  aberto,
  onFechar,
  onCriado,
}: {
  itens: ItemAsaas[];
  sugestoes: Record<string, SugestaoParaLancamento>;
  categorias: CategoriaGranatum[];
  centros: CentroCustoGranatum[];
  aberto: boolean;
  onFechar: () => void;
  onCriado: () => void;
}) {
  // Pré-preenche só se todos os selecionados tiverem a mesma sugestão.
  const unanime = (campo: "categoriaId" | "centroCustoId") => {
    const valores = new Set(itens.map((i) => sugestoes[`a:${i.id}`]?.[campo] ?? null));
    const [unico] = valores;
    return valores.size === 1 && unico ? unico : "";
  };
  const [categoriaId, setCategoriaId] = useState(() => unanime("categoriaId"));
  const [centroCustoId, setCentroCustoId] = useState(() => unanime("centroCustoId"));
  const [salvando, setSalvando] = useState(false);

  // Se os itens selecionados misturarem receita e despesa, só oferece
  // categorias "mista" — não dá pra aplicar uma única categoria de tipo fixo
  // nos dois sentidos ao mesmo tempo.
  const tiposPresentes = new Set(itens.map((i) => i.tipo));
  const tipoComum = tiposPresentes.size === 1 ? [...tiposPresentes][0] : null;

  const categoriasFolha = useMemo(
    () =>
      folhas(
        categorias.filter(
          (c) => c.tipo === "mista" || (tipoComum !== null && c.tipo === tipoComum),
        ),
      ),
    [categorias, tipoComum],
  );
  const centrosFolha = useMemo(() => folhas(centros), [centros]);

  if (itens.length === 0) return null;

  const salvar = async () => {
    if (!categoriaId) {
      toast.error("Selecione a categoria");
      return;
    }
    setSalvando(true);
    try {
      const resultados = await criarLoteAPartirDoAsaas({
        data: {
          itens: itens.map((i) => ({
            asaasId: i.id,
            data: i.data,
            descricao: i.descricao,
            valor: i.valor,
          })),
          categoriaId,
          centroCustoId: centroCustoId || null,
        },
      });
      const falhas = resultados.filter((r) => !r.ok);
      if (falhas.length === 0) {
        toast.success(`${resultados.length} lançamentos criados e conciliados`);
      } else {
        toast.error(
          `${resultados.length - falhas.length} criados, ${falhas.length} falharam: ${falhas[0]?.erro ?? ""}`,
        );
      }
      onCriado();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao criar lançamentos em lote");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar {itens.length} lançamentos no Granatum</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="max-h-40 space-y-1 overflow-y-auto border border-border bg-surface p-2 text-xs">
            {itens.map((i) => (
              <div key={i.id} className="flex justify-between gap-2">
                <span className="truncate text-muted-foreground">
                  {formatarDataCurta(i.data)} — {i.descricao}
                </span>
                <span className={i.tipo === "despesa" ? "text-destructive" : "text-success"}>
                  {formatarMoeda(i.valor)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Cada lançamento mantém sua própria descrição, valor e data — a categoria e o centro de
            custo abaixo são aplicados a todos.
          </p>
          <div className="grid gap-3">
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
        </div>
        <DialogFooter>
          <Button variant="ghostCorp" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="corp" disabled={salvando} onClick={salvar}>
            {salvando ? "Criando" : `Criar ${itens.length} lançamentos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
