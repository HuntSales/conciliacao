import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { criarLancamentoAPartirDoAsaas, sugerirParaLancamento } from "@/lib/conciliacao.functions";
import { folhas } from "@/lib/hierarquia";
import type { CategoriaGranatum, CentroCustoGranatum } from "@/lib/mcp/tipos";
import type { ItemAsaas } from "@/lib/conciliacao.functions";

export function FormCriarLancamento({
  item,
  categorias,
  centros,
  aberto,
  onFechar,
  onCriado,
}: {
  item: ItemAsaas | null;
  categorias: CategoriaGranatum[];
  centros: CentroCustoGranatum[];
  aberto: boolean;
  onFechar: () => void;
  onCriado: () => void;
}) {
  const [descricao, setDescricao] = useState(item?.descricao ?? "");
  const [categoriaId, setCategoriaId] = useState("");
  const [centroCustoId, setCentroCustoId] = useState("");
  const [salvando, setSalvando] = useState(false);

  // O Granatum rejeita lançamento em categoria/centro que tenha filhos — só
  // folhas da árvore são opções válidas, qualquer que seja a profundidade.
  const categoriasFolha = useMemo(
    () => folhas(categorias.filter((c) => !item || c.tipo === item.tipo || c.tipo === "mista")),
    [categorias, item],
  );
  const centrosFolha = useMemo(() => folhas(centros), [centros]);

  const sugestao = useQuery({
    queryKey: ["sugestao-categorizacao", item?.id],
    queryFn: () =>
      sugerirParaLancamento({
        data: { descricao: item!.descricao, valor: item!.valor, tipo: item!.tipo },
      }),
    enabled: Boolean(item) && aberto,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (!sugestao.data) return;
    if (!categoriaId && sugestao.data.categoriaId) setCategoriaId(sugestao.data.categoriaId);
    if (!centroCustoId && sugestao.data.centroCustoId)
      setCentroCustoId(sugestao.data.centroCustoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugestao.data]);

  if (!item) return null;

  const salvar = async () => {
    if (!categoriaId) {
      toast.error("Selecione a categoria");
      return;
    }
    setSalvando(true);
    try {
      await criarLancamentoAPartirDoAsaas({
        data: {
          asaasId: item.id,
          data: item.data,
          descricao,
          valor: item.valor,
          categoriaId,
          centroCustoId: centroCustoId || null,
        },
      });
      toast.success("Lançamento criado no Granatum e conciliado");
      onCriado();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao criar no Granatum");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar lançamento no Granatum</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="lbl">Data</p>
              <p className="mt-1">{formatarDataCurta(item.data)}</p>
            </div>
            <div>
              <p className="lbl">Valor</p>
              <p
                className={`mt-1 ${item.tipo === "despesa" ? "text-destructive" : "text-success"}`}
              >
                {formatarMoeda(item.valor)} ({item.tipo})
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="lbl">Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          {sugestao.isFetching ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Buscando sugestão de categoria e centro de custo…
            </p>
          ) : sugestao.data && sugestao.data.origem !== "nenhuma" ? (
            <p className="flex items-center gap-1.5 text-xs text-gold">
              <Sparkles className="h-3.5 w-3.5" />
              {sugestao.data.origem === "ia"
                ? "Sugerido por IA — confira antes de salvar."
                : "Sugerido com base em lançamento parecido — confira antes de salvar."}
            </p>
          ) : null}
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
            {salvando ? "Criando" : "Criar e conciliar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
