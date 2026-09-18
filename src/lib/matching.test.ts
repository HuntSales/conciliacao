import { describe, expect, it } from "vitest";
import { conciliar, similaridadeDescricao } from "./matching";
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
