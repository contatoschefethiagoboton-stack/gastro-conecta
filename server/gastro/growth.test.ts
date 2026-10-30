import { describe, expect, it } from "vitest";
import { levelFromRatings, levelRulesFrom, nextLevelHint } from "@shared/levels";
import { normalizeDescriptor, parsePaymentReference, paymentDescription, paymentReference, subscriberCode } from "@shared/payments";
import { promotionWindowEnd, type Promotion } from "@shared/promotions";

describe("níveis do profissional", () => {
  it("BAIXO, MÉDIO e ALTO pelas regras padrão", () => {
    expect(levelFromRatings(0, 0)).toBe("baixo");
    expect(levelFromRatings(4.2, 3)).toBe("medio");
    expect(levelFromRatings(4.8, 4)).toBe("medio");
    expect(levelFromRatings(4.6, 5)).toBe("alto");
    expect(levelFromRatings(3.9, 20)).toBe("baixo");
  });
  it("regras editáveis no painel", () => {
    const rules = levelRulesFrom({ "level.altoMinAverage": "4,0", "level.altoMinReviews": "2" });
    expect(levelFromRatings(4.1, 2, rules)).toBe("alto");
    expect(levelRulesFrom({ "level.altoMinAverage": "abc" }).altoMinAverage).toBe(4.5);
  });
  it("diz o que falta para subir", () => {
    expect(nextLevelHint("baixo", 4.5, 1)).toMatch(/MÉDIO/);
    expect(nextLevelHint("alto", 5, 10)).toBe("");
  });
});

describe("identificação no Mercado Pago", () => {
  it("referência e descrição identificam a plataforma e o assinante", () => {
    expect(paymentReference("ASSINATURA", 12, 45)).toBe("GASTROCONECTA-ASSINATURA-U12-P45");
    expect(subscriberCode(12)).toBe("GC-00012");
    expect(paymentDescription("PROMOCAO", 12, "Ana Chef", "“Natal”")).toBe("GastroConecta · Adicional de promoção “Natal” · GC-00012 · Ana Chef");
  });
  it("lê referências novas e antigas e ignora as de outras plataformas", () => {
    expect(parsePaymentReference("GASTROCONECTA-ASSINATURA-AUTO-U7")).toEqual({ kind: "ASSINATURA-AUTO", userId: 7 });
    expect(parsePaymentReference("GASTROCONECTA-PROMOCAO-U7-P9")).toEqual({ kind: "PROMOCAO", userId: 7, rowId: 9 });
    expect(parsePaymentReference("gcsub:3:10")).toEqual({ kind: "ASSINATURA", userId: 3, rowId: 10 });
    expect(parsePaymentReference("gcsub-auto:3")).toEqual({ kind: "ASSINATURA-AUTO", userId: 3 });
    expect(parsePaymentReference("OUTRA-LOJA-123")).toBeNull();
  });
  it("nome na fatura sem acentos e com até 22 caracteres", () => {
    expect(normalizeDescriptor("Gastro Conecta — Campinas/SP extra")).toBe("GASTRO CONECTA CAMPINA");
  });
});

describe("prazo da participação na promoção", () => {
  const promo = (start: string, end: string): Promotion => ({ id: 1, active: true, start, end, badge: "", title: "", text: "", cta: "", whatsappMessage: "" });
  it("vale até o fim da temporada, inclusive virando o ano", () => {
    expect(promotionWindowEnd(promo("11-01", "01-06"), new Date(2026, 10, 30))?.toDateString()).toBe(new Date(2027, 0, 6).toDateString());
    expect(promotionWindowEnd(promo("11-01", "01-06"), new Date(2027, 0, 2))?.toDateString()).toBe(new Date(2027, 0, 6).toDateString());
    expect(promotionWindowEnd(promo("05-01", "05-31"), new Date(2026, 4, 10))?.toDateString()).toBe(new Date(2026, 4, 31).toDateString());
    expect(promotionWindowEnd(promo("05-01", "05-31"), new Date(2026, 6, 10))).toBeNull();
  });
});
