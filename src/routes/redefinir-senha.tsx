import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Backdrop } from "@/components/corp/Backdrop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — Conciliação" },
      {
        name: "description",
        content: "Cadastre uma nova senha de acesso ao sistema de Conciliação.",
      },
    ],
  }),
  component: RedefinirSenha,
});

function RedefinirSenha() {
  const navigate = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [temSessao, setTemSessao] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const conferir = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const tipo = params.get("type");
      if (tokenHash && (tipo === "recovery" || tipo === "invite")) {
        await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
        window.history.replaceState({}, "", "/redefinir-senha");
      }
      const { data } = await supabase.auth.getSession();
      setTemSessao(Boolean(data.session));
      setPronto(true);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      setTemSessao(Boolean(sessao));
      setPronto(true);
    });
    void conferir();
    return () => sub.subscription.unsubscribe();
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha !== confirma) {
      toast.error("As senhas não conferem");
      return;
    }
    setEnviando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      toast.success("Senha atualizada.");
      const { data } = await supabase.auth.getUser();
      const { data: perfil } = await supabase
        .from("profiles")
        .select("empresa_id")
        .eq("id", data.user?.id ?? "")
        .maybeSingle();
      if (perfil?.empresa_id) {
        void navigate({ to: "/conciliacao" });
        return;
      }
      const { data: papeis } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user?.id ?? "");
      const ehSuper = (papeis ?? []).some((p) => p.role === "super_admin");
      void navigate({ to: ehSuper ? "/admin" : "/conciliacao" });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao redefinir senha");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <Backdrop intensidade="media" />
      <div className="fade-up relative z-10 w-full max-w-md border border-border bg-card p-10">
        <div className="absolute left-0 top-0 h-[3px] w-24 bg-primary" />
        <span className="display text-3xl tracking-wide">
          Concilia<span className="text-primary">ção</span>
        </span>
        <h1 className="heading mt-6 text-xl">Defina sua senha</h1>

        {!pronto ? (
          <p className="mt-4 text-sm text-muted-foreground">Validando link...</p>
        ) : !temSessao ? (
          <div className="mt-4 space-y-5">
            <p className="text-sm text-muted-foreground">
              Link inválido ou expirado. Peça um novo convite ao administrador.
            </p>
            <Button variant="corpOutline" onClick={() => void navigate({ to: "/auth" })}>
              Ir para o login
            </Button>
          </div>
        ) : (
          <form onSubmit={enviar} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label className="lbl" htmlFor="senha">
                Nova senha
              </Label>
              <Input
                id="senha"
                type="password"
                required
                minLength={8}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo de 8 caracteres"
              />
            </div>
            <div className="space-y-2">
              <Label className="lbl" htmlFor="confirma">
                Confirme a senha
              </Label>
              <Input
                id="confirma"
                type="password"
                required
                minLength={8}
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
              />
            </div>
            <Button variant="corp" size="lg" className="w-full" type="submit" disabled={enviando}>
              {enviando ? "Salvando" : "Salvar senha"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
