import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, Layers, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Shell, TituloPagina } from "@/components/corp/Shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/corp/EmptyState";
import { FiltroPeriodo, type Periodo } from "@/components/conciliacao/FiltroPeriodo";
import { ResumoTopo } from "@/components/conciliacao/ResumoTopo";
import { CardAsaas, type CamposAsaas, type ModoVinculo } from "@/components/conciliacao/CardAsaas";
import { CardGranatum, type CamposGranatum } from "@/components/conciliacao/CardGranatum";
import { FormConciliarManual } from "@/components/conciliacao/FormConciliarManual";
import { FormCriarLote } from "@/components/conciliacao/FormCriarLote";
import {
  buscarLancamentos,
  confirmarPar,
  criarCadaUmAPartirDoAsaas,
  desfazerPar,
  editarLancamento,
  listarCadastros,
  sugerirEmLote,
  type ItemAsaas,
  type ItemGranatum,
  type SugestaoParaLancamento,
} from "@/lib/conciliacao.functions";
import { hojeIso } from "@/lib/format";
import { montarNav } from "@/components/corp/nav-padrao";
import { useSuperAdmin } from "@/lib/use-super-admin";

export const Route = createFileRoute("/_authenticated/conciliacao")({
  head: () => ({ meta: [{ title: "Conciliação — Asaas × Granatum" }] }),
  component: ConciliacaoPage,
});

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
  const [origemVinculo, setOrigemVinculo] = useState<OrigemVinculo>(null);
  const [parEmDialogo, setParEmDialogo] = useState<{
    asaas: ItemAsaas;
    granatum: ItemGranatum;
  } | null>(null);
  const [rejeitados, setRejeitados] = useState<Set<string>>(new Set());
  const [selecionadosLote, setSelecionadosLote] = useState<Set<string>>(new Set());
  const [loteAberto, setLoteAberto] = useState(false);
  const superAdmin = useSuperAdmin();
  const nav = montarNav("conciliacao", superAdmin.data ?? false);

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

  // Sugestões de categoria/centro de todos os pendentes, pedidas em lote logo
  // depois de cada busca. Ficam em cache por item durante a sessão: uma nova
  // busca (ex.: depois de criar um lançamento) só pede as que ainda não vieram,
  // pra não gastar token de novo com o mesmo item.
  const [sugestoes, setSugestoes] = useState<Record<string, SugestaoParaLancamento>>({});
  const sugestoesPedidas = useRef(new Set<string>());
  const [sugestoesEmAndamento, setSugestoesEmAndamento] = useState<Set<string>>(new Set());

  // O que o usuário já mexeu nos campos de cada card do Asaas. Fica aqui (e
  // não dentro do card) pra "Criar todos" usar a categoria/centro de cada um.
  const [edicoesAsaas, setEdicoesAsaas] = useState<Record<string, Partial<CamposAsaas>>>({});

  const camposAsaas = (item: ItemAsaas): CamposAsaas => {
    const ed = edicoesAsaas[item.id];
    const s = sugestoes[`a:${item.id}`];
    return {
      descricao: ed?.descricao ?? item.descricao,
      categoriaId: ed?.categoriaId ?? s?.categoriaId ?? "",
      centroCustoId: ed?.centroCustoId ?? s?.centroCustoId ?? "",
    };
  };

  const mudarCamposAsaas = (id: string, parcial: Partial<CamposAsaas>) =>
    setEdicoesAsaas((prev) => ({ ...prev, [id]: { ...prev[id], ...parcial } }));

  useEffect(() => {
    const d = busca.data;
    if (!d) return;
    const itens = [
      ...d.asaas
        .filter((a) => !a.tipoPar)
        .map((a) => ({ chave: `a:${a.id}`, descricao: a.descricao, valor: a.valor, tipo: a.tipo })),
      ...d.granatum
        .filter((g) => !g.categoriaId)
        .map((g) => ({ chave: `g:${g.id}`, descricao: g.descricao, valor: g.valor, tipo: g.tipo })),
    ].filter((i) => i.descricao.trim() && !sugestoesPedidas.current.has(i.chave));
    if (itens.length === 0) return;

    const chaves = itens.map((i) => i.chave);
    for (const c of chaves) sugestoesPedidas.current.add(c);
    setSugestoesEmAndamento((prev) => new Set([...prev, ...chaves]));
    sugerirEmLote({ data: { itens } })
      .then((r) => setSugestoes((prev) => ({ ...prev, ...r })))
      .catch(() => {
        // Best-effort: sem sugestão o usuário escolhe manualmente; libera pra
        // tentar de novo na próxima busca.
        for (const c of chaves) sugestoesPedidas.current.delete(c);
      })
      .finally(() =>
        setSugestoesEmAndamento((prev) => {
          const novo = new Set(prev);
          for (const c of chaves) novo.delete(c);
          return novo;
        }),
      );
  }, [busca.data]);

  const buscarNovamente = () => {
    // Uma nova busca não deve carregar seleção/vínculo pendente da busca
    // anterior — senão os cards somem os botões normais achando que ainda tem
    // uma ligação em andamento, e não fica óbvio por quê (o aviso fica lá em
    // cima, fácil de não notar depois de rolar a tela).
    setOrigemVinculo(null);
    setSelecionadosLote(new Set());
    busca.mutate();
  };

  const confirmar = useMutation({
    mutationFn: async ({
      asaas,
      granatum,
      campos,
    }: {
      asaas: ItemAsaas;
      granatum: ItemGranatum;
      campos: CamposGranatum;
    }) => {
      // O card pode ter sido editado ou pré-preenchido pela sugestão — aplica
      // no Granatum antes de confirmar o par, pra "Confirmar" já resolver tudo.
      const mudou =
        campos.descricao !== granatum.descricao ||
        campos.categoriaId !== granatum.categoriaId ||
        campos.centroCustoId !== granatum.centroCustoId;
      if (mudou) {
        await editarLancamento({
          data: {
            id: granatum.id,
            descricao: campos.descricao,
            categoriaId: campos.categoriaId ?? undefined,
            centroCustoId: campos.centroCustoId,
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
          descricao: campos.descricao,
          categoriaId: campos.categoriaId ?? undefined,
          centroCustoId: campos.centroCustoId,
        },
      });
    },
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

  const alternarSelecaoLote = (asaasId: string, marcado: boolean) => {
    setSelecionadosLote((prev) => {
      const novo = new Set(prev);
      if (marcado) novo.add(asaasId);
      else novo.delete(asaasId);
      return novo;
    });
  };

  const itensLote = (dados?.asaas ?? []).filter((a) => selecionadosLote.has(a.id));

  const pendentesAsaasVisiveis = linhasFiltradas
    .map((l) => l.asaas)
    .filter((a): a is ItemAsaas => Boolean(a && !a.tipoPar));
  const todosPendentesSelecionados =
    pendentesAsaasVisiveis.length > 0 &&
    pendentesAsaasVisiveis.every((a) => selecionadosLote.has(a.id));

  const criarTodos = useMutation({
    mutationFn: async (itens: ItemAsaas[]) =>
      criarCadaUmAPartirDoAsaas({
        data: {
          itens: itens.map((i) => {
            const c = camposAsaas(i);
            return {
              asaasId: i.id,
              data: i.data,
              descricao: c.descricao,
              valor: i.valor,
              categoriaId: c.categoriaId,
              centroCustoId: c.centroCustoId || null,
            };
          }),
        },
      }),
    onSuccess: (resultados) => {
      const falhas = resultados.filter((r) => !r.ok);
      if (falhas.length === 0) {
        toast.success(`${resultados.length} lançamento(s) criado(s) e conciliado(s)`);
      } else {
        toast.error(
          `${resultados.length - falhas.length} criado(s), ${falhas.length} falharam: ${falhas[0]?.erro ?? ""}`,
        );
      }
      // Mantém selecionados só os que falharam, pra tentar de novo.
      setSelecionadosLote(new Set(falhas.map((f) => f.asaasId)));
      invalidarBusca();
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Falha ao criar lançamentos"),
  });

  const iniciarCriarTodos = () => {
    const semCategoria = itensLote.filter((i) => !camposAsaas(i).categoriaId);
    if (semCategoria.length > 0) {
      toast.error(
        `${semCategoria.length} lançamento(s) selecionado(s) sem categoria — preencha ou desmarque antes de criar.`,
      );
      return;
    }
    const semDescricao = itensLote.filter((i) => !camposAsaas(i).descricao.trim());
    if (semDescricao.length > 0) {
      toast.error(`${semDescricao.length} lançamento(s) selecionado(s) sem descrição.`);
      return;
    }
    criarTodos.mutate(itensLote);
  };

  return (
    <Shell itens={nav} contexto="Conciliação">
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
          onBuscar={buscarNovamente}
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
              {!origemVinculo &&
              pendentesAsaasVisiveis.length > 0 &&
              !todosPendentesSelecionados ? (
                <Button
                  variant="ghostCorp"
                  size="sm"
                  className="ml-auto"
                  onClick={() =>
                    setSelecionadosLote(
                      (prev) => new Set([...prev, ...pendentesAsaasVisiveis.map((a) => a.id)]),
                    )
                  }
                >
                  <CheckSquare /> Selecionar todos os pendentes
                </Button>
              ) : null}
            </div>

            {origemVinculo ? (
              <div className="corp-card fade-up sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 border-primary/60 p-4 shadow-glow">
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

            {selecionadosLote.size > 0 ? (
              <div className="corp-card fade-up sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 border-primary/60 p-4">
                <p className="text-sm text-body">
                  <strong className="text-foreground">{selecionadosLote.size}</strong> lançamento(s)
                  do Asaas selecionado(s). "Criar" usa a descrição, categoria e centro de custo de
                  cada card.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghostCorp"
                    size="sm"
                    onClick={() => setSelecionadosLote(new Set())}
                  >
                    <X /> Limpar seleção
                  </Button>
                  <Button variant="corpOutline" size="sm" onClick={() => setLoteAberto(true)}>
                    <Layers /> Mesma categoria para todos
                  </Button>
                  <Button
                    variant="corp"
                    size="sm"
                    disabled={criarTodos.isPending}
                    onClick={iniciarCriarTodos}
                  >
                    <Plus />{" "}
                    {criarTodos.isPending
                      ? "Criando"
                      : todosPendentesSelecionados &&
                          selecionadosLote.size === pendentesAsaasVisiveis.length
                        ? "Criar todos"
                        : `Criar ${selecionadosLote.size} selecionado(s)`}
                  </Button>
                </div>
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
                          categorias={cadastros.data?.categorias ?? []}
                          centros={cadastros.data?.centrosCusto ?? []}
                          campos={camposAsaas(linha.asaas)}
                          onMudarCampos={(p) => mudarCamposAsaas(linha.asaas!.id, p)}
                          sugestao={sugestoes[`a:${linha.asaas.id}`]}
                          buscandoSugestao={sugestoesEmAndamento.has(`a:${linha.asaas.id}`)}
                          modoVinculo={modoParaAsaas(linha.asaas)}
                          selecionadoLote={selecionadosLote.has(linha.asaas.id)}
                          onSelecionarLote={
                            origemVinculo
                              ? undefined
                              : (m) => alternarSelecaoLote(linha.asaas!.id, m)
                          }
                          onCriado={invalidarBusca}
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
                          sugestao={sugestoes[`g:${linha.granatum.id}`]}
                          buscandoSugestao={sugestoesEmAndamento.has(`g:${linha.granatum.id}`)}
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
                              ? (campos) =>
                                  confirmar.mutate({
                                    asaas: linha.asaas!,
                                    granatum: linha.granatum!,
                                    campos,
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

      <FormConciliarManual
        key={`${parEmDialogo?.asaas.id ?? "x"}-${parEmDialogo?.granatum.id ?? "x"}`}
        asaas={parEmDialogo?.asaas ?? null}
        granatum={parEmDialogo?.granatum ?? null}
        categorias={cadastros.data?.categorias ?? []}
        centros={cadastros.data?.centrosCusto ?? []}
        sugestao={
          parEmDialogo
            ? (sugestoes[`g:${parEmDialogo.granatum.id}`] ??
              sugestoes[`a:${parEmDialogo.asaas.id}`])
            : undefined
        }
        aberto={Boolean(parEmDialogo)}
        onFechar={() => setParEmDialogo(null)}
        onConciliado={() => {
          setParEmDialogo(null);
          invalidarBusca();
        }}
      />

      <FormCriarLote
        key={[...selecionadosLote].sort().join(",")}
        itens={itensLote}
        sugestoes={sugestoes}
        categorias={cadastros.data?.categorias ?? []}
        centros={cadastros.data?.centrosCusto ?? []}
        aberto={loteAberto}
        onFechar={() => setLoteAberto(false)}
        onCriado={() => {
          setLoteAberto(false);
          setSelecionadosLote(new Set());
          invalidarBusca();
        }}
      />
    </Shell>
  );
}
