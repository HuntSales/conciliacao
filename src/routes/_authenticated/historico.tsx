import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { History } from "lucide-react";
import { Shell, TituloPagina } from "@/components/corp/Shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/corp/EmptyState";
import { FiltroPeriodo, type Periodo } from "@/components/conciliacao/FiltroPeriodo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarDataCurta, formatarMoeda, hojeIso, inicioMesIso } from "@/lib/format";
import { listarHistoricoConciliacoes, listarHistoricoAlteracoes } from "@/lib/historico.functions";
import { montarNav } from "@/components/corp/nav-padrao";
import { useSuperAdmin } from "@/lib/use-super-admin";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({ meta: [{ title: "Histórico — Conciliação" }] }),
  component: HistoricoPage,
});

function rotuloTipo(tipo: string) {
  if (tipo === "automatico") return "Automático";
  if (tipo === "manual") return "Manual";
  return "Sugestão confirmada";
}

function HistoricoPage() {
  const [periodo, setPeriodo] = useState<Periodo>({
    dataInicio: inicioMesIso(),
    dataFim: hojeIso(),
    toleranciaDias: 0,
  });

  const pares = useMutation({ mutationFn: () => listarHistoricoConciliacoes({ data: periodo }) });
  const alteracoes = useMutation({
    mutationFn: () => listarHistoricoAlteracoes({ data: periodo }),
  });

  const buscar = () => {
    pares.mutate();
    alteracoes.mutate();
  };

  const superAdmin = useSuperAdmin();
  const nav = montarNav("historico", superAdmin.data ?? false);

  return (
    <Shell itens={nav} contexto="Histórico">
      <TituloPagina
        titulo="Histórico"
        subtitulo="Conciliações já feitas e alterações no Granatum, por período."
      />
      <div className="space-y-6">
        <FiltroPeriodo
          periodo={periodo}
          onMudar={setPeriodo}
          onBuscar={buscar}
          buscando={pares.isPending || alteracoes.isPending}
        />

        <section className="corp-card p-6">
          <h2 className="heading mb-4 text-lg">Pares conciliados</h2>
          {!pares.data ? (
            <EmptyState
              icone={History}
              titulo="Sem busca ainda"
              descricao="Escolha o período e clique em buscar."
            />
          ) : pares.data.length === 0 ? (
            <EmptyState
              icone={History}
              titulo="Nada encontrado"
              descricao="Nenhuma conciliação neste período."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Asaas</TableHead>
                  <TableHead>Granatum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pares.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatarDataCurta(p.data)}</TableCell>
                    <TableCell>{formatarMoeda(p.valor)}</TableCell>
                    <TableCell>{rotuloTipo(p.tipo)}</TableCell>
                    <TableCell className="font-mono text-xs">{p.asaas_id}</TableCell>
                    <TableCell className="font-mono text-xs">{p.granatum_id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="corp-card p-6">
          <h2 className="heading mb-4 text-lg">Alterações no Granatum</h2>
          {!alteracoes.data ? (
            <EmptyState
              icone={History}
              titulo="Sem busca ainda"
              descricao="Escolha o período e clique em buscar."
            />
          ) : alteracoes.data.length === 0 ? (
            <EmptyState
              icone={History}
              titulo="Nada encontrado"
              descricao="Nenhuma alteração neste período."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Lançamento</TableHead>
                  <TableHead>Antes</TableHead>
                  <TableHead>Depois</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alteracoes.data.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{new Date(a.criado_em).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="font-mono text-xs">{a.lancamento_id}</TableCell>
                    <TableCell className="max-w-64 truncate text-xs">
                      {JSON.stringify(a.antes)}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-xs">
                      {JSON.stringify(a.depois)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </Shell>
  );
}
