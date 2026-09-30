import { describe, expect, it } from "vitest";
import { dividirEmParcelas } from "./parcelas";

describe("dividirEmParcelas", () => {
  it("divide exato quando dá", () => {
    expect(dividirEmParcelas(3000, 10)).toEqual({ parcela: 300, primeira: 300 });
  });

  it("joga a sobra de centavos na 1ª parcela", () => {
    expect(dividirEmParcelas(100, 3)).toEqual({ parcela: 33.33, primeira: 33.34 });
    expect(dividirEmParcelas(961.87, 7)).toEqual({ parcela: 137.41, primeira: 137.41 });
    expect(dividirEmParcelas(10, 7)).toEqual({ parcela: 1.42, primeira: 1.48 });
  });

  it("mantém o sinal de despesa", () => {
    expect(dividirEmParcelas(-100, 3)).toEqual({ parcela: -33.33, primeira: -33.34 });
  });

  it("a soma bate com o total", () => {
    for (const [total, n] of [
      [1234.56, 12],
      [0.05, 2],
      [99.99, 5],
    ] as const) {
      const { parcela, primeira } = dividirEmParcelas(total, n);
      expect(Math.round((primeira + parcela * (n - 1)) * 100)).toBe(Math.round(total * 100));
    }
  });
});
