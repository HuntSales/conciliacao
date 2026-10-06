import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, CheckSquare, EyeOff, Layers, Plus, RefreshCw, Unlink, X } from "lucide-react";
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
import { DialogIgnorar, type AlvoIgnorar } from "@/components/conciliacao/DialogIgnorar";
import {
  buscarLancamentos,
  confirmarPar,
  criarCadaUmAPartirDoAsaas,
  desfazerPar,
  editarLancamento,
  ignorarLancamentos,
  listarCadastros,
  recusarSugestao,
  restaurarLancamento,
  restaurarSugestao,
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

type FiltroRapido =
  "todos" | "conciliados" | "pendentes_asaas" | "pendentes_granatum" | "ignorados";

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
  // Sugestões cuja ligação o usuário interrompeu (por id do Asaas). Já vão
  // gravadas no banco na hora do clique (nunca mais sugeridas); aqui só
  // mantém os dois cards lado a lado até a próxima busca, pra dar pra
  // restaurar com outro clique, e tira do "Conciliar todas".
  const [interrompidas, setInterrompidas] = useState<Set<string>>(new Set());
  // Seleção é só do lado do Asaas (o que ainda pode ser criado no Granatum).
  // Os cards do Granatum não têm seleção — pedido explícito, pra não parecer
  // que dá pra criar de novo o que já existe lá.
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

  // Mesmo esquema pros cards do Granatum: "Conciliar todas" usa o que está em
  // cada card. Sem categoria no Granatum, pré-preenche com a sugestão
  // (histórico/IA) — só grava ao Salvar/Confirmar.
  const [edicoesGranatum, setEdicoesGranatum] = useState<Record<string, Partial<CamposGranatum>>>(
    {},
  );

  const camposGranatum = (item: ItemGranatum): CamposGranatum => {
    const ed = edicoesGranatum[item.id];
    const s = item.categoriaId ? undefined : sugestoes[`g:${item.id}`];
    return {
      descricao: ed?.descricao ?? item.descricao,
      categoriaId: ed?.categoriaId ?? item.categoriaId ?? s?.categoriaId ?? null,
      centroCustoId: ed?.centroCustoId ?? item.centroCustoId ?? s?.centroCustoId ?? null,
    };
  };

  const mudarCamposGranatum = (id: string, parcial: Partial<CamposGranatum>) =>
    setEdicoesGranatum((prev) => ({ ...prev, [id]: { ...prev[id], ...parcial } }));

  useEffect(() => {
    const d = busca.data;
    if (!d) return;
    const itens = [
      ...d.asaas
        .filter((a) => !a.tipoPar && !a.ignorado)
        .map((a) => ({ chave: `a:${a.id}`, descricao: a.descricao, valor: a.valor, tipo: a.tipo })),
      ...d.granatum
        .filter((g) => !g.categoriaId && !g.ignorado)
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
    setInterrompidas(new Set());
    busca.mutate();
  };

  const conciliarSugestao = async ({
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
        ...(granatum.pago ? {} : { baixarEm: asaas.data }),
      },
    });
  };

  const confirmar = useMutation({
    mutationFn: conciliarSugestao,
    onSuccess: () => {
      toast.success("Conciliado");
      invalidarBusca();
    },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao conciliar"),
  });

  // Um por um, sem abortar no meio: cada sugestão tem seu próprio sucesso/falha.
  const conciliarTodas = useMutation({
    mutationFn: async (pares: { asaas: ItemAsaas; granatum: ItemGranatum }[]) => {
      const falhas: string[] = [];
      for (const par of pares) {
        try {
          await conciliarSugestao({ ...par, campos: camposGranatum(par.granatum) });
        } catch (erro) {
          falhas.push(
            `${par.asaas.descricao}: ${erro instanceof Error ? erro.message : "falha ao conciliar"}`,
          );
        }
      }
      return { total: pares.length, falhas };
    },
    onSuccess: ({ total, falhas }) => {
      if (falhas.length === 0) toast.success(`${total} sugestão(ões) conciliada(s)`);
      else
        toast.error(
          `${total - falhas.length} conciliada(s), ${falhas.length} falharam — ${falhas[0] ?? ""}`,
        );
      invalidarBusca();
    },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao conciliar"),
  });

  const alternarInterrupcao = async (asaas: ItemAsaas, granatum: ItemGranatum) => {
    const interromper = !interrompidas.has(asaas.id);
    const aplicar = (marcar: boolean) =>
      setInterrompidas((prev) => {
        const novo = new Set(prev);
        if (marcar) novo.add(asaas.id);
        else novo.delete(asaas.id);
        return novo;
      });
    aplicar(interromper);
    try {
      const par = { data: { asaasId: asaas.id, granatumId: granatum.id } };
      if (interromper) await recusarSugestao(par);
      else await restaurarSugestao(par);
    } catch (erro) {
      aplicar(!interromper);
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar a interrupção");
    }
  };

  const desfazer = useMutation({
    mutationFn: desfazerPar,
    onSuccess: () => {
      toast.success("Par desfeito");
      invalidarBusca();
    },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao desfazer"),
  });

  const dados = busca.data;

  // Depois de cada busca, tira da seleção de criação o que ganhou par ou
  // passou a aparecer como já existente no Granatum.
  useEffect(() => {
    if (!dados) return;
    const bloqueados = new Set(
      dados.asaas.filter((a) => a.tipoPar || a.ignorado || a.jaNoGranatum).map((a) => a.id),
    );
    setSelecionadosLote((prev) =>
      [...prev].some((id) => bloqueados.has(id))
        ? new Set([...prev].filter((id) => !bloqueados.has(id)))
        : prev,
    );
  }, [dados]);

  const linhas = useMemo(() => {
    if (!dados) return [];
    return montarLinhas(dados.asaas, dados.granatum);
  }, [dados]);

  const linhasFiltradas = linhas.filter((l) => {
    const ignorada = Boolean(l.asaas?.ignorado || l.granatum?.ignorado);
    if (filtro === "ignorados") return ignorada;
    if (ignorada) return false;
    if (filtro === "todos") return true;
    if (filtro === "conciliados") return Boolean(l.asaas && l.granatum);
    if (filtro === "pendentes_asaas") return Boolean(l.asaas && !l.granatum);
    return Boolean(l.granatum && !l.asaas);
  });

  const cancelarVinculo = () => setOrigemVinculo(null);

  const [paraIgnorar, setParaIgnorar] = useState<AlvoIgnorar[] | null>(null);

  const confirmarIgnorar = async (alvos: AlvoIgnorar[]) => {
    try {
      const resultados = await ignorarLancamentos({ data: { itens: alvos } });
      const falhas = resultados.filter((r) => !r.ok);
      if (falhas.length === 0) {
        toast.success(
          resultados.length === 1
            ? "Lançamento ignorado"
            : `${resultados.length} lançamentos ignorados`,
        );
      } else {
        toast.error(
          `${resultados.length - falhas.length} ignorado(s), ${falhas.length} não: ${falhas[0]?.erro ?? ""}`,
        );
      }
      const ok = resultados.filter((r) => r.ok);
      const tirar = (provedor: "asaas" | "granatum") => (prev: Set<string>) => {
        const novo = new Set(prev);
        for (const r of ok) if (r.provedor === provedor) novo.delete(r.id);
        return novo;
      };
      setSelecionadosLote(tirar("asaas"));
      setParaIgnorar(null);
      invalidarBusca();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao ignorar");
    }
  };

  const restaurar = async (provedor: "asaas" | "granatum", id: string) => {
    try {
      await restaurarLancamento({ data: { provedor, id } });
      toast.success("Lançamento voltou pra conciliação");
      invalidarBusca();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao restaurar");
    }
  };

  const modoParaAsaas = (item: ItemAsaas): ModoVinculo => {
    if (item.tipoPar || item.ignorado) return "nenhum";
    if (origemVinculo?.lado === "asaas" && origemVinculo.item.id === item.id) return "origem";
    if (origemVinculo?.lado === "granatum") return "alvo";
    return "nenhum";
  };

  const modoParaGranatum = (item: ItemGranatum): ModoVinculo => {
    if (item.tipoPar || item.ignorado) return "nenhum";
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

  // Item que já parece existir no Granatum nunca entra num lote de criação.
  const itensLote = (dados?.asaas ?? []).filter(
    (a) => selecionadosLote.has(a.id) && !a.jaNoGranatum,
  );
  const totalSelecionados = selecionadosLote.size;

  const iniciarIgnorarTodos = () =>
    setParaIgnorar(
      itensLote.map((a) => ({
        provedor: "asaas" as const,
        id: a.id,
        data: a.data,
        valor: a.valor,
        descricao: a.descricao,
      })),
    );

  // Só o que ainda não está no Granatum pode ser selecionado pra criar.
  const pendentesAsaasVisiveis = linhasFiltradas
    .map((l) => l.asaas)
    .filter((a): a is ItemAsaas => Boolean(a && !a.tipoPar && !a.ignorado && !a.jaNoGranatum));
  const todosPendentesSelecionados =
    pendentesAsaasVisiveis.length > 0 &&
    pendentesAsaasVisiveis.every((a) => selecionadosLote.has(a.id));
  const podeSelecionarMais = pendentesAsaasVisiveis.some((a) => !selecionadosLote.has(a.id));

  const sugestoesVisiveis = linhasFiltradas.flatMap((l) =>
    l.asaas?.tipoPar === "sugestao" && l.granatum ? [{ asaas: l.asaas, granatum: l.granatum }] : [],
  );
  const sugestoesParaConciliar = sugestoesVisiveis.filter((p) => !interrompidas.has(p.asaas.id));

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
                  ["ignorados", "Ignorados"],
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
              {!origemVinculo && sugestoesVisiveis.length > 0 ? (
                <Button
                  variant="corp"
                  size="sm"
                  className="ml-auto"
                  disabled={sugestoesParaConciliar.length === 0 || conciliarTodas.isPending}
                  title="Interrompa (clicando na linha entre os cards) as ligações erradas antes"
                  onClick={() => conciliarTodas.mutate(sugestoesParaConciliar)}
                >
                  <CheckCheck />{" "}
                  {conciliarTodas.isPending
                    ? "Conciliando"
                    : sugestoesParaConciliar.length === sugestoesVisiveis.length
                      ? `Conciliar todas as sugestões (${sugestoesVisiveis.length})`
                      : `Conciliar selecionadas (${sugestoesParaConciliar.length})`}
                </Button>
              ) : null}
              {!origemVinculo && podeSelecionarMais ? (
                <Button
                  variant="ghostCorp"
                  size="sm"
                  className={sugestoesVisiveis.length > 0 ? "" : "ml-auto"}
                  onClick={() => {
                    setSelecionadosLote(
                      (prev) => new Set([...prev, ...pendentesAsaasVisiveis.map((a) => a.id)]),
                    );
                  }}
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

            {totalSelecionados > 0 ? (
              <div className="corp-card fade-up sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 border-primary/60 p-4">
                <p className="text-sm text-body">
                  <strong className="text-foreground">{totalSelecionados}</strong> lançamento(s)
                  selecionado(s) do Asaas. "Criar" usa a descrição, categoria e centro de custo de
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
                  <Button variant="ghostCorp" size="sm" onClick={iniciarIgnorarTodos}>
                    <EyeOff /> Ignorar {totalSelecionados === 1 ? "selecionado" : "todos"}
                  </Button>
                  {selecionadosLote.size > 0 ? (
                    <>
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
                    </>
                  ) : null}
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
                          onIgnorar={() =>
                            setParaIgnorar([
                              {
                                provedor: "asaas",
                                id: linha.asaas!.id,
                                data: linha.asaas!.data,
                                valor: linha.asaas!.valor,
                                descricao: linha.asaas!.descricao,
                              },
                            ])
                          }
                          onRestaurar={() => restaurar("asaas", linha.asaas!.id)}
                          existenteNoGranatum={dados?.granatum.find(
                            (g) => g.id === linha.asaas!.jaNoGranatum?.granatumId,
                          )}
                          onLigarExistente={
                            origemVinculo
                              ? undefined
                              : () => {
                                  const g = dados?.granatum.find(
                                    (x) => x.id === linha.asaas!.jaNoGranatum?.granatumId,
                                  );
                                  if (g) setParEmDialogo({ asaas: linha.asaas!, granatum: g });
                                }
                          }
                        />
                      ) : (
                        <div className="h-full rounded-none border border-dashed border-border/50" />
                      )}
                    </div>
                    <div className="hidden justify-center pt-6 md:flex">
                      {linha.asaas && linha.granatum ? (
                        linha.asaas.tipoPar === "sugestao" ? (
                          interrompidas.has(linha.asaas.id) ? (
                            <button
                              type="button"
                              title="Ligação interrompida — clique pra restaurar"
                              onClick={() => alternarInterrupcao(linha.asaas!, linha.granatum!)}
                              className="relative flex w-full items-center py-2"
                            >
                              <div className="h-3 w-3 shrink-0 rounded-full border-2 border-destructive bg-surface" />
                              <div className="w-full flex-1 border-t-[3px] border-dashed border-destructive/60" />
                              <div className="h-3 w-3 shrink-0 rounded-full border-2 border-destructive bg-surface" />
                              <X className="absolute left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-surface text-destructive" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Clique pra interromper esta ligação"
                              onClick={() => alternarInterrupcao(linha.asaas!, linha.granatum!)}
                              className="group relative flex w-full items-center py-2"
                            >
                              <div className="h-3 w-3 shrink-0 rounded-full border-2 border-gold bg-surface" />
                              <div className="w-full flex-1 border-t-[3px] border-dashed border-gold group-hover:border-destructive/60" />
                              <div className="h-3 w-3 shrink-0 rounded-full border-2 border-gold bg-surface" />
                              <Unlink className="absolute left-1/2 hidden h-4 w-4 -translate-x-1/2 rounded-full bg-surface text-destructive group-hover:block" />
                            </button>
                          )
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
                          campos={camposGranatum(linha.granatum)}
                          onMudarCampos={(p) => mudarCamposGranatum(linha.granatum!.id, p)}
                          sugestao={sugestoes[`g:${linha.granatum.id}`]}
                          buscandoSugestao={sugestoesEmAndamento.has(`g:${linha.granatum.id}`)}
                          modoVinculo={modoParaGranatum(linha.granatum)}
                          onSalvo={invalidarBusca}
                          onIniciarVinculo={() =>
                            setOrigemVinculo({ lado: "granatum", item: linha.granatum! })
                          }
                          onCancelarVinculo={cancelarVinculo}
                          onLigarAqui={() => ligarComGranatumAlvo(linha.granatum!)}
                          onIgnorar={() =>
                            setParaIgnorar([
                              {
                                provedor: "granatum",
                                id: linha.granatum!.id,
                                data: linha.granatum!.data,
                                valor: linha.granatum!.valor,
                                descricao: linha.granatum!.descricao,
                              },
                            ])
                          }
                          onRestaurar={() => restaurar("granatum", linha.granatum!.id)}
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
                          interrompida={Boolean(linha.asaas && interrompidas.has(linha.asaas.id))}
                          onAlternarInterrupcao={
                            linha.asaas
                              ? () => alternarInterrupcao(linha.asaas!, linha.granatum!)
                              : undefined
                          }
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

      <DialogIgnorar
        key={paraIgnorar ? paraIgnorar.map((a) => `${a.provedor}:${a.id}`).join(",") : "vazio"}
        alvos={paraIgnorar}
        onFechar={() => setParaIgnorar(null)}
        onConfirmar={confirmarIgnorar}
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
