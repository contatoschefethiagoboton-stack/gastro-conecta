import { describe, expect, it } from "vitest";
import { explainMailError } from "./password";

describe("motivo da recusa do e-mail (Resend)", () => {
  it("chave inválida", () => {
    expect(explainMailError(401, "API key is invalid", "avisos@x.com")).toMatch(/RESEND_API_KEY/);
  });
  it("remetente Gmail não pode ser usado", () => {
    expect(explainMailError(403, "The gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains", "GastroConecta <thiago@gmail.com>")).toMatch(/gmail\.com.*não pode ser remetente/);
  });
  it("domínio próprio ainda não verificado", () => {
    expect(explainMailError(403, "The gastroconecta.com.br domain is not verified.", "avisos@gastroconecta.com.br")).toMatch(/gastroconecta\.com\.br ainda não foi verificado/);
  });
  it("modo de teste do Resend", () => {
    expect(explainMailError(403, "You can only send testing emails to your own email address (x@y.com).", "onboarding@resend.dev")).toMatch(/modo de teste/);
  });
});
