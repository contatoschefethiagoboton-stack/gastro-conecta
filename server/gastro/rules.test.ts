import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { calculateIntentScore, isTopRated, SUBSCRIPTION_PRICE_CENTS } from "./rules";
import { nextPeriodEnd, renewalAttemptAt, subscriptionPhase, subscriptionVisible } from "@shared/subscription";
import { calculateMealPrep, conversionRate, estimateAreaService, estimateBrigade, estimateIngredients, itemsTotalCents, profitability, CLEANING_RATES, MEAL_PREP_DEFAULTS, styleForEventType } from "@shared/copilot";
import { serviceMatchesRequest } from "@shared/services";
import { buildPdf, pdfText, wrapText } from "./pdf";
import { verifyWebhookSignature } from "./mercadopago";
import { buildContractPayload, contractBlocks } from "./contracts";

describe("pedidos e reputação", () => {
  it("pontua intenção sem passar de 100", () => {
    expect(calculateIntentScore({ stage: "ready", date: "2026-12-01", city: "São Paulo", location: "Centro", guests: 40, budgetCents: 200000 })).toBe(100);
    expect(calculateIntentScore({ stage: "research", city: "São Paulo" })).toBeLessThanOrEqual(49);
    expect(calculateIntentScore({ stage: "comparing", guests: 10 })).toBeGreaterThanOrEqual(50);
  });
  it("Top Rated exige média 4,5 e 3 avaliações", () => {
    expect(isTopRated(4.8, 2)).toBe(false);
    expect(isTopRated(4.5, 3)).toBe(true);
    expect(isTopRated(4.4, 10)).toBe(false);
  });
  it("radar só mostra pedidos compatíveis com os serviços do profissional", () => {
    expect(serviceMatchesRequest(["limpeza-residencial"], "event")).toBe(false);
    expect(serviceMatchesRequest(["limpeza-residencial"], "cleaning")).toBe(true);
    expect(serviceMatchesRequest(["personal-chef"], "mealPrep")).toBe(true);
    expect(serviceMatchesRequest(["garcom"], "event")).toBe(true);
  });
});

describe("assinatura mensal", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const day = 24 * 3600 * 1000;
  it("tem preço fixo em centavos", () => expect(Number.isInteger(SUBSCRIPTION_PRICE_CENTS)).toBe(true));
  it("passa por ativa, renovação, Pix manual e bloqueio", () => {
    expect(subscriptionPhase({ periodEnd: null, autoFailed: false }, now)).toBe("inactive");
    expect(subscriptionPhase({ periodEnd: new Date(now.getTime() + 10 * day), autoFailed: false }, now)).toBe("active");
    expect(subscriptionPhase({ periodEnd: new Date(now.getTime() + 5 * day), autoFailed: false }, now)).toBe("renewal");
    expect(subscriptionPhase({ periodEnd: new Date(now.getTime() + 2 * day), autoFailed: true }, now)).toBe("manual");
    expect(subscriptionPhase({ periodEnd: new Date(now.getTime() - 1000), autoFailed: false }, now)).toBe("blocked");
    expect(subscriptionVisible("blocked")).toBe(false);
    expect(subscriptionVisible("manual")).toBe(true);
  });
  it("tenta cobrar 5 dias antes e soma um mês ao pagar", () => {
    expect(renewalAttemptAt(new Date("2026-11-30T00:00:00Z")).toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(nextPeriodEnd(new Date("2026-11-30T00:00:00Z"), now).toISOString()).toBe("2026-12-30T00:00:00.000Z");
    expect(nextPeriodEnd(new Date("2026-01-31T00:00:00Z"), new Date("2026-01-20T00:00:00Z")).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(nextPeriodEnd(new Date("2026-01-01T00:00:00Z"), now).toISOString()).toBe("2026-11-29T12:00:00.000Z");
  });
});

describe("Copilot do profissional", () => {
  it("estima ingredientes por convidado", () => {
    const items = estimateIngredients(100, "Churrasco");
    expect(items.find(i => i.key === "meat")?.quantity).toBe(40);
    expect(items.find(i => i.key === "rice")?.quantity).toBe(6);
    expect(estimateIngredients(100, "Churrasco", false).some(i => i.key === "beer")).toBe(false);
    expect(itemsTotalCents([{ key: "a", name: "a", quantity: 2.5, unit: "kg", unitCostCents: 1000 }])).toBe(2500);
    expect(styleForEventType("Churrasco de domingo")).toBe("Churrasco");
  });
  it("sugere brigada pelo tamanho do evento", () => {
    const team = estimateBrigade(100, "Jantar servido");
    expect(team.find(t => t.role === "Chef executivo")?.count).toBe(1);
    expect(team.find(t => t.role === "Garçom / garçonete")?.count).toBe(9);
    expect(team.find(t => t.role === "Auxiliar de cozinha")?.count).toBe(4);
  });
  it("calcula limpeza por área", () => {
    const small = estimateAreaService(60, CLEANING_RATES.Residencial);
    expect(small.billing).toBe("hora");
    expect(small.totalCents).toBe(small.hourlyCents * small.hours);
    expect(estimateAreaService(600, CLEANING_RATES["Limpeza pesada"]).people).toBeGreaterThan(1);
  });
  it("precifica marmitas com ingredientes, embalagem, deslocamento e mão de obra", () => {
    const r = calculateMealPrep({ ...MEAL_PREP_DEFAULTS, meals: 10, marginPercent: 0 });
    expect(r.costCents).toBe(12000 + 2500 + 2400 + 20000);
    expect(r.perMealCents).toBe(3690);
    expect(r.kits).toBe(2);
  });
  it("avisa prejuízo e calcula conversão", () => {
    expect(profitability(1000, 1500).loss).toBe(true);
    expect(profitability(1000, 900).lowMargin).toBe(true);
    expect(conversionRate(8, 2)).toBe(25);
    expect(conversionRate(0, 0)).toBe(0);
  });
});

describe("PDF e contrato", () => {
  it("codifica acentos em WinAnsi e quebra linhas", () => {
    expect(pdfText("Serviço (ção)")).toBe("Servi\\347o \\(\\347\\343o\\)");
    expect(wrapText("a ".repeat(200), 10, 100).length).toBeGreaterThan(5);
    const pdf = buildPdf([{ kind: "title", text: "Contrato" }, ...Array.from({ length: 120 }, (_, i) => ({ kind: "text" as const, text: `Linha ${i}` }))]);
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.toString("latin1")).toMatch(/\/Count [2-9]/);
  });
  it("monta contrato com as duas partes, escopo e valor", () => {
    const payload = buildContractPayload({
      contractNumber: "GC-000001", acceptedAt: new Date("2026-10-29T15:00:00Z"), acceptedIp: "1.2.3.4",
      client: { userId: 1, name: "Ana", email: "ana@x.com", details: { fullName: "Ana Souza", cpf: "52998224725", phone: "19999998888", street: "Rua A", number: "10", district: "Centro", city: "Campinas", state: "SP", cep: "13010000" } },
      provider: { userId: 2, name: "Chef", email: "chef@x.com", details: { documentType: "cnpj", cnpj: "11222333000181", companyType: "MEI", companyName: "Chef ME", fullName: "João", bank: { pixKeyType: "email", pixKey: "chef@x.com", bankName: "Nubank", agency: "0001", account: "123-4", accountType: "corrente", holderName: "João", holderDocument: "52998224725" } } },
      event: { id: 9, title: "Jantar", type: "Jantar em casa", eventDate: "2026-12-24", city: "Campinas", guests: 12 },
      proposal: { amountCents: 350000, scope: "full", paymentTerms: "50% no aceite e 50% no dia", message: "Menu" },
    });
    expect(payload.client.document).toBe("529.982.247-25");
    expect(payload.provider.documentLabel).toBe("CNPJ");
    const text = JSON.stringify(contractBlocks(payload));
    expect(text).toContain("Serviço completo");
    expect(text).toContain("R$");
    expect(text).toContain("chef@x.com");
  });
});

describe("webhook Mercado Pago", () => {
  it("confere a assinatura x-signature", () => {
    const secret = "segredo";
    const ts = "1704908010";
    const v1 = createHmac("sha256", secret).update(`id:123;request-id:abc;ts:${ts};`).digest("hex");
    expect(verifyWebhookSignature({ signature: `ts=${ts},v1=${v1}`, requestId: "abc", dataId: "123", secret })).toBe(true);
    expect(verifyWebhookSignature({ signature: `ts=${ts},v1=${v1}`, requestId: "abc", dataId: "124", secret })).toBe(false);
    expect(verifyWebhookSignature({ signature: undefined, dataId: "123", secret })).toBe(false);
  });
});
