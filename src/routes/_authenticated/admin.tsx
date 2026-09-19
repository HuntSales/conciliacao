import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import { Shell, TituloPagina } from "@/components/corp/Shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/corp/EmptyState";
import {
  listarEmpresas,
  criarEmpresa,
  reenviarConvite,
  souSuperAdmin,
} from "@/lib/empresas.functions";
import { mascaraCnpj } from "@/lib/cnpj";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const ehSuper = await souSuperAdmin();
    if (!ehSuper) throw redirect({ to: "/conciliacao" });
  },
  head: () => ({ meta: [{ title: "Admin — Conciliação" }] }),
  component: AdminPage,
});

const NAV = [
  { rotulo: "Conciliação", para: "/conciliacao" },
  { rotulo: "Integrações", para: "/integracoes" },
  { rotulo: "Histórico", para: "/historico" },
  { rotulo: "Admin", para: "/admin", exato: true },
];

function AdminPage() {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");

  const empresas = useQuery({ queryKey: ["empresas"], queryFn: () => listarEmpresas() });

  const criar = useMutation({
    mutationFn: () => criarEmpresa({ data: { razao_social: razaoSocial, cnpj, email } }),
    onSuccess: (r) => {
      if (r.aviso_convite) {
        toast.error(`Empresa criada, mas o convite não foi enviado: ${r.aviso_convite}`);
      } else {
        toast.success("Empresa criada e convite enviado por e-mail");
      }
      setAberto(false);
      setRazaoSocial("");
      setCnpj("");
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["empresas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar empresa"),
  });

  const reenviar = useMutation({
    mutationFn: (empresa_id: string) => reenviarConvite({ data: { empresa_id } }),
    onSuccess: () => toast.success("Convite reenviado"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao reenviar convite"),
  });

  return (
    <Shell itens={NAV} contexto="Admin">
      <TituloPagina
        titulo="Empresas"
        subtitulo="Cadastre as empresas que têm acesso ao sistema de conciliação."
        acao={
          <Button variant="corp" size="sm" onClick={() => setAberto(true)}>
            <Plus /> Nova empresa
          </Button>
        }
      />

      {empresas.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !empresas.data || empresas.data.length === 0 ? (
        <EmptyState
          icone={Building2}
          titulo="Nenhuma empresa cadastrada"
          descricao="Clique em 'Nova empresa' para cadastrar a primeira."
        />
      ) : (
        <div className="corp-card p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>E-mail de acesso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {empresas.data.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.razao_social}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.cnpj ? mascaraCnpj(e.cnpj) : "—"}
                  </TableCell>
                  <TableCell>{e.email}</TableCell>
                  <TableCell>
                    <span
                      className={`chip ${e.status === "ativa" ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}`}
                    >
                      {e.status === "ativa" ? "Ativa" : "Suspensa"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghostCorp"
                      size="sm"
                      disabled={reenviar.isPending}
                      onClick={() => reenviar.mutate(e.id)}
                    >
                      <Mail /> Reenviar convite
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="lbl">Razão social</Label>
              <Input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="lbl">CNPJ</Label>
              <Input
                value={mascaraCnpj(cnpj)}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="space-y-1">
              <Label className="lbl">E-mail de acesso</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@empresa.com.br"
              />
              <p className="text-xs text-muted-foreground">
                Um convite para definir a senha é enviado para este e-mail.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghostCorp" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              variant="corp"
              disabled={!razaoSocial || !cnpj || !email || criar.isPending}
              onClick={() => criar.mutate()}
            >
              {criar.isPending ? "Criando" : "Criar e convidar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
