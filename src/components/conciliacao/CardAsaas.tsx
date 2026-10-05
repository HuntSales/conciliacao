import { useMemo, useState } from "react";
import { AlertTriangle, EyeOff, Link2, Plus, RotateCcw, X } from "lucide-react";
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
  type ItemGranatum,
  type SugestaoParaLancamento,
} from "@/lib/conciliacao.functions";
import { folhas } from "@/lib/hierarquia";
import type { CategoriaGranatum, CentroCustoGranatum } from "@/lib/mcp/tipos";
import { AvisoSugestao } from "./AvisoSugestao";

function badge(tipoPar: ItemAsaas["tipoPar"], ignorado: boolean) {
  if (ignorado) return <span className="chip">Ignorado</span>;
  if (tipoPar === "automatico" || tipoPar === "manual") {
    return <span className="chip border-success/40 text-success">Conciliado</span>;
  }
  if (tipoPar === "sugestao") {
    return <span className="chip border-gold/40 text-gold">Sugestão</span>;
  }
  return <span className="chip">Sem par</span>;
}

export type ModoVinculo = "nenhum" | "origem" | "alvo";

/** O que vai pro Granatum ao criar — fica na página pra "Criar todos" ler. */
export type CamposAsaas = { descricao: string; categoriaId: string; centroCustoId: string };

export function CardAsaas({
  item,
  categorias,
  centros,
  campos,
  onMudarCampos,
  sugestao,
  buscandoSugestao,
  modoVinculo,
  selecionadoLote,
  onSelecionarLote,
  onCriado,
  onIniciarVinculo,
  onCancelarVinculo,
  onLigarAqui,
  onIgnorar,
  onRestaurar,
  existenteNoGranatum,
  onLigarExistente,
}: {
  item: ItemAsaas;
  categorias: CategoriaGranatum[];
  centros: CentroCustoGranatum[];
  /** Já com a sugestão aplicada no que o usuário ainda não escolheu. */
  campos: CamposAsaas;
  onMudarCampos: (parcial: Partial<CamposAsaas>) => void;
  sugestao: SugestaoParaLancamento | undefined;
  buscandoSugestao: boolean;
  modoVinculo: ModoVinculo;
  selecionadoLote?: boolean | undefined;
  onSelecionarLote?: ((marcado: boolean) => void) | undefined;
  onCriado: () => void;
  onIniciarVinculo: () => void;
  onCancelarVinculo: () => void;
  onLigarAqui: () => void;
  onIgnorar: () => void;
  onRestaurar: () => void;
  /** Lançamento do Granatum apontado por `item.jaNoGranatum`, se estiver na tela. */
  existenteNoGranatum?: ItemGranatum | undefined;
  onLigarExistente?: (() => void) | undefined;
}) {
  // O Granatum rejeita lançamento em categoria/centro que tenha filhos — só
  // folhas da árvore são opções válidas, qualquer que seja a profundidade.
  const categoriasFolha = useMemo(
    () => folhas(categorias.filter((c) => c.tipo === item.tipo || c.tipo === "mista")),
    [categorias, item.tipo],
  );
  const centrosFolha = useMemo(() => folhas(centros), [centros]);

  const { descricao, categoriaId, centroCustoId } = campos;
  const [salvando, setSalvando] = useState(false);
  // Mesmo valor no Granatum pode ser coincidência: criar exige um segundo clique.
  const [confirmandoCriar, setConfirmandoCriar] = useState(false);

  const pendente = !item.tipoPar && !item.ignorado;
  const jaExiste = pendente ? item.jaNoGranatum : null;
  const podeCriar = !jaExiste || (jaExiste.motivo === "valor" && confirmandoCriar);
  const editavel = pendente && modoVinculo === "nenhum" && podeCriar;

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
          {pendente && !jaExiste && onSelecionarLote ? (
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
        {badge(item.tipoPar, item.ignorado)}
      </div>

      {jaExiste && modoVinculo === "nenhum" ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-gold/40 p-3">
          <p className="flex items-start gap-2 text-xs text-body">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>
              {jaExiste.motivo === "identificador"
                ? "Já foi criado no Granatum a partir deste item"
                : "Já existe no Granatum um lançamento sem par com o mesmo valor"}
              {existenteNoGranatum
                ? `: "${existenteNoGranatum.descricao}", ${formatarDataCurta(existenteNoGranatum.data)}`
                : ""}
              . Ligue em vez de criar, pra não duplicar.
            </span>
          </p>
          {onLigarExistente ? (
            <Button variant="corp" size="sm" onClick={onLigarExistente}>
              <Link2 /> Ligar a ele
            </Button>
          ) : null}
        </div>
      ) : null}

      {editavel ? (
        <div className="mt-3 space-y-2">
          <div className="space-y-1">
            <Label className="lbl">Descrição no Granatum</Label>
            <Input
              value={descricao}
              onChange={(e) => onMudarCampos({ descricao: e.target.value })}
            />
          </div>
          <AvisoSugestao sugestao={sugestao} buscando={buscandoSugestao} />
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
              <Select
                value={centroCustoId}
                onValueChange={(v) => onMudarCampos({ centroCustoId: v })}
              >
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
                <Button variant="ghostCorp" size="sm" onClick={onIgnorar}>
                  <EyeOff /> Ignorar
                </Button>
                <Button variant="ghostCorp" size="sm" onClick={onIniciarVinculo}>
                  <Link2 /> Ligar
                </Button>
                {podeCriar ? (
                  <Button variant="corpOutline" size="sm" disabled={salvando} onClick={criar}>
                    <Plus />{" "}
                    {salvando ? "Criando" : jaExiste ? "Confirmar criação" : "Criar no Granatum"}
                  </Button>
                ) : jaExiste?.motivo === "valor" ? (
                  <Button variant="ghostCorp" size="sm" onClick={() => setConfirmandoCriar(true)}>
                    <Plus /> Criar mesmo assim
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : item.ignorado ? (
          <Button variant="ghostCorp" size="sm" onClick={onRestaurar}>
            <RotateCcw /> Voltar a considerar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
