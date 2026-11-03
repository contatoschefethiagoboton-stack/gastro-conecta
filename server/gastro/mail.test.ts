import { describe, expect, it } from "vitest";
import { explainMailError } from "./password";

describe("motivo da recusa do e-mail (Resend)", () => {
  it("chave inválida", () => {
    expect(explainMailError(401, "API key is invalid", "avisos@x.com")).toMatch(/RESEND_API_KEY/);
  });
  it("remetente Gmail não pode ser usado", () => {
    expect(explainMailError(403, "The gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains", "Eventos Conecta <thiago@gmail.com>")).toMatch(/gmail\.com.*não pode ser remetente/);
  });
  it("domínio próprio ainda não verificado", () => {
    expect(explainMailError(403, "The eventosconecta.com.br domain is not verified.", "avisos@eventosconecta.com.br")).toMatch(/eventosconecta\.com\.br ainda não foi verificado/);
  });
  it("modo de teste do Resend", () => {
    expect(explainMailError(403, "You can only send testing emails to your own email address (x@y.com).", "onboarding@resend.dev")).toMatch(/modo de teste/);
  });
});

describe("motivo da recusa do WhatsApp (Meta)", () => {
  it("token expirado, número fora da lista de teste e modelo inexistente", async () => {
    const { explainWhatsappError } = await import("./notify");
    expect(explainWhatsappError(190, "Error validating access token: Session has expired", "+5519999999999")).toMatch(/token/);
    expect(explainWhatsappError(131030, "Recipient phone number not in allowed list", "+5519999999999")).toMatch(/lista de teste/);
    expect(explainWhatsappError(132001, "Template name does not exist in the translation", "+55")).toMatch(/modelo/);
  });
});
