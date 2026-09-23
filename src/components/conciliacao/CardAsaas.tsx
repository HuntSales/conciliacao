import { useEffect, useMemo, useState } from "react";
import { Link2, Plus, X } from "lucide-react";
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
import {
  criarLancamentoAPartirDoAsaas,
  type ItemAsaas,
  type SugestaoParaLancamento,
} from "@/lib/conciliacao.functions";
import { folhas } from "@/lib/hierarquia";
import type { CategoriaGranatum, CentroCustoGranatum } from "@/lib/mcp/tipos";
import { AvisoSugestao } from "./AvisoSugestao";

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
  categorias,
  centros,
  sugestao,
  buscandoSugestao,
  modoVinculo,
  selecionadoLote,
  onSelecionarLote,
  onCriado,
  onIniciarVinculo,
  onCancelarVinculo,
  onLigarAqui,
}: {
  item: ItemAsaas;
  categorias: CategoriaGranatum[];
  centros: CentroCustoGranatum[];
  sugestao: SugestaoParaLancamento | undefined;
  buscandoSugestao: boolean;
  modoVinculo: ModoVinculo;
  selecionadoLote?: boolean | undefined;
  onSelecionarLote?: ((marcado: boolean) => void) | undefined;
  onCriado: () => void;
  onIniciarVinculo: () => void;
  onCancelarVinculo: () => void;
  onLigarAqui: () => void;
}) {
  // O Granatum rejeita lançamento em categoria/centro que tenha filhos — só
  // folhas da árvore são opções válidas, qualquer que seja a profundidade.
  const categoriasFolha = useMemo(
    () => folhas(categorias.filter((c) => c.tipo === item.tipo || c.tipo === "mista")),
    [categorias, item.tipo],
  );
  const centrosFolha = useMemo(() => folhas(centros), [centros]);

  const [descricao, setDescricao] = useState(item.descricao);
  const [categoriaId, setCategoriaId] = useState(sugestao?.categoriaId ?? "");
  const [centroCustoId, setCentroCustoId] = useState(sugestao?.centroCustoId ?? "");
  const [salvando, setSalvando] = useState(false);

  // A sugestão chega depois da busca (em lote, em segundo plano) — só
  // preenche o que o usuário ainda não escolheu.
  useEffect(() => {
    if (!sugestao) return;
    if (sugestao.categoriaId) setCategoriaId((atual) => atual || sugestao.categoriaId!);
    if (sugestao.centroCustoId) setCentroCustoId((atual) => atual || sugestao.centroCustoId!);
  }, [sugestao]);

  const pendente = !item.tipoPar;
  const editavel = pendente && modoVinculo === "nenhum";

  const criar = async () => {
    if (!categoriaId) {
      toast.error("Selecione a categoria");
      return;
    }
    if (!descricao.trim()) {
      toast.error("Preencha a descrição");
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
    <div
      className={`corp-card corp-card-hover p-4 ${
        item.tipoPar === "sugestao" ? "border-dashed border-gold/50" : ""
      } ${modoVinculo === "origem" ? "border-primary shadow-glow" : ""} ${
        modoVinculo === "alvo" ? "border-gold" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {pendente && onSelecionarLote ? (
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

      {editavel ? (
        <div className="mt-3 space-y-2">
          <div className="space-y-1">
            <Label className="lbl">Descrição no Granatum</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <AvisoSugestao sugestao={sugestao} buscando={buscandoSugestao} />
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
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p
          className={`heading text-lg ${item.tipo === "despesa" ? "text-destructive" : "text-success"}`}
        >
          {formatarMoeda(item.valor)}
        </p>
        {pendente ? (
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
                <Button variant="corpOutline" size="sm" disabled={salvando} onClick={criar}>
                  <Plus /> {salvando ? "Criando" : "Criar no Granatum"}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
