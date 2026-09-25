import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatarDataCurta, formatarMoeda } from "@/lib/format";

export type AlvoIgnorar = {
  provedor: "asaas" | "granatum";
  id: string;
  data: string;
  valor: number;
  descricao: string;
};

const nomeOrigem = (p: AlvoIgnorar["provedor"]) => (p === "asaas" ? "Asaas" : "Granatum");

/**
 * Confirmação dupla antes de ignorar um ou vários lançamentos: primeiro
 * explica o efeito, depois pede uma segunda confirmação explícita. Ignorar
 * tira o lançamento dos pendentes e das sugestões (dá pra desfazer no filtro
 * "Ignorados").
 */
export function DialogIgnorar({
  alvos,
  onFechar,
  onConfirmar,
}: {
  alvos: AlvoIgnorar[] | null;
  onFechar: () => void;
  onConfirmar: (alvos: AlvoIgnorar[]) => Promise<void>;
}) {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [salvando, setSalvando] = useState(false);

  const fechar = () => {
    setEtapa(1);
    onFechar();
  };

  if (!alvos || alvos.length === 0) return null;

  const confirmar = async () => {
    setSalvando(true);
    try {
      await onConfirmar(alvos);
      setEtapa(1);
    } finally {
      setSalvando(false);
    }
  };

  const varios = alvos.length > 1;
  const origens = [...new Set(alvos.map((a) => nomeOrigem(a.provedor)))].join(" nem no ");

  return (
    <AlertDialog open onOpenChange={(v) => !v && !salvando && fechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {etapa === 2
              ? "Confirme novamente"
              : varios
                ? `Ignorar ${alvos.length} lançamentos?`
                : "Ignorar este lançamento?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {varios ? (
                <div className="max-h-48 space-y-1 overflow-y-auto border border-border bg-surface p-2 text-xs">
                  {alvos.map((a) => (
                    <div key={`${a.provedor}:${a.id}`} className="flex justify-between gap-2">
                      <span className="truncate text-muted-foreground">
                        {nomeOrigem(a.provedor)} · {formatarDataCurta(a.data)} — {a.descricao}
                      </span>
                      <span className={a.valor < 0 ? "text-destructive" : "text-success"}>
                        {formatarMoeda(a.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="corp-card p-3">
                  <p className="lbl">{nomeOrigem(alvos[0]!.provedor)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatarDataCurta(alvos[0]!.data)}
                  </p>
                  <p className="text-body">{alvos[0]!.descricao}</p>
                  <p
                    className={`heading mt-1 ${alvos[0]!.valor < 0 ? "text-destructive" : "text-success"}`}
                  >
                    {formatarMoeda(alvos[0]!.valor)}
                  </p>
                </div>
              )}
              {etapa === 1 ? (
                <p>
                  {varios ? "Eles deixam" : "Ele deixa"} de aparecer nos pendentes e nunca mais{" "}
                  {varios ? "serão sugeridos" : "será sugerido"} na conciliação. Nada é alterado no{" "}
                  {origens}.
                </p>
              ) : (
                <p className="text-destructive">
                  Tem certeza?{" "}
                  {varios
                    ? `Os ${alvos.length} lançamentos serão ignorados.`
                    : "Este lançamento será ignorado."}{" "}
                  Para voltar a considerar, use o filtro "Ignorados".
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
          {etapa === 1 ? (
            <Button variant="corpOutline" onClick={() => setEtapa(2)}>
              Continuar
            </Button>
          ) : (
            <Button variant="destructive" disabled={salvando} onClick={confirmar}>
              {salvando
                ? "Ignorando"
                : varios
                  ? `Sim, ignorar ${alvos.length} lançamentos`
                  : "Sim, ignorar lançamento"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
