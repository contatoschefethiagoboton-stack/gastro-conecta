import { describe, expect, it } from "vitest";
import { wrapLines } from "../client/src/lib/promoArt";

// Mede 10 px por caractere, como uma fonte monoespaçada.
const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) } as Pick<CanvasRenderingContext2D, "measureText">;

describe("artes de divulgação: quebra de linhas", () => {
  it("quebra por palavras dentro da largura", () => {
    expect(wrapLines(ctx, "Garçom e barman para eventos", 120, 3)).toEqual(["Garçom e", "barman para", "eventos"]);
  });
  it("corta com reticências quando passa do limite de linhas", () => {
    const lines = wrapLines(ctx, "um dois três quatro cinco seis sete oito", 100, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });
  it("texto vazio não quebra", () => {
    expect(wrapLines(ctx, "", 100, 2)).toEqual([]);
  });
});
