import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Backdrop } from "@/components/corp/Backdrop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function caminhoSeguro(valor: unknown): string {
  return typeof valor === "string" && valor.startsWith("/") && !valor.startsWith("//") ? valor : "";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = caminhoSeguro(s["next"]);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [{ title: "Entrar — Conciliação Asaas × Granatum" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (next) window.location.href = next;
        else void navigate({ to: "/conciliacao" });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      if (next) window.location.href = next;
      else void navigate({ to: "/conciliacao" });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível entrar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <Backdrop intensidade="media" />
      <form
        onSubmit={entrar}
        className="corp-card fade-up relative z-10 w-full max-w-sm space-y-6 p-8"
      >
        <div className="text-center">
          <h1 className="display text-3xl">
            Concilia<span className="text-primary">ção</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Asaas × Granatum</p>
        </div>
        <div className="space-y-2">
          <Label className="lbl">E-mail</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label className="lbl">Senha</Label>
          <Input
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" variant="corp" className="w-full" disabled={enviando}>
          {enviando ? "Entrando" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
