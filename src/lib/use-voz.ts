import { useCallback, useEffect, useRef, useState } from "react";

// Tipagem mínima da Web Speech API (não vem no lib.dom do TypeScript).
type ResultadoFala = { isFinal: boolean; 0: { transcript: string } };
type EventoFala = { resultIndex: number; results: ArrayLike<ResultadoFala> };
type Reconhecedor = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: EventoFala) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type ConstrutorReconhecedor = new () => Reconhecedor;

function construtor(): ConstrutorReconhecedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstrutorReconhecedor;
    webkitSpeechRecognition?: ConstrutorReconhecedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MENSAGENS_ERRO: Record<string, string> = {
  "not-allowed": "Permita o uso do microfone no navegador para lançar por voz.",
  "service-not-allowed": "Permita o uso do microfone no navegador para lançar por voz.",
  "no-speech": "Não ouvi nada — toque no microfone e fale de novo.",
  "audio-capture": "Nenhum microfone encontrado.",
  network: "Sem conexão para reconhecer a voz — tente de novo ou digite.",
};

/**
 * Reconhecimento de voz do próprio navegador (pt-BR), sem custo de API.
 * `parcial` é o texto enquanto a pessoa fala; `onFinal` recebe a frase
 * quando o navegador fecha o reconhecimento.
 */
export function useVoz(onFinal: (texto: string) => void) {
  const [suportado, setSuportado] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const reconhecedor = useRef<Reconhecedor | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  // Só no cliente — evita divergência de hidratação.
  useEffect(() => setSuportado(construtor() !== null), []);
  useEffect(() => () => reconhecedor.current?.abort(), []);

  const parar = useCallback(() => reconhecedor.current?.stop(), []);

  const ouvir = useCallback(() => {
    const Ctor = construtor();
    if (!Ctor) return;
    reconhecedor.current?.abort();
    const r = new Ctor();
    r.lang = "pt-BR";
    r.interimResults = true;
    r.continuous = false;
    let final = "";
    r.onresult = (e) => {
      let provisorio = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const resultado = e.results[i]!;
        if (resultado.isFinal) final += resultado[0].transcript;
        else provisorio += resultado[0].transcript;
      }
      setParcial(`${final}${provisorio}`);
    };
    r.onerror = (e) => {
      if (e.error !== "aborted")
        setErro(MENSAGENS_ERRO[e.error] ?? "Falha no reconhecimento de voz.");
    };
    r.onend = () => {
      setOuvindo(false);
      setParcial("");
      reconhecedor.current = null;
      if (final.trim()) onFinalRef.current(final.trim());
    };
    reconhecedor.current = r;
    setErro(null);
    setParcial("");
    setOuvindo(true);
    try {
      r.start();
    } catch {
      setOuvindo(false);
      setErro("Não foi possível iniciar o microfone.");
    }
  }, []);

  return { suportado, ouvindo, parcial, erro, ouvir, parar };
}
