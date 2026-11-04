import { describe, expect, it } from "vitest";
import { copilotNudge, goalPrompt, ruleReply, type CopilotState } from "@shared/copilotGoals";
import { seoCatalogFrom, parseSeoCities } from "@shared/seo";

const seo = seoCatalogFrom();
const cities = parseSeoCities("Campinas/SP\nSão Paulo/SP");
const provider = (p: Partial<NonNullable<CopilotState["provider"]>>): CopilotState => ({ audience: "provider", name: "Ana Souza", provider: { profileComplete: true, phase: "active", radarOpen: 0, pendingProposals: 0, ...p } });
const client = (c: Partial<NonNullable<CopilotState["client"]>>): CopilotState => ({ audience: "client", name: "João", client: { openEvents: 0, pendingProposals: 0, contractDataComplete: true, ...c } });

describe("copilotNudge", () => {
  it("visitante: descobre se contrata ou trabalha", () => {
    const n = copilotNudge({ audience: "visitor" });
    expect(n.id).toBe("visitor");
    expect(n.suggestions.join(" ")).toMatch(/contratar/);
  });
  it("profissional: perfil incompleto vem antes de tudo", () => {
    expect(copilotNudge(provider({ profileComplete: false, phase: "inactive", radarOpen: 4 })).action.href).toBe("/painel?aba=profile");
  });
  it("profissional sem assinatura: ativa e mostra pedidos esperando", () => {
    const n = copilotNudge(provider({ phase: "inactive", radarOpen: 3 }));
    expect(n.action.href).toBe("/painel?aba=subscription");
    expect(n.message).toMatch(/3 pedidos compatíveis/);
  });
  it("profissional ativo: radar sem proposta", () => {
    const n = copilotNudge(provider({ radarOpen: 1 }));
    expect(n.message).toMatch(/Ana/);
    expect(n.message).toMatch(/1 pedido no radar/);
    expect(n.action.href).toBe("/painel?aba=radar");
  });
  it("profissional ativo sem radar: propostas aguardando", () => {
    expect(copilotNudge(provider({ pendingProposals: 2 })).action.href).toBe("/painel?aba=proposals");
  });
  it("cliente com propostas: escolher e aceitar", () => {
    const n = copilotNudge(client({ openEvents: 1, pendingProposals: 2 }));
    expect(n.id).toBe("client-proposals-2");
    expect(n.action.href).toBe("/painel?aba=requests");
  });
  it("cliente sem pedido: publicar pedido", () => {
    expect(copilotNudge(client({})).action.href).toBe("/orcamento");
  });
});

describe("goalPrompt", () => {
  it("leva o objetivo e a situação real para a IA", () => {
    const prompt = goalPrompt(provider({ phase: "inactive", radarOpen: 5 }));
    expect(prompt).toMatch(/FECHAR NEGÓCIOS/);
    expect(prompt).toMatch(/pedidos no radar sem proposta: 5/);
    expect(prompt).toMatch(/ativar a assinatura/);
  });
});

describe("ruleReply (sem IA)", () => {
  const now = new Date("2026-11-04T12:00:00Z"); // quarta
  it("visitante que quer contratar recebe link de orçamento preenchido", () => {
    const reply = ruleReply("preciso de garçom para sábado em Campinas", { audience: "visitor" }, seo, cities, now);
    expect(reply).toContain("/orcamento?servico=garcom-para-evento");
    expect(reply).toContain("cidade=Campinas");
    expect(reply).toContain("data=2026-11-07");
  });
  it("visitante profissional vai para o cadastro", () => {
    expect(ruleReply("Sou profissional e quero trabalhar", { audience: "visitor" }, seo, cities, now)).toContain("/conta?cadastro=profissional");
  });
  it("cliente com propostas é levado a escolher", () => {
    expect(ruleReply("quero contratar um chef", client({ pendingProposals: 1 }), seo, cities, now)).toContain("/painel?aba=requests");
  });
  it("como funciona explica e termina com próximo passo", () => {
    const reply = ruleReply("Como funciona?", { audience: "visitor" }, seo, cities, now);
    expect(reply).toMatch(/100% do valor/);
    expect(reply).toContain("](/orcamento)");
  });
  it("profissional perguntando da assinatura vai para a aba", () => {
    expect(ruleReply("quanto custa a assinatura?", provider({ phase: "inactive" }), seo, cities, now)).toContain("/painel?aba=subscription");
  });
});

describe("ruleReply: sugestões do balão", () => {
  it("cálculo de preço vai para as calculadoras, não para a assinatura", () => {
    expect(ruleReply("Me ajuda a calcular o preço de um evento", provider({}), seo, cities)).toContain("/painel?aba=calculators");
  });
  it("cliente pergunta como escolher proposta", () => {
    expect(ruleReply("Como escolher a melhor proposta?", client({ pendingProposals: 2 }), seo, cities)).toMatch(/contrato em PDF/);
  });
  it("profissional pergunta sobre proposta e perfil", () => {
    expect(ruleReply("Como escrever uma proposta que fecha?", provider({}), seo, cities)).toContain("/painel?aba=radar");
    expect(ruleReply("Que fotos devo colocar?", provider({ profileComplete: false }), seo, cities)).toContain("Completar meu perfil");
  });
  it("toda sugestão gera resposta com link (sem IA)", () => {
    const states: CopilotState[] = [{ audience: "visitor" }, client({}), client({ pendingProposals: 1 }), client({ openEvents: 1 }), provider({ profileComplete: false }), provider({ phase: "inactive" }), provider({ radarOpen: 2 }), provider({})];
    for (const s of states) for (const q of copilotNudge(s).suggestions) expect(ruleReply(q, s, seo, cities)).toMatch(/\]\(\/[a-z]/);
  });
});
