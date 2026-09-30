import { describe, expect, it } from "vitest";
import { interpretarFrase } from "./extrair-valor";

describe("interpretarFrase", () => {
  it("separa descrição e valor com 'reais' no fim", () => {
    expect(interpretarFrase("gasolina no posto Shell 150 reais")).toEqual({
      descricao: "Gasolina no posto Shell",
      valor: 150,
      tipo: null,
      repeticao: null,
    });
  });

  it("entende R$, milhar com ponto e decimal com vírgula", () => {
    expect(interpretarFrase("notebook R$ 1.234,56").valor).toBe(1234.56);
    expect(interpretarFrase("almoço 45,90").valor).toBe(45.9);
  });

  it("entende decimal com ponto de 1–2 casas", () => {
    expect(interpretarFrase("café 12.50").valor).toBe(12.5);
  });

  it("entende 'mil' e 'centavos'", () => {
    expect(interpretarFrase("aluguel 2 mil reais").valor).toBe(2000);
    expect(interpretarFrase("uber 32 reais e 40 centavos").valor).toBe(32.4);
  });

  it("prefere o número marcado como dinheiro ao último número", () => {
    const r = interpretarFrase("R$ 80 no posto 24 horas");
    expect(r.valor).toBe(80);
    expect(r.descricao).toBe("Posto 24 horas");
  });

  it("sem marcação, usa o último número", () => {
    expect(interpretarFrase("posto 24 horas gasolina 150")).toMatchObject({
      descricao: "Posto 24 horas gasolina",
      valor: 150,
    });
  });

  it("tira verbo e conectores e deduz o tipo", () => {
    expect(interpretarFrase("paguei 80 de almoço")).toEqual({
      descricao: "Almoço",
      valor: 80,
      tipo: "despesa",
      repeticao: null,
    });
    expect(interpretarFrase("recebi 500 reais do cliente Fulano")).toEqual({
      descricao: "Do cliente Fulano",
      valor: 500,
      tipo: "receita",
      repeticao: null,
    });
    expect(interpretarFrase("comprei material de escritório no valor de 99,90")).toEqual({
      descricao: "Material de escritório",
      valor: 99.9,
      tipo: "despesa",
      repeticao: null,
    });
  });

  it("sem número, devolve só a descrição", () => {
    expect(interpretarFrase("estacionamento")).toEqual({
      descricao: "Estacionamento",
      valor: null,
      tipo: null,
      repeticao: null,
    });
  });

  it("entende parcelamento sem confundir o número de parcelas com o valor", () => {
    expect(interpretarFrase("notebook 3000 em 10x")).toMatchObject({
      descricao: "Notebook",
      valor: 3000,
      repeticao: { modo: "parcelado", parcelas: 10 },
    });
    expect(interpretarFrase("comprei sofá parcelado em 5 vezes 2.500 reais")).toMatchObject({
      descricao: "Sofá",
      valor: 2500,
      repeticao: { modo: "parcelado", parcelas: 5 },
    });
    expect(interpretarFrase("geladeira 3 parcelas 1500").repeticao).toEqual({
      modo: "parcelado",
      parcelas: 3,
    });
  });

  it("1x não é parcelamento", () => {
    expect(interpretarFrase("mouse 1x 80").repeticao).toBeNull();
  });

  it("entende recorrência e a periodicidade", () => {
    expect(interpretarFrase("assinatura ChatGPT 99,90 todo mês")).toMatchObject({
      descricao: "Assinatura ChatGPT",
      valor: 99.9,
      repeticao: { modo: "recorrente", periodicidade: "M1" },
    });
    expect(interpretarFrase("faxina 150 por semana").repeticao).toEqual({
      modo: "recorrente",
      periodicidade: "D7",
    });
    expect(interpretarFrase("domínio anual 60 reais").repeticao).toEqual({
      modo: "recorrente",
      periodicidade: "M12",
    });
  });
});
