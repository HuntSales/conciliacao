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
import { criarLancamentoAPartirDoAsaas } from "@/lib/conciliacao.functions";
import { filhosDe, nivelSuperior } from "./cadastros";
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
  const [categoriaTopo, setCategoriaTopo] = useState("");
  const [categoriaSub, setCategoriaSub] = useState("");
  const [centroTopo, setCentroTopo] = useState("");
  const [centroSub, setCentroSub] = useState("");
  const [salvando, setSalvando] = useState(false);

  const categoriasDoTipo = useMemo(
    () => categorias.filter((c) => !item || c.tipo === item.tipo || c.tipo === "mista"),
    [categorias, item],
  );
  const subcategorias = filhosDe(categoriasDoTipo, categoriaTopo || null);
  const subcentros = filhosDe(centros, centroTopo || null);

  if (!item) return null;

  const categoriaId = categoriaSub || categoriaTopo;

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
          centroCustoId: centroSub || centroTopo || null,
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
          <div className="grid grid-cols-2 gap-3">
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
              <Select
                value={centroSub}
                onValueChange={setCentroSub}
                disabled={subcentros.length === 0}
              >
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
