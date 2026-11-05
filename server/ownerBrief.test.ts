import { describe, expect, it } from "vitest";
import { answerOwner, buildBrief, dailySummary, type OwnerMetrics } from "@shared/ownerBrief";
import { permissionForRequest } from "@shared/staff";

const base: OwnerMetrics = { newClients24h: 0, newProviders24h: 0, activeProviders: 12, totalClients: 40, openEvents: 5, bookedThisMonth: 3, revenueMonthCents: 99900, revenueLastMonthCents: 49950, pendingApproval: [], incompleteProfiles: [], trialsEnding: [], overdue: [], eventsNoProposal: [], proposalsWaiting: [], socialErrors24h: 0, googleErrorsToday: 0 };

describe("Copilot do dono", () => {
  it("sem pendências: tudo em dia", () => {
    expect(buildBrief(base)).toEqual([]);
    expect(dailySummary(base)).toMatch(/tudo em dia/);
    expect(dailySummary(base)).toMatch(/12 profissionais ativos/);
  });
  it("ordena do urgente para o informativo e traz a ação pronta", () => {
    const items = buildBrief({ ...base, newClients24h: 2, eventsNoProposal: [{ id: 7, title: "Casamento", city: "Campinas", hours: 30 }], pendingApproval: [{ id: 3, name: "Ana" }], incompleteProfiles: [{ id: 4, name: "Rui" }] });
    expect(items.map(i => i.level)).toEqual(["urgent", "urgent", "attention", "info"]);
    expect(items[0].action).toEqual({ id: "renotify-events", label: "Avisar os profissionais de novo", ids: [7] });
    expect(items[1].section?.id).toBe("providers");
    expect(items[2].action?.id).toBe("nudge-profiles");
  });
  it("resumo diário lista só o que precisa de ação", () => {
    const s = dailySummary({ ...base, newProviders24h: 4, trialsEnding: [{ id: 1, name: "Bia", until: "2026-11-08T00:00:00Z" }] });
    expect(s).toMatch(/• 1 teste grátis acaba/);
    expect(s).not.toMatch(/Novos cadastros/);
  });
  it("responde perguntas pelos números (sem IA)", () => {
    expect(answerOwner("Quanto entrou de assinatura este mês?", base)).toMatch(/R\$\s?999,00/);
    expect(answerOwner("quantos profissionais ativos?", base)).toMatch(/12 profissionais ativos/);
    expect(answerOwner("tem pedido sem proposta?", { ...base, eventsNoProposal: [{ id: 1, title: "x", city: "y", hours: 25 }] })).toMatch(/1 sem proposta/);
    expect(answerOwner("oi", base)).toMatch(/Hoje:/);
  });
  it("permissões: ver exige visão geral; lembretes exigem editar contas", () => {
    expect(permissionForRequest("GET", "/admin/brief")).toBe("overview.view");
    expect(permissionForRequest("POST", "/admin/brief/chat")).toBe("overview.view");
    expect(permissionForRequest("POST", "/admin/brief/action")).toBe("users.edit");
    expect(permissionForRequest("POST", "/admin/brief/settings")).toBe("notifications.manage");
  });
});

describe("Copilot do dono: concordância", () => {
  it("singular e plural no cadastro incompleto", () => {
    expect(buildBrief({ ...base, incompleteProfiles: [{ id: 1, name: "Rui" }] })[0].detail).toMatch(/^Rui começou e parou/);
    expect(buildBrief({ ...base, incompleteProfiles: [{ id: 1, name: "Rui" }, { id: 2, name: "Ana" }] })[0].detail).toMatch(/começaram e pararam/);
  });
});
