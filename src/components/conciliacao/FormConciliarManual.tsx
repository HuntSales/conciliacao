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
import {
  confirmarPar,
  editarLancamento,
  type ItemAsaas,
  type ItemGranatum,
  type SugestaoParaLancamento,
} from "@/lib/conciliacao.functions";
import { folhas } from "@/lib/hierarquia";
import type { CategoriaGranatum, CentroCustoGranatum } from "@/lib/mcp/tipos";
import { AvisoSugestao } from "./AvisoSugestao";

export function FormConciliarManual({
  asaas,
  granatum,
  categorias,
  centros,
  sugestao,
  aberto,
  onFechar,
  onConciliado,
}: {
  asaas: ItemAsaas | null;
  granatum: ItemGranatum | null;
  categorias: CategoriaGranatum[];
  centros: CentroCustoGranatum[];
  /** Já calculada em lote pela tela; só usada se o Granatum estiver sem categoria. */
  sugestao: SugestaoParaLancamento | undefined;
  aberto: boolean;
  onFechar: () => void;
  onConciliado: () => void;
}) {
  const [descricao, setDescricao] = useState(granatum?.descricao ?? "");
  const usarSugestao = !granatum?.categoriaId && sugestao?.origem !== "nenhuma";
  const [categoriaId, setCategoriaId] = useState(
    granatum?.categoriaId ?? (usarSugestao ? sugestao?.categoriaId : null) ?? "",
  );
  const [centroCustoId, setCentroCustoId] = useState(
    granatum?.centroCustoId ?? (usarSugestao ? sugestao?.centroCustoId : null) ?? "",
  );
  const [salvando, setSalvando] = useState(false);

  const categoriasFolha = useMemo(
    () =>
      folhas(categorias.filter((c) => !granatum || c.tipo === granatum.tipo || c.tipo === "mista")),
    [categorias, granatum],
  );
  const centrosFolha = useMemo(() => folhas(centros), [centros]);

  if (!asaas || !granatum) return null;

  const categoriaMudou = categoriaId !== (granatum.categoriaId ?? "");
  const centroMudou = centroCustoId !== (granatum.centroCustoId ?? "");
  const descricaoMudou = descricao !== granatum.descricao;

  const salvar = async () => {
    if (!categoriaId) {
      toast.error("Selecione a categoria");
      return;
    }
    setSalvando(true);
    try {
      if (descricaoMudou || categoriaMudou || centroMudou) {
        await editarLancamento({
          data: {
            id: granatum.id,
            descricao,
            categoriaId,
            centroCustoId: centroCustoId || null,
            antes: {
              descricao: granatum.descricao,
              categoriaId: granatum.categoriaId,
              centroCustoId: granatum.centroCustoId,
            },
          },
        });
      }
      await confirmarPar({
        data: {
          asaasId: asaas.id,
          granatumId: granatum.id,
          data: granatum.data,
          valor: granatum.valor,
          tipo: "manual",
          descricao,
          categoriaId,
          centroCustoId: centroCustoId || null,
          ...(granatum.pago ? {} : { baixarEm: asaas.data }),
        },
      });
      toast.success(granatum.pago ? "Lançamentos conciliados" : "Conciliado e baixado no Granatum");
      onConciliado();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao conciliar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conciliar manualmente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="corp-card p-3">
              <p className="lbl">Asaas</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatarDataCurta(asaas.data)}</p>
              <p className="text-body">{asaas.descricao}</p>
              <p
                className={`heading mt-1 ${asaas.tipo === "despesa" ? "text-destructive" : "text-success"}`}
              >
                {formatarMoeda(asaas.valor)}
              </p>
            </div>
            <div className="corp-card p-3">
              <p className="lbl">Granatum</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatarDataCurta(granatum.data)}
              </p>
              <p className="text-body">{granatum.descricao}</p>
              <p
                className={`heading mt-1 ${granatum.tipo === "despesa" ? "text-destructive" : "text-success"}`}
              >
                {formatarMoeda(granatum.valor)}
              </p>
            </div>
          </div>

          {asaas.valor !== granatum.valor || asaas.data !== granatum.data ? (
            <p className="text-xs text-gold">
              Data e/ou valor não batem exatamente — confira antes de conciliar manualmente.
            </p>
          ) : null}

          {!granatum.pago ? (
            <p className="text-xs text-muted-foreground">
              O lançamento está em aberto no Granatum — ao conciliar, ele será baixado com a data do
              Asaas ({formatarDataCurta(asaas.data)}).
            </p>
          ) : null}

          <div className="space-y-1">
            <Label className="lbl">Descrição (Granatum)</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>

          {usarSugestao ? <AvisoSugestao sugestao={sugestao} buscando={false} /> : null}

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
            {salvando ? "Salvando" : "Salvar e conciliar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
