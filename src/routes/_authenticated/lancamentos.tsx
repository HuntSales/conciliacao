import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Landmark, Plus, ReceiptText, RefreshCw } from "lucide-react";
import { Shell, TituloPagina } from "@/components/corp/Shell";
import { EmptyState } from "@/components/corp/EmptyState";
import { Button } from "@/components/ui/button";
import { FormNovoLancamento } from "@/components/lancamentos/FormNovoLancamento";
import { listarCadastros } from "@/lib/conciliacao.functions";
import { listarContasLancamento, listarRecentesDaConta } from "@/lib/lancamentos.functions";
import { formatarDataCurta, formatarMoeda } from "@/lib/format";
import { montarNav } from "@/components/corp/nav-padrao";
import { useSuperAdmin } from "@/lib/use-super-admin";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({ meta: [{ title: "Lançamentos — Conciliação" }] }),
  component: LancamentosPage,
});

const CHAVE_ULTIMA_CONTA = "lancamentos:ultima-conta";

function lerUltimaConta(): string | null {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_CONTA);
  } catch {
    return null;
  }
}

function gravarUltimaConta(id: string) {
  try {
    localStorage.setItem(CHAVE_ULTIMA_CONTA, id);
  } catch {
    /* sem storage (aba anônima etc.): só não lembra a conta */
  }
}

function LancamentosPage() {
  const queryClient = useQueryClient();
  const superAdmin = useSuperAdmin();
  const nav = montarNav("lancamentos", superAdmin.data ?? false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [contaId, setContaId] = useState("");

  const contas = useQuery({
    queryKey: ["contas-lancamento"],
    queryFn: () => listarContasLancamento(),
  });
  // Mesma query (e cache) da conciliação.
  const cadastros = useQuery({
    queryKey: ["cadastros"],
    queryFn: () => listarCadastros(),
    staleTime: Infinity,
  });
  const recentes = useQuery({
    queryKey: ["recentes-conta", contaId],
    queryFn: () => listarRecentesDaConta({ data: { contaId } }),
    enabled: novoAberto && Boolean(contaId),
  });

  // Conta inicial: a última usada neste aparelho, senão a primeira da lista.
  useEffect(() => {
    const lista = contas.data?.contas;
    if (!lista?.length || contaId) return;
    const ultima = lerUltimaConta();
    setContaId(lista.some((c) => c.id === ultima) ? (ultima as string) : lista[0]!.id);
  }, [contas.data, contaId]);

  const escolherConta = (id: string) => {
    setContaId(id);
    gravarUltimaConta(id);
  };

  const abrirNovo = (id?: string) => {
    if (id) escolherConta(id);
    setNovoAberto(true);
    window.scrollTo({ top: 0 });
  };

  const nomeCategoria = useMemo(() => {
    const mapa = new Map((cadastros.data?.categorias ?? []).map((c) => [c.id, c.nome]));
    return (id: string | null) => (id ? (mapa.get(id) ?? null) : null);
  }, [cadastros.data]);

  const aoSalvar = () => {
    void queryClient.invalidateQueries({ queryKey: ["recentes-conta", contaId] });
    void queryClient.invalidateQueries({ queryKey: ["contas-lancamento"] });
  };

  const carregando = contas.isLoading || cadastros.isLoading;
  const erro = contas.error ?? cadastros.error;

  return (
    <Shell itens={nav} contexto="Lançamentos">
      <TituloPagina
        titulo="Lançamentos"
        subtitulo="Lance compras e recebimentos em qualquer conta do Granatum — inclusive de bancos sem integração."
        acao={
          novoAberto ? (
            <Button variant="corpOutline" onClick={() => setNovoAberto(false)}>
              <ArrowLeft /> Contas
            </Button>
          ) : (
            <Button variant="corp" size="lg" disabled={!contas.data} onClick={() => abrirNovo()}>
              <Plus /> Novo lançamento
            </Button>
          )
        }
      />

      {erro ? (
        <EmptyState
          icone={Landmark}
          titulo="Não foi possível carregar as contas"
          descricao={erro instanceof Error ? erro.message : "Confira a integração do Granatum."}
          acao={
            <Button variant="corpOutline" onClick={() => void contas.refetch()}>
              <RefreshCw /> Tentar de novo
            </Button>
          }
        />
      ) : carregando ? (
        <p className="text-sm text-muted-foreground">Carregando contas…</p>
      ) : novoAberto && contas.data && cadastros.data ? (
        <div className="mx-auto max-w-2xl space-y-6">
          <FormNovoLancamento
            contas={contas.data.contas}
            contaId={contaId}
            onMudarConta={escolherConta}
            categorias={cadastros.data.categorias}
            centros={cadastros.data.centrosCusto}
            onSalvo={aoSalvar}
          />

          <section className="space-y-3">
            <h2 className="lbl">Últimos lançamentos nesta conta</h2>
            {recentes.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : !recentes.data?.length ? (
              <p className="text-sm text-muted-foreground">
                Nenhum lançamento nos últimos 30 dias.
              </p>
            ) : (
              <ul className="corp-card divide-y divide-border">
                {recentes.data.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-body">{l.descricao}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatarDataCurta(l.data)}
                        {nomeCategoria(l.categoriaId) ? ` · ${nomeCategoria(l.categoriaId)}` : ""}
                        {l.pago ? "" : " · em aberto"}
                      </p>
                    </div>
                    <p
                      className={`shrink-0 text-sm font-semibold ${l.tipo === "despesa" ? "text-destructive" : "text-success"}`}
                    >
                      {formatarMoeda(l.valor)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : !contas.data?.contas.length ? (
        <EmptyState
          icone={Landmark}
          titulo="Nenhuma conta encontrada"
          descricao="Cadastre contas no Granatum e confira a integração em Integrações."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contas.data.contas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => abrirNovo(c.id)}
              className="corp-card corp-card-hover fade-up flex items-center justify-between gap-3 p-4 text-left"
            >
              <div className="min-w-0">
                <p className="heading truncate text-base">{c.nome}</p>
                <p
                  className={`mt-1 text-sm font-semibold ${c.saldo < 0 ? "text-destructive" : "text-body"}`}
                >
                  {formatarMoeda(c.saldo)}
                </p>
                {c.id === contas.data.contaConciliacaoId ? (
                  <span className="chip mt-2">Conciliação</span>
                ) : null}
              </div>
              <span className="flex shrink-0 items-center gap-1 font-label text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                <ReceiptText className="h-4 w-4" /> Lançar
              </span>
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}
