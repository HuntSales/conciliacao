import { describe, expect, it } from "vitest";
import {
  chavePar,
  conciliar,
  detectarJaNoGranatum,
  detectarPagoComAtraso,
  similaridadeDescricao,
} from "./matching";
import type { CandidatoAsaas, CandidatoGranatum } from "./matching";

function a(over: Partial<CandidatoAsaas> & { id: string }): CandidatoAsaas {
  return { data: "2026-09-01", valor: 100, descricao: "Cobrança recebida", ...over };
}

function g(over: Partial<CandidatoGranatum> & { id: string }): CandidatoGranatum {
  return { data: "2026-09-01", valor: 100, descricao: "Cliente X", ...over };
}

describe("conciliar", () => {
  it("liga valor e data exatamente iguais", () => {
    const r = conciliar([a({ id: "a1" })], [g({ id: "g1" })]);
    expect(r.pares).toEqual([{ asaasId: "a1", granatumId: "g1", tipo: "automatico" }]);
    expect(r.asaasSemPar).toEqual([]);
    expect(r.granatumSemPar).toEqual([]);
  });

  it("não liga quando o valor bate mas a data está fora da tolerância", () => {
    const r = conciliar(
      [a({ id: "a1", data: "2026-09-01" })],
      [g({ id: "g1", data: "2026-09-05" })],
      0,
    );
    expect(r.pares).toEqual([]);
    expect(r.asaasSemPar).toEqual(["a1"]);
    expect(r.granatumSemPar).toEqual(["g1"]);
  });

  it("liga dentro da tolerância de dias configurada", () => {
    const r = conciliar(
      [a({ id: "a1", data: "2026-09-01" })],
      [g({ id: "g1", data: "2026-09-03" })],
      3,
    );
    expect(r.pares).toEqual([{ asaasId: "a1", granatumId: "g1", tipo: "automatico" }]);
  });

  it("prioriza a data exata quando há candidato exato e outro só dentro da tolerância", () => {
    const r = conciliar(
      [a({ id: "exato", data: "2026-09-02" }), a({ id: "tolerancia", data: "2026-09-01" })],
      [g({ id: "g1", data: "2026-09-02" })],
      2,
    );
    expect(r.pares).toEqual([{ asaasId: "exato", granatumId: "g1", tipo: "automatico" }]);
    expect(r.asaasSemPar).toEqual(["tolerancia"]);
  });

  it("não reaproveita um lançamento já usado em outro par (1:1)", () => {
    const r = conciliar([a({ id: "a1" })], [g({ id: "g1" }), g({ id: "g2" })]);
    expect(r.pares).toHaveLength(1);
    const usados = new Set(r.pares.map((p) => p.asaasId));
    expect(usados.size).toBe(r.pares.length);
  });

  it("desempata candidatos ambíguos pela similaridade de descrição", () => {
    const r = conciliar(
      [
        a({ id: "parecido", descricao: "Cobrança recebida - fatura CENTRO DESENVOLVIMENTO LTDA" }),
        a({ id: "diferente", descricao: "Cobrança recebida - fatura OUTRA EMPRESA LTDA" }),
      ],
      [g({ id: "g1", descricao: "CENTRO DESENVOLVIMENTO LTDA - Hunt Pilot" })],
    );
    expect(r.pares).toEqual([{ asaasId: "parecido", granatumId: "g1", tipo: "automatico" }]);
  });

  it("marca como sugestão quando a ambiguidade não tem desempate claro", () => {
    const r = conciliar(
      [
        a({ id: "a1", descricao: "Cobrança recebida" }),
        a({ id: "a2", descricao: "Cobrança recebida" }),
      ],
      [g({ id: "g1", descricao: "Cliente qualquer" })],
    );
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0]?.tipo).toBe("sugestao");
    expect(r.asaasSemPar).toHaveLength(1);
  });

  it("não liga quando os sinais são opostos (receita x despesa)", () => {
    const r = conciliar([a({ id: "a1", valor: 100 })], [g({ id: "g1", valor: -100 })]);
    expect(r.pares).toEqual([]);
    expect(r.asaasSemPar).toEqual(["a1"]);
    expect(r.granatumSemPar).toEqual(["g1"]);
  });

  it("evita erro de ponto flutuante na comparação de centavos", () => {
    const r = conciliar([a({ id: "a1", valor: 10.1 + 0.2 })], [g({ id: "g1", valor: 10.3 })]);
    expect(r.pares).toEqual([{ asaasId: "a1", granatumId: "g1", tipo: "automatico" }]);
  });
});

describe("similaridadeDescricao", () => {
  it("retorna 1 para descrições idênticas", () => {
    expect(similaridadeDescricao("Cliente Um Ltda", "Cliente Um Ltda")).toBe(1);
  });

  it("retorna 0 quando não há palavras em comum", () => {
    expect(similaridadeDescricao("Cliente Um", "Fornecedor Dois")).toBe(0);
  });

  it("ignora acentuação e caixa", () => {
    expect(similaridadeDescricao("Serviço Prestação", "SERVICO PRESTACAO")).toBe(1);
  });
});

describe("detectarJaNoGranatum", () => {
  const gi = (
    over: Partial<CandidatoGranatum> & { id: string; identificadorExterno?: string | null },
  ) => ({
    identificadorExterno: null,
    ...g(over),
    ...over,
  });

  it("acha pelo identificador externo mesmo com valor diferente", () => {
    const r = detectarJaNoGranatum(
      [a({ id: "a1", valor: 100 })],
      [gi({ id: "g1", valor: 90, identificadorExterno: "a1" })],
    );
    expect(r.get("a1")).toEqual({ granatumId: "g1", motivo: "identificador" });
  });

  it("acha por valor em data diferente, preferindo a data mais próxima", () => {
    const r = detectarJaNoGranatum(
      [a({ id: "a1", data: "2026-09-10" })],
      [gi({ id: "g1", data: "2026-09-01" }), gi({ id: "g2", data: "2026-09-12" })],
    );
    expect(r.get("a1")).toEqual({ granatumId: "g2", motivo: "valor" });
  });

  it("é 1:1 — dois do Asaas com o mesmo valor e só um no Granatum", () => {
    const r = detectarJaNoGranatum(
      [a({ id: "a1", data: "2026-09-01" }), a({ id: "a2", data: "2026-09-02" })],
      [gi({ id: "g1", data: "2026-09-02" })],
    );
    expect(r.size).toBe(1);
    expect(r.get("a1")).toEqual({ granatumId: "g1", motivo: "valor" });
    expect(r.has("a2")).toBe(false);
  });

  it("não marca quando nenhum valor bate", () => {
    const r = detectarJaNoGranatum([a({ id: "a1", valor: 100 })], [gi({ id: "g1", valor: -100 })]);
    expect(r.size).toBe(0);
  });
});

describe("pares proibidos (ligação interrompida)", () => {
  it("conciliar não propõe o par proibido, mas liga cada lado a outro", () => {
    const r = conciliar(
      [a({ id: "a1" }), a({ id: "a2" })],
      [g({ id: "g1" })],
      0,
      new Set([chavePar("a1", "g1")]),
    );
    expect(r.pares).toEqual([{ asaasId: "a2", granatumId: "g1", tipo: "automatico" }]);
    expect(r.asaasSemPar).toEqual(["a1"]);
  });

  it("detectarJaNoGranatum ignora o par proibido por valor e por identificador", () => {
    const proibidos = new Set([chavePar("a1", "g1"), chavePar("a2", "g2")]);
    const r = detectarJaNoGranatum(
      [a({ id: "a1" }), a({ id: "a2", valor: 50 })],
      [
        { ...g({ id: "g1" }), identificadorExterno: null },
        { ...g({ id: "g2", valor: 999 }), identificadorExterno: "a2" },
      ],
      proibidos,
    );
    expect(r.size).toBe(0);
  });
});

describe("detectarPagoComAtraso", () => {
  const atm = {
    id: "a1",
    data: "2026-10-20",
    valor: 3920.78,
    descricao: "Cobrança recebida - fatura nr. 906480236 ATM TECH LTDA",
    referencia: "7444",
  };
  const fatura = {
    id: "g1",
    data: "2026-10-19",
    valor: 3688.3,
    descricao: "ATM TECH LTDA - Hunt Pilot 7444 ",
  };

  it("acha a fatura da ATM paga com 1 dia de atraso e juros (caso real)", () => {
    const r = detectarPagoComAtraso([atm], [fatura]);
    expect(r.get("a1")).toEqual({ granatumId: "g1", diasAtraso: 1, acrescimo: 232.48 });
  });

  it("aceita só pelo nome quando não tem referência", () => {
    const r = detectarPagoComAtraso([{ ...atm, referencia: null }], [fatura]);
    expect(r.get("a1")?.granatumId).toBe("g1");
  });

  it("não liga cliente diferente com valor e data compatíveis", () => {
    const r = detectarPagoComAtraso(
      [{ ...atm, referencia: null, descricao: "Cobrança recebida - fatura nr. 1 CLINICA VIDA" }],
      [{ ...fatura, descricao: "CLINICA SAUDE - Hunt Pilot 9999" }],
    );
    expect(r.size).toBe(0);
  });

  it("não aceita desconto, nem acréscimo acima de 10%, nem mais de 10 dias", () => {
    expect(detectarPagoComAtraso([{ ...atm, valor: 3600 }], [fatura]).size).toBe(0);
    expect(detectarPagoComAtraso([{ ...atm, valor: 4100 }], [fatura]).size).toBe(0);
    expect(detectarPagoComAtraso([{ ...atm, data: "2026-10-30" }], [fatura]).size).toBe(0);
    expect(detectarPagoComAtraso([{ ...atm, data: "2026-10-18" }], [fatura]).size).toBe(0);
  });

  it("não liga receita a despesa", () => {
    const r = detectarPagoComAtraso([{ ...atm, valor: -3920.78 }], [fatura]);
    expect(r.size).toBe(0);
  });

  it("respeita par proibido e é 1:1, preferindo a referência", () => {
    expect(detectarPagoComAtraso([atm], [fatura], new Set([chavePar("a1", "g1")])).size).toBe(0);
    const r = detectarPagoComAtraso(
      [atm],
      [
        { ...fatura, id: "g0", data: "2026-10-20", descricao: "ATM TECH LTDA - Hunt Pilot" },
        fatura,
      ],
    );
    expect(r.get("a1")?.granatumId).toBe("g1");
  });
});
