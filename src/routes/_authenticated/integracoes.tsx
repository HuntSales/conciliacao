import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plug, Save } from "lucide-react";
import { toast } from "sonner";
import { Shell, TituloPagina } from "@/components/corp/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listarIntegracoes,
  salvarIntegracao,
  testarConexao,
  salvarFallback,
  listarContasParaConfiguracao,
  salvarContaConfigurada,
  salvarIntegracaoIA,
} from "@/lib/integracoes.functions";
import type { Provedor } from "@/lib/mcp/tipos";
import { montarNav } from "@/components/corp/nav-padrao";
import { useSuperAdmin } from "@/lib/use-super-admin";

export const Route = createFileRoute("/_authenticated/integracoes")({
  head: () => ({ meta: [{ title: "Integrações — Conciliação" }] }),
  component: IntegracoesPage,
});

function PainelProvedor({ provedor, titulo }: { provedor: Provedor; titulo: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["integracoes"], queryFn: () => listarIntegracoes() });
  const integracao = data?.integracoes.find((i) => i.provedor === provedor);
  const fallback = data?.fallbacks.find((f) => f.provedor === provedor);
  const mapeamentos = (data?.mapeamentos ?? []).filter((m) => m.provedor === provedor);

  const [nome, setNome] = useState("");
  const [urlMcp, setUrlMcp] = useState("");
  const [transporte, setTransporte] = useState<"http" | "sse">("http");
  const [token, setToken] = useState("");
  const [tokenFallback, setTokenFallback] = useState("");
  const [ambiente, setAmbiente] = useState<"producao" | "sandbox">("producao");
  const [urlBase, setUrlBase] = useState("");
  const [resultadoTeste, setResultadoTeste] = useState<{
    status: string;
    tools?: string[] | undefined;
    erro?: string | undefined;
  } | null>(null);

  useEffect(() => {
    if (integracao) {
      setNome(integracao.nome);
      setUrlMcp(integracao.url_mcp ?? "");
      setTransporte((integracao.transporte as "http" | "sse") ?? "http");
    }
    if (fallback?.ambiente) setAmbiente(fallback.ambiente as "producao" | "sandbox");
    if (fallback?.url_base) setUrlBase(fallback.url_base);
  }, [integracao, fallback]);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["integracoes"] });

  const salvarMcp = useMutation({
    mutationFn: () =>
      salvarIntegracao({
        data: { provedor, nome, url_mcp: urlMcp, transporte, token: token || undefined },
      }),
    onSuccess: () => {
      toast.success("Servidor MCP salvo");
      setToken("");
      invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  const testar = useMutation({
    mutationFn: () => testarConexao({ data: { provedor } }),
    onSuccess: (r) => {
      setResultadoTeste({ status: r.status, tools: r.toolNames, erro: r.erro });
      if (r.status === "conectado")
        toast.success(`Conectado — ${r.toolNames?.length ?? 0} tools encontradas`);
      else toast.error(r.erro ?? "Falha na conexão");
      invalidar();
    },
  });

  const salvarFallbackMutation = useMutation({
    mutationFn: () =>
      provedor === "asaas"
        ? salvarFallback({ data: { provedor: "asaas", token: tokenFallback, ambiente } })
        : salvarFallback({ data: { provedor: "granatum", token: tokenFallback, urlBase } }),
    onSuccess: () => {
      toast.success("Credencial de fallback salva");
      setTokenFallback("");
      invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar fallback"),
  });

  return (
    <section className="corp-card space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="heading text-xl">{titulo}</h2>
        {integracao ? (
          <span
            className={`chip ${
              integracao.status === "conectado"
                ? "border-success/40 text-success"
                : integracao.status === "erro"
                  ? "border-destructive/40 text-destructive"
                  : ""
            }`}
          >
            {integracao.status === "conectado"
              ? "Conectado"
              : integracao.status === "erro"
                ? "Erro"
                : "Não testado"}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="lbl">Nome</Label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={`Servidor MCP ${titulo}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="lbl">Transporte</Label>
          <Select value={transporte} onValueChange={(v) => setTransporte(v as "http" | "sse")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="http">HTTP</SelectItem>
              <SelectItem value="sse">SSE</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="lbl">URL do servidor MCP</Label>
          <Input
            value={urlMcp}
            onChange={(e) => setUrlMcp(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="lbl">Token / chave (deixe em branco para manter o salvo)</Label>
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="corp"
          size="sm"
          disabled={salvarMcp.isPending}
          onClick={() => salvarMcp.mutate()}
        >
          <Save /> Salvar
        </Button>
        <Button
          variant="corpOutline"
          size="sm"
          disabled={testar.isPending}
          onClick={() => testar.mutate()}
        >
          <Plug /> {testar.isPending ? "Testando" : "Testar conexão"}
        </Button>
      </div>

      {resultadoTeste ? (
        <div className="border border-border bg-surface p-3 text-xs">
          {resultadoTeste.status === "conectado" ? (
            <>
              <p className="lbl mb-1">Tools encontradas</p>
              <p className="text-body">{resultadoTeste.tools?.join(", ") || "Nenhuma"}</p>
            </>
          ) : (
            <p className="text-destructive">{resultadoTeste.erro}</p>
          )}
        </div>
      ) : null}

      {mapeamentos.length > 0 ? (
        <div className="border-t border-border pt-4">
          <p className="lbl mb-2">Mapeamento de tools detectado</p>
          <div className="grid gap-1 text-xs text-muted-foreground">
            {mapeamentos.map((m) => (
              <div key={m.funcao} className="flex justify-between border-b border-border-soft py-1">
                <span>{m.funcao}</span>
                <span className="text-body">{m.tool_name ?? "— (usa fallback REST)"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-t border-border pt-4">
        <p className="lbl mb-2">Fallback REST direto</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="lbl">Token</Label>
            <Input
              type="password"
              value={tokenFallback}
              onChange={(e) => setTokenFallback(e.target.value)}
            />
          </div>
          {provedor === "asaas" ? (
            <div className="space-y-1">
              <Label className="lbl">Ambiente</Label>
              <Select
                value={ambiente}
                onValueChange={(v) => setAmbiente(v as "producao" | "sandbox")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="producao">Produção</SelectItem>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="lbl">URL base da API</Label>
              <Input
                value={urlBase}
                onChange={(e) => setUrlBase(e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}
        </div>
        <Button
          variant="ghostCorp"
          size="sm"
          className="mt-3"
          disabled={salvarFallbackMutation.isPending}
          onClick={() => salvarFallbackMutation.mutate()}
        >
          Salvar fallback
        </Button>
      </div>
    </section>
  );
}

function PainelConta() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["integracoes"], queryFn: () => listarIntegracoes() });
  const { data: contas } = useQuery({
    queryKey: ["contas-granatum"],
    queryFn: () => listarContasParaConfiguracao(),
  });
  const [contaId, setContaId] = useState("");

  useEffect(() => {
    if (data?.conta?.conta_id_granatum) setContaId(data.conta.conta_id_granatum);
  }, [data]);

  const salvar = useMutation({
    mutationFn: () => {
      const conta = contas?.find((c) => c.id === contaId);
      return salvarContaConfigurada({
        data: { conta_id_granatum: contaId, nome: conta?.nome ?? "" },
      });
    },
    onSuccess: () => {
      toast.success("Conta configurada");
      queryClient.invalidateQueries({ queryKey: ["integracoes"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  return (
    <section className="corp-card space-y-4 p-6">
      <h2 className="heading text-xl">Conta do Granatum</h2>
      <p className="text-sm text-muted-foreground">
        Conta que representa o Asaas dentro do Granatum. Todos os lançamentos buscados e criados
        usam esta conta.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 space-y-1">
          <Label className="lbl">Conta</Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a conta" />
            </SelectTrigger>
            <SelectContent>
              {(contas ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="corp"
          size="sm"
          disabled={!contaId || salvar.isPending}
          onClick={() => salvar.mutate()}
        >
          Salvar conta
        </Button>
      </div>
    </section>
  );
}

const MODELOS_SUGERIDOS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"];

function PainelIA() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["integracoes"], queryFn: () => listarIntegracoes() });

  const [token, setToken] = useState("");
  const [modelo, setModelo] = useState("");
  const [modeloCustom, setModeloCustom] = useState("");

  useEffect(() => {
    if (data?.ia?.modelo) {
      if (MODELOS_SUGERIDOS.includes(data.ia.modelo)) setModelo(data.ia.modelo);
      else {
        setModelo("outro");
        setModeloCustom(data.ia.modelo);
      }
    }
  }, [data]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarIntegracaoIA({
        data: {
          token: token || undefined,
          modelo: modelo === "outro" ? modeloCustom : modelo,
        },
      }),
    onSuccess: () => {
      toast.success("Integração de IA salva");
      setToken("");
      queryClient.invalidateQueries({ queryKey: ["integracoes"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  const modeloFinal = modelo === "outro" ? modeloCustom : modelo;

  return (
    <section className="corp-card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="heading text-xl">Inteligência artificial (OpenAI)</h2>
        {data?.ia ? <span className="chip border-success/40 text-success">Configurada</span> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Usada para sugerir e pré-preencher categoria e centro de custo ao criar um lançamento no
        Granatum a partir de um item do Asaas sem par — com base na descrição e no histórico de
        lançamentos parecidos. Sem esta chave, a sugestão só funciona quando já existe histórico
        muito parecido (sem IA de verdade).
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="lbl">Chave de API da OpenAI</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={data?.ia ? "Deixe em branco para manter a salva" : "sk-..."}
          />
        </div>
        <div className="space-y-1">
          <Label className="lbl">Modelo</Label>
          <Select value={modelo} onValueChange={setModelo}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o modelo" />
            </SelectTrigger>
            <SelectContent>
              {MODELOS_SUGERIDOS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
              <SelectItem value="outro">Outro (digitar)</SelectItem>
            </SelectContent>
          </Select>
          {modelo === "outro" ? (
            <Input
              className="mt-2"
              value={modeloCustom}
              onChange={(e) => setModeloCustom(e.target.value)}
              placeholder="ex.: gpt-5-mini"
            />
          ) : null}
        </div>
      </div>
      <Button
        variant="corp"
        size="sm"
        disabled={!modeloFinal || salvar.isPending}
        onClick={() => salvar.mutate()}
      >
        <Save /> Salvar
      </Button>
    </section>
  );
}

function IntegracoesPage() {
  const superAdmin = useSuperAdmin();
  const nav = montarNav("integracoes", superAdmin.data ?? false);
  return (
    <Shell itens={nav} contexto="Integrações">
      <TituloPagina
        titulo="Integrações"
        subtitulo="Cadastre os servidores MCP do Asaas e do Granatum e a conta que representa o Asaas."
      />
      <div className="space-y-6">
        <PainelProvedor provedor="asaas" titulo="Asaas" />
        <PainelProvedor provedor="granatum" titulo="Granatum" />
        <PainelConta />
        <PainelIA />
      </div>
    </Shell>
  );
}
