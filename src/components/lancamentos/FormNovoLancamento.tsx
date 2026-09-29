import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Save, Square, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AvisoSugestao } from "@/components/conciliacao/AvisoSugestao";
import type { SugestaoParaLancamento } from "@/lib/conciliacao.functions";
import { criarLancamentoManual, sugerirParaLancamento } from "@/lib/lancamentos.functions";
import { interpretarFrase } from "@/lib/extrair-valor";
import { formatarMoeda, hojeIso } from "@/lib/format";
import { folhas } from "@/lib/hierarquia";
import { useVoz } from "@/lib/use-voz";
import type { CategoriaGranatum, CentroCustoGranatum, ContaGranatum } from "@/lib/mcp/tipos";

type Tipo = "receita" | "despesa";

/** "1.234,56", "1234.56", "150" → número; vazio/inválido → null. */
function lerValor(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,]/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number.parseFloat(normalizado);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function escreverValor(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

/** Campos que o usuário mexeu à mão — frase/sugestão não sobrescrevem mais. */
type Tocados = Partial<Record<"descricao" | "valor" | "tipo" | "categoria" | "centro", boolean>>;

export function FormNovoLancamento({
  contas,
  contaId,
  onMudarConta,
  categorias,
  centros,
  onSalvo,
}: {
  contas: ContaGranatum[];
  contaId: string;
  onMudarConta: (id: string) => void;
  categorias: CategoriaGranatum[];
  centros: CentroCustoGranatum[];
  onSalvo: () => void;
}) {
  const [frase, setFrase] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valorTexto, setValorTexto] = useState("");
  const [tipo, setTipo] = useState<Tipo>("despesa");
  const [data, setData] = useState(hojeIso());
  const [pago, setPago] = useState(true);
  const [categoriaId, setCategoriaId] = useState("");
  const [centroCustoId, setCentroCustoId] = useState("");
  const [tocados, setTocados] = useState<Tocados>({});
  const [sugestao, setSugestao] = useState<SugestaoParaLancamento | undefined>();
  const [buscandoSugestao, setBuscandoSugestao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Um id por lançamento: reenviar o mesmo "Salvar" não duplica no Granatum.
  const [idempotencia, setIdempotencia] = useState(() => crypto.randomUUID());

  const categoriasFolha = useMemo(
    () => folhas(categorias.filter((c) => c.tipo === tipo || c.tipo === "mista")),
    [categorias, tipo],
  );
  const centrosFolha = useMemo(() => folhas(centros), [centros]);

  // Categoria escolhida que não serve pro tipo novo (trocou despesa ↔ receita).
  useEffect(() => {
    if (categoriaId && !categoriasFolha.some((c) => c.id === categoriaId)) setCategoriaId("");
  }, [categoriasFolha, categoriaId]);

  const aplicarFrase = (texto: string) => {
    setFrase(texto);
    const r = interpretarFrase(texto);
    if (!tocados.descricao) setDescricao(r.descricao);
    if (!tocados.valor) setValorTexto(r.valor !== null ? escreverValor(r.valor) : "");
    if (!tocados.tipo && r.tipo) setTipo(r.tipo);
  };

  const voz = useVoz((texto) => {
    // Cada fala é uma frase nova: descrição/valor voltam a vir dela.
    setTocados((t) => ({ ...t, descricao: false, valor: false }));
    const r = interpretarFrase(texto);
    setFrase(texto);
    setDescricao(r.descricao);
    setValorTexto(r.valor !== null ? escreverValor(r.valor) : "");
    if (!tocados.tipo && r.tipo) setTipo(r.tipo);
  });

  useEffect(() => {
    if (voz.erro) toast.error(voz.erro);
  }, [voz.erro]);

  const valor = lerValor(valorTexto);

  // Sugestão de categoria/centro: espera a pessoa parar de digitar, e guarda
  // por descrição+tipo+conta pra não pedir de novo (nem gastar token) à toa.
  const cacheSugestoes = useRef(new Map<string, SugestaoParaLancamento>());
  const ultimoPedido = useRef("");
  useEffect(() => {
    const texto = descricao.trim();
    if (texto.length < 3 || !contaId) return;
    const chave = `${contaId}|${tipo}|${texto.toLowerCase()}`;
    const aplicar = (s: SugestaoParaLancamento) => {
      setSugestao(s);
      if (!tocados.categoria && s.categoriaId) setCategoriaId(s.categoriaId);
      if (!tocados.centro && s.centroCustoId) setCentroCustoId(s.centroCustoId);
    };
    const emCache = cacheSugestoes.current.get(chave);
    if (emCache) {
      aplicar(emCache);
      return;
    }
    const timer = setTimeout(() => {
      ultimoPedido.current = chave;
      setBuscandoSugestao(true);
      sugerirParaLancamento({
        data: {
          contaId,
          descricao: texto,
          tipo,
          valor: (valor ?? 0) * (tipo === "despesa" ? -1 : 1),
        },
      })
        .then((s) => {
          cacheSugestoes.current.set(chave, s);
          if (ultimoPedido.current === chave) aplicar(s);
        })
        .catch(() => {
          /* best-effort: sem sugestão a pessoa escolhe na mão */
        })
        .finally(() => {
          if (ultimoPedido.current === chave) setBuscandoSugestao(false);
        });
    }, 900);
    return () => clearTimeout(timer);
    // `valor`/`tocados` de propósito fora: mudar o valor não pede nova sugestão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descricao, tipo, contaId]);

  const limpar = () => {
    setFrase("");
    setDescricao("");
    setValorTexto("");
    setCategoriaId("");
    setCentroCustoId("");
    setTocados({});
    setSugestao(undefined);
    setIdempotencia(crypto.randomUUID());
  };

  const salvar = async () => {
    const faltando = !contaId
      ? "Escolha a conta"
      : !descricao.trim()
        ? "Preencha a descrição"
        : valor === null
          ? "Preencha o valor"
          : !categoriaId
            ? "Selecione a categoria"
            : !data
              ? "Preencha a data"
              : null;
    if (faltando || valor === null) {
      toast.error(faltando ?? "Preencha o valor");
      return;
    }
    setSalvando(true);
    try {
      await criarLancamentoManual({
        data: {
          contaId,
          descricao: descricao.trim(),
          valor,
          tipo,
          data,
          pago,
          categoriaId,
          centroCustoId: centroCustoId || null,
          idempotencia,
        },
      });
      toast.success(
        `${tipo === "despesa" ? "Despesa" : "Receita"} de ${formatarMoeda(valor)} lançada no Granatum`,
      );
      limpar();
      onSalvo();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao lançar no Granatum");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="corp-card fade-up space-y-5 p-4 sm:p-6">
      <div className="space-y-1">
        <Label className="lbl">Conta</Label>
        <Select value={contaId} onValueChange={onMudarConta}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Escolha a conta" />
          </SelectTrigger>
          <SelectContent>
            {contas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="lbl" htmlFor="frase">
          O que foi?
        </Label>
        <div className="flex items-stretch gap-2">
          <Textarea
            id="frase"
            rows={2}
            className="min-h-14 flex-1 resize-none"
            placeholder='Ex.: "gasolina no posto Shell 150 reais"'
            value={voz.ouvindo ? voz.parcial : frase}
            readOnly={voz.ouvindo}
            onChange={(e) => aplicarFrase(e.target.value)}
          />
          {voz.suportado ? (
            <Button
              type="button"
              variant={voz.ouvindo ? "corp" : "corpOutline"}
              className={`h-auto w-14 shrink-0 ${voz.ouvindo ? "animate-pulse" : ""}`}
              onClick={voz.ouvindo ? voz.parar : voz.ouvir}
              aria-label={voz.ouvindo ? "Parar de ouvir" : "Falar o lançamento"}
            >
              {voz.ouvindo ? <Square className="!size-5" /> : <Mic className="!size-6" />}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {voz.ouvindo
            ? "Ouvindo… fale o que comprou e o valor."
            : voz.suportado
              ? "Toque no microfone e fale, ou digite. O valor sai da frase."
              : "Digite o que comprou e o valor (ou use o ditado do teclado do celular)."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["despesa", "receita"] as const).map((t) => (
          <Button
            key={t}
            type="button"
            variant={tipo === t ? "corp" : "corpOutline"}
            className="h-11"
            onClick={() => {
              setTipo(t);
              setTocados((x) => ({ ...x, tipo: true }));
            }}
          >
            {t === "despesa" ? <TrendingDown /> : <TrendingUp />}
            {t === "despesa" ? "Despesa" : "Receita"}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-1">
          <Label className="lbl" htmlFor="descricao">
            Descrição
          </Label>
          <Input
            id="descricao"
            className="h-11"
            value={descricao}
            onChange={(e) => {
              setDescricao(e.target.value);
              setTocados((x) => ({ ...x, descricao: true }));
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="lbl" htmlFor="valor">
            Valor (R$)
          </Label>
          <Input
            id="valor"
            inputMode="decimal"
            className={`h-11 text-lg font-semibold ${tipo === "despesa" ? "text-destructive" : "text-success"}`}
            placeholder="0,00"
            value={valorTexto}
            onChange={(e) => {
              setValorTexto(e.target.value);
              setTocados((x) => ({ ...x, valor: true }));
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-4">
        <div className="space-y-1">
          <Label className="lbl" htmlFor="data">
            {pago ? (tipo === "despesa" ? "Pago em" : "Recebido em") : "Vencimento"}
          </Label>
          <Input
            id="data"
            type="date"
            className="h-11"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <label className="flex h-11 cursor-pointer items-center gap-2 text-sm text-body">
          <Switch checked={pago} onCheckedChange={setPago} />
          {tipo === "despesa" ? "Já pago" : "Já recebido"}
        </label>
      </div>

      <div className="space-y-3">
        <AvisoSugestao sugestao={sugestao} buscando={buscandoSugestao} />
        <div className="space-y-1">
          <Label className="lbl">Categoria</Label>
          <Select
            value={categoriaId}
            onValueChange={(v) => {
              setCategoriaId(v);
              setTocados((x) => ({ ...x, categoria: true }));
            }}
          >
            <SelectTrigger className="h-11">
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
            onValueChange={(v) => {
              setCentroCustoId(v);
              setTocados((x) => ({ ...x, centro: true }));
            }}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Opcional" />
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

      <Button
        type="button"
        variant="corp"
        size="lg"
        className="w-full"
        disabled={salvando || voz.ouvindo}
        onClick={salvar}
      >
        <Save /> {salvando ? "Salvando" : "Salvar lançamento"}
      </Button>
    </div>
  );
}
