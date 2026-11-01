import { describe, expect, it } from "vitest";
import { buildTemplateComponents, pickTemplate, type MetaTemplate } from "@shared/whatsapp";

const values = { title: "Novo pedido", text: "Jantar para 10 pessoas", link: "https://site.com/painel?aba=radar" };
const base = (components: MetaTemplate["components"], format?: "NAMED" | "POSITIONAL"): MetaTemplate => ({ name: "aviso", language: "pt_BR", status: "APPROVED", parameter_format: format, components });

describe("mensagem no formato do modelo da Meta", () => {
  it("3 variáveis por número", () => {
    const r = buildTemplateComponents(base([{ type: "BODY", text: "Olá! {{1}} {{2}} Acesse: {{3}}" }]), values);
    expect(r.components[0].parameters.map((p: any) => p.text)).toEqual(["Novo pedido", "Jantar para 10 pessoas", values.link]);
    expect(r.components[0].parameters[0].parameter_name).toBeUndefined();
  });
  it("variáveis com nome", () => {
    const r = buildTemplateComponents(base([{ type: "BODY", text: "Oi {{titulo}}, {{mensagem}} {{link}}" }], "NAMED"), values);
    expect(r.components[0].parameters.map((p: any) => p.parameter_name)).toEqual(["titulo", "mensagem", "link"]);
  });
  it("uma variável só junta tudo, com o link", () => {
    const r = buildTemplateComponents(base([{ type: "BODY", text: "Aviso: {{1}}" }]), values);
    expect(r.components[0].parameters).toHaveLength(1);
    expect(r.components[0].parameters[0].text).toContain(values.link);
  });
  it("cabeçalho de texto e botão com link variável", () => {
    const r = buildTemplateComponents(base([{ type: "HEADER", format: "TEXT", text: "{{1}}" }, { type: "BODY", text: "{{1}} {{2}} {{3}}" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Abrir", url: "https://site.com/{{1}}" }] }]), values);
    expect(r.components.map((c: any) => c.type)).toEqual(["header", "body", "button"]);
    expect(r.components[2].parameters[0].text).toBe("painel?aba=radar");
  });
  it("cabeçalho com imagem não é suportado", () => {
    expect(buildTemplateComponents(base([{ type: "HEADER", format: "IMAGE" }]), values).error).toMatch(/imagem/);
  });
  it("escolhe o modelo aprovado no idioma certo", () => {
    const list = [{ ...base([]), language: "en_US" }, { ...base([]), language: "pt_BR", status: "PENDING" }, { ...base([]), language: "pt_BR" }];
    expect(pickTemplate(list, "aviso", "pt_BR")).toBe(list[2]);
  });
});
