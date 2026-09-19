import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Shell, TituloPagina } from "@/components/corp/Shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/corp/EmptyState";
import { FiltroPeriodo, type Periodo } from "@/components/conciliacao/FiltroPeriodo";
import { ResumoTopo } from "@/components/conciliacao/ResumoTopo";
import { CardAsaas, type ModoVinculo } from "@/components/conciliacao/CardAsaas";
import { CardGranatum } from "@/components/conciliacao/CardGranatum";
import { FormCriarLancamento } from "@/components/conciliacao/FormCriarLancamento";
import { FormConciliarManual } from "@/components/conciliacao/FormConciliarManual";
import {
  buscarLancamentos,
  confirmarPar,
  desfazerPar,
  listarCadastros,
  type ItemAsaas,
  type ItemGranatum,
} from "@/lib/conciliacao.functions";
import { hojeIso } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/conciliacao")({
  head: () => ({ meta: [{ title: "Conciliação — Asaas × Granatum" }] }),
  component: ConciliacaoPage,
});

const NAV = [
  { rotulo: "Conciliação", para: "/conciliacao", exato: true },
  { rotulo: "Integrações", para: "/integracoes" },
  { rotulo: "Histórico", para: "/historico" },
];

type FiltroRapido = "todos" | "conciliados" | "pendentes_asaas" | "pendentes_granatum";

type Linha = { asaas: ItemAsaas | null; granatum: ItemGranatum | null };

type OrigemVinculo =
  { lado: "asaas"; item: ItemAsaas } | { lado: "granatum"; item: ItemGranatum } | null;

function montarLinhas(asaas: ItemAsaas[], granatum: ItemGranatum[]): Linha[] {
  const usados = new Set<string>();
  const linhas: Linha[] = [];
  for (const a of asaas) {
    const g = a.parGranatumId ? (granatum.find((x) => x.id === a.parGranatumId) ?? null) : null;
    if (g) usados.add(g.id);
    linhas.push({ asaas: a, granatum: g });
  }
  for (const g of granatum) {
    if (!usados.has(g.id) && !g.parAsaasId) linhas.push({ asaas: null, granatum: g });
  }
  linhas.sort((x, y) => {
    const da = x.asaas?.data ?? x.granatum?.data ?? "";
    const db = y.asaas?.data ?? y.granatum?.data ?? "";
    return da < db ? 1 : da > db ? -1 : 0;
  });
  return linhas;
}

function ConciliacaoPage() {
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState<Periodo>({
    dataInicio: hojeIso(),
    dataFim: hojeIso(),
    toleranciaDias: 0,
  });
  const [filtro, setFiltro] = useState<FiltroRapido>("todos");
  const [itemParaCriar, setItemParaCriar] = useState<ItemAsaas | null>(null);
  const [origemVinculo, setOrigemVinculo] = useState<OrigemVinculo>(null);
  const [parEmDialogo, setParEmDialogo] = useState<{
    asaas: ItemAsaas;
    granatum: ItemGranatum;
  } | null>(null);
  const [rejeitados, setRejeitados] = useState<Set<string>>(new Set());

  const cadastros = useQuery({
    queryKey: ["cadastros"],
    queryFn: () => listarCadastros(),
    staleTime: Infinity,
  });

  const busca = useMutation({
    mutationFn: () => buscarLancamentos({ data: periodo }),
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Falha ao buscar lançamentos"),
  });

  const invalidarBusca = () => busca.mutate();

  const confirmar = useMutation({
    mutationFn: confirmarPar,
    onSuccess: () => {
      toast.success("Conciliado");
      invalidarBusca();
    },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao conciliar"),
  });

  const desfazer = useMutation({
    mutationFn: desfazerPar,
    onSuccess: () => {
      toast.success("Par desfeito");
      invalidarBusca();
    },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao desfazer"),
  });

  const dados = busca.data;

  const linhas = useMemo(() => {
    if (!dados) return [];
    const asaasAjustado = dados.asaas.map((a) =>
      rejeitados.has(a.id) ? { ...a, parGranatumId: null, tipoPar: null } : a,
    );
    const granatumAjustado = dados.granatum.map((g) =>
      rejeitados.has(g.id) ? { ...g, parAsaasId: null, tipoPar: null } : g,
    );
    return montarLinhas(asaasAjustado, granatumAjustado);
  }, [dados, rejeitados]);

  const linhasFiltradas = linhas.filter((l) => {
    if (filtro === "todos") return true;
    if (filtro === "conciliados") return Boolean(l.asaas && l.granatum);
    if (filtro === "pendentes_asaas") return Boolean(l.asaas && !l.granatum);
    return Boolean(l.granatum && !l.asaas);
  });

  const cancelarVinculo = () => setOrigemVinculo(null);

  const modoParaAsaas = (item: ItemAsaas): ModoVinculo => {
    if (item.tipoPar) return "nenhum";
    if (origemVinculo?.lado === "asaas" && origemVinculo.item.id === item.id) return "origem";
    if (origemVinculo?.lado === "granatum") return "alvo";
    return "nenhum";
  };

  const modoParaGranatum = (item: ItemGranatum): ModoVinculo => {
    if (item.tipoPar) return "nenhum";
    if (origemVinculo?.lado === "granatum" && origemVinculo.item.id === item.id) return "origem";
    if (origemVinculo?.lado === "asaas") return "alvo";
    return "nenhum";
  };

  const ligarComGranatumAlvo = (granatumItem: ItemGranatum) => {
    if (!origemVinculo || origemVinculo.lado !== "asaas") return;
    setParEmDialogo({ asaas: origemVinculo.item, granatum: granatumItem });
    setOrigemVinculo(null);
  };

  const ligarComAsaasAlvo = (asaasItem: ItemAsaas) => {
    if (!origemVinculo || origemVinculo.lado !== "granatum") return;
    setParEmDialogo({ asaas: asaasItem, granatum: origemVinculo.item });
    setOrigemVinculo(null);
  };

  return (
    <Shell itens={NAV} contexto="Conciliação">
      <TituloPagina
        titulo="Conciliação"
        subtitulo="Ligue automaticamente o extrato do Asaas aos lançamentos do Granatum."
        acao={
          <Button variant="ghostCorp" size="sm" onClick={() => cadastros.refetch()}>
            <RefreshCw /> Recarregar cadastros
          </Button>
        }
      />

      <div className="space-y-6">
        <FiltroPeriodo
          periodo={periodo}
          onMudar={setPeriodo}
          onBuscar={() => busca.mutate()}
          buscando={busca.isPending}
        />

        {dados ? (
          <>
            <ResumoTopo
              totalAsaas={dados.resumo.totalAsaas}
              totalGranatum={dados.resumo.totalGranatum}
              conciliadosAsaas={dados.resumo.conciliadosAsaas}
              conciliadosGranatum={dados.resumo.conciliadosGranatum}
              pendentesAsaas={dados.resumo.pendentesAsaas}
              pendentesGranatum={dados.resumo.pendentesGranatum}
              saldoAsaas={dados.resumo.saldoAsaas}
              saldoGranatum={dados.resumo.saldoGranatum}
              saldoGranatumProjetado={dados.resumo.saldoGranatumProjetado}
            />

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["todos", "Todos"],
                  ["conciliados", "Conciliados"],
                  ["pendentes_asaas", "Pendentes Asaas"],
                  ["pendentes_granatum", "Pendentes Granatum"],
                ] as const
              ).map(([valor, rotulo]) => (
                <Button
                  key={valor}
                  variant={filtro === valor ? "corp" : "corpOutline"}
                  size="sm"
                  onClick={() => setFiltro(valor)}
                >
                  {rotulo}
                </Button>
              ))}
            </div>

            {origemVinculo ? (
              <div className="corp-card fade-up flex flex-wrap items-center justify-between gap-3 border-primary/60 p-4">
                <p className="text-sm text-body">
                  Escolha o lançamento do{" "}
                  <strong className="text-foreground">
                    {origemVinculo.lado === "asaas" ? "Granatum" : "Asaas"}
                  </strong>{" "}
                  pra ligar a{" "}
                  <strong className="text-foreground">"{origemVinculo.item.descricao}"</strong> —
                  clique em "Ligar aqui" no card desejado, do outro lado.
                </p>
                <Button variant="ghostCorp" size="sm" onClick={cancelarVinculo}>
                  <X /> Cancelar
                </Button>
              </div>
            ) : null}

            {linhasFiltradas.length === 0 ? (
              <EmptyState
                icone={RefreshCw}
                titulo="Nada por aqui"
                descricao="Nenhum lançamento neste filtro para o período buscado."
              />
            ) : (
              <div className="space-y-3">
                {linhasFiltradas.map((linha, i) => (
                  <div
                    key={`${linha.asaas?.id ?? "x"}-${linha.granatum?.id ?? "x"}-${i}`}
                    className="grid grid-cols-1 items-start gap-0 md:grid-cols-[1fr_32px_1fr]"
                  >
                    <div>
                      {linha.asaas ? (
                        <CardAsaas
                          item={linha.asaas}
                          modoVinculo={modoParaAsaas(linha.asaas)}
                          onCriarNoGranatum={() => setItemParaCriar(linha.asaas)}
                          onIniciarVinculo={() =>
                            setOrigemVinculo({ lado: "asaas", item: linha.asaas! })
                          }
                          onCancelarVinculo={cancelarVinculo}
                          onLigarAqui={() => ligarComAsaasAlvo(linha.asaas!)}
                        />
                      ) : (
                        <div className="h-full rounded-none border border-dashed border-border/50" />
                      )}
                    </div>
                    <div className="hidden justify-center pt-6 md:flex">
                      {linha.asaas && linha.granatum ? (
                        linha.asaas.tipoPar === "sugestao" ? (
                          <div className="flex w-full items-center">
                            <div className="h-3 w-3 shrink-0 rounded-full border-2 border-gold bg-surface" />
                            <div className="w-full flex-1 border-t-[3px] border-dashed border-gold" />
                            <div className="h-3 w-3 shrink-0 rounded-full border-2 border-gold bg-surface" />
                          </div>
                        ) : (
                          <div className="flex w-full items-center">
                            <div className="h-3 w-3 shrink-0 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
                            <div
                              className="w-full flex-1 bg-primary shadow-[0_0_8px_var(--color-primary)]"
                              style={{ height: 3 }}
                            />
                            <div className="h-3 w-3 shrink-0 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
                          </div>
                        )
                      ) : null}
                    </div>
                    <div>
                      {linha.granatum ? (
                        <CardGranatum
                          item={linha.granatum}
                          categorias={cadastros.data?.categorias ?? []}
                          centros={cadastros.data?.centrosCusto ?? []}
                          modoVinculo={modoParaGranatum(linha.granatum)}
                          onSalvo={invalidarBusca}
                          onIniciarVinculo={() =>
                            setOrigemVinculo({ lado: "granatum", item: linha.granatum! })
                          }
                          onCancelarVinculo={cancelarVinculo}
                          onLigarAqui={() => ligarComGranatumAlvo(linha.granatum!)}
                          onDesfazer={
                            linha.asaas
                              ? () => desfazer.mutate({ data: { asaasId: linha.asaas!.id } })
                              : undefined
                          }
                          onConfirmarSugestao={
                            linha.asaas
                              ? () =>
                                  confirmar.mutate({
                                    data: {
                                      asaasId: linha.asaas!.id,
                                      granatumId: linha.granatum!.id,
                                      data: linha.granatum!.data,
                                      valor: linha.granatum!.valor,
                                      tipo: "manual",
                                      descricao: linha.granatum!.descricao,
                                      categoriaId: linha.granatum!.categoriaId ?? undefined,
                                      centroCustoId: linha.granatum!.centroCustoId,
                                    },
                                  })
                              : undefined
                          }
                          onRejeitarSugestao={() => {
                            if (!linha.asaas || !linha.granatum) return;
                            setRejeitados((prev) =>
                              new Set(prev).add(linha.asaas!.id).add(linha.granatum!.id),
                            );
                          }}
                        />
                      ) : (
                        <div className="h-full rounded-none border border-dashed border-border/50" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icone={RefreshCw}
            titulo="Nenhum dado carregado"
            descricao="Escolha o período e clique em 'Buscar lançamentos' para começar a conciliar."
          />
        )}
      </div>

      <FormCriarLancamento
        key={itemParaCriar?.id ?? "vazio"}
        item={itemParaCriar}
        categorias={cadastros.data?.categorias ?? []}
        centros={cadastros.data?.centrosCusto ?? []}
        aberto={Boolean(itemParaCriar)}
        onFechar={() => setItemParaCriar(null)}
        onCriado={() => {
          setItemParaCriar(null);
          invalidarBusca();
        }}
      />

      <FormConciliarManual
        key={`${parEmDialogo?.asaas.id ?? "x"}-${parEmDialogo?.granatum.id ?? "x"}`}
        asaas={parEmDialogo?.asaas ?? null}
        granatum={parEmDialogo?.granatum ?? null}
        categorias={cadastros.data?.categorias ?? []}
        centros={cadastros.data?.centrosCusto ?? []}
        aberto={Boolean(parEmDialogo)}
        onFechar={() => setParEmDialogo(null)}
        onConciliado={() => {
          setParEmDialogo(null);
          invalidarBusca();
        }}
      />
    </Shell>
  );
}
