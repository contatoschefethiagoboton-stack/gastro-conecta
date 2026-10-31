import { describe, expect, it } from "vitest";
import { classifySource } from "@shared/marketing";

describe("origem das visitas", () => {
  it("anúncio do Google (gclid ou cpc) é patrocinado", () => {
    expect(classifySource({ gclid: true })).toMatchObject({ source: "google", medium: "pago" });
    expect(classifySource({ utmSource: "google", utmMedium: "cpc", utmCampaign: "pesquisa" })).toEqual({ source: "google", medium: "pago", campaign: "pesquisa" });
  });
  it("busca orgânica no Google pelo site de origem", () => {
    expect(classifySource({ referrer: "https://www.google.com/" })).toEqual({ source: "google", medium: "organico" });
  });
  it("Instagram e Facebook, orgânico e patrocinado", () => {
    expect(classifySource({ referrer: "https://l.instagram.com/?u=x" })).toMatchObject({ source: "instagram", medium: "organico" });
    expect(classifySource({ utmSource: "instagram", utmMedium: "paid_social" })).toMatchObject({ source: "instagram", medium: "pago" });
    expect(classifySource({ referrer: "https://m.facebook.com/" })).toMatchObject({ source: "facebook", medium: "organico" });
  });
  it("indicação de fornecedores e clientes", () => {
    expect(classifySource({ utmSource: "fornecedor", utmMedium: "indicacao", ref: "GC-00012" })).toEqual({ source: "indicacao", medium: "indicacao", ref: "GC-00012" });
    expect(classifySource({ ref: "GC-00003" })).toMatchObject({ source: "indicacao", medium: "indicacao" });
  });
  it("direto e o próprio site", () => {
    expect(classifySource({})).toEqual({ source: "direto", medium: "direto" });
    expect(classifySource({ referrer: "https://gastroconecta.com.br/sobre", ownHost: "gastroconecta.com.br" })).toEqual({ source: "direto", medium: "direto" });
  });
});
