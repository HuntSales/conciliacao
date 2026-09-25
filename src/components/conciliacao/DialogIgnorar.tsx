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

/**
 * Confirmação dupla antes de ignorar: primeiro explica o efeito, depois pede
 * uma segunda confirmação explícita. Ignorar tira o lançamento dos pendentes e
 * das sugestões (dá pra desfazer no filtro "Ignorados").
 */
export function DialogIgnorar({
  alvo,
  onFechar,
  onConfirmar,
}: {
  alvo: AlvoIgnorar | null;
  onFechar: () => void;
  onConfirmar: (alvo: AlvoIgnorar) => Promise<void>;
}) {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [salvando, setSalvando] = useState(false);

  const fechar = () => {
    setEtapa(1);
    onFechar();
  };

  if (!alvo) return null;

  const confirmar = async () => {
    setSalvando(true);
    try {
      await onConfirmar(alvo);
      setEtapa(1);
    } finally {
      setSalvando(false);
    }
  };

  const origem = alvo.provedor === "asaas" ? "Asaas" : "Granatum";

  return (
    <AlertDialog open onOpenChange={(v) => !v && !salvando && fechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {etapa === 1 ? "Ignorar este lançamento?" : "Confirme novamente"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <div className="corp-card p-3">
                <p className="lbl">{origem}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatarDataCurta(alvo.data)}</p>
                <p className="text-body">{alvo.descricao}</p>
                <p
                  className={`heading mt-1 ${alvo.valor < 0 ? "text-destructive" : "text-success"}`}
                >
                  {formatarMoeda(alvo.valor)}
                </p>
              </div>
              {etapa === 1 ? (
                <p>
                  Ele deixa de aparecer nos pendentes e nunca mais será sugerido na conciliação.
                  Nada é alterado no {origem}.
                </p>
              ) : (
                <p className="text-destructive">
                  Tem certeza? Este lançamento será ignorado. Para voltar a considerá-lo, use o
                  filtro "Ignorados".
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
              {salvando ? "Ignorando" : "Sim, ignorar lançamento"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
