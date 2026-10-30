import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE_CATALOG, normalizeServiceCatalog, serviceCatalogFrom, serviceMatchesRequest, SERVICE_CATALOG_KEY } from "@shared/services";
import { platformEstimateCents } from "@shared/copilot";

describe("catálogo de serviços editável", () => {
  it("sem nada salvo usa o padrão e aproveita as capas antigas", () => {
    const catalog = serviceCatalogFrom({ "cover.cat.personal": "/api/gastro/media/7" });
    expect(catalog.map(c => c.id)).toEqual(DEFAULT_SERVICE_CATALOG.map(c => c.id));
    expect(catalog.find(c => c.id === "personal")?.cover).toBe("/api/gastro/media/7");
  });
  it("cria ids para categorias e profissões novas", () => {
    const saved = normalizeServiceCatalog([...DEFAULT_SERVICE_CATALOG, { id: "", name: "Confeitaria", subtitle: "Bolos", icon: "cake", calculator: "event", cover: "", services: [{ id: "", label: "Confeiteiro(a)" }] }]);
    const novo = saved.at(-1)!;
    expect(novo.id).toBe("confeitaria");
    expect(novo.services[0].id).toBe("confeiteiro-a");
    // Depois de salvo, o catálogo é lido do conteúdo e as capas antigas não voltam.
    const read = serviceCatalogFrom({ [SERVICE_CATALOG_KEY]: JSON.stringify(saved.map(c => ({ ...c, cover: "" }))), "cover.cat.personal": "/api/gastro/media/7" });
    expect(read.find(c => c.id === "personal")?.cover).toBe("");
    expect(read.at(-1)?.name).toBe("Confeitaria");
  });
  it("recusa categoria sem profissão, nome vazio e imagem inválida", () => {
    expect(() => normalizeServiceCatalog([])).toThrow();
    expect(() => normalizeServiceCatalog([{ name: "Confeitaria", services: [] }])).toThrow(/profissão/);
    expect(() => normalizeServiceCatalog([{ name: "", services: [{ label: "X1" }] }])).toThrow(/nome/);
    expect(() => normalizeServiceCatalog([{ name: "Confeitaria", cover: "javascript:alert(1)", services: [{ label: "Confeiteiro" }] }])).toThrow(/imagem/);
  });
  it("JSON corrompido volta ao padrão", () => {
    expect(serviceCatalogFrom({ [SERVICE_CATALOG_KEY]: "{oops" }).length).toBe(DEFAULT_SERVICE_CATALOG.length);
  });
  it("radar respeita a profissão exata pedida pelo cliente", () => {
    expect(serviceMatchesRequest(["garcom"], "event", DEFAULT_SERVICE_CATALOG, { serviceCategoryId: "Bar & salão", serviceId: "garcom" })).toBe(true);
    expect(serviceMatchesRequest(["barman"], "event", DEFAULT_SERVICE_CATALOG, { serviceCategoryId: "Bar & salão", serviceId: "garcom" })).toBe(false);
    expect(serviceMatchesRequest(["barman"], "event", DEFAULT_SERVICE_CATALOG, { serviceCategoryId: "Bar & salão" })).toBe(true);
    expect(serviceMatchesRequest(["chef-executivo"], "event", DEFAULT_SERVICE_CATALOG, { serviceCategoryId: "Bar & salão" })).toBe(false);
  });
});

describe("valor sugerido pela plataforma", () => {
  it("cresce com o número de convidados e inclui insumos no serviço completo", () => {
    const small = platformEstimateCents({ category: "event", type: "Jantar em casa", guests: 10, scope: "labor" });
    const big = platformEstimateCents({ category: "event", type: "Jantar em casa", guests: 100, scope: "labor" });
    const full = platformEstimateCents({ category: "event", type: "Jantar em casa", guests: 100, scope: "full" });
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
    expect(full).toBeGreaterThan(big);
  });
  it("profissão exata (garçom) conta só essa função", () => {
    const waiters = platformEstimateCents({ category: "event", type: "Aniversário", guests: 50, serviceLabel: "Garçom / garçonete" });
    const all = platformEstimateCents({ category: "event", type: "Aniversário", guests: 50 });
    expect(waiters).toBeGreaterThan(0);
    expect(waiters).toBeLessThan(all);
  });
  it("marmitas, limpeza e jardinagem têm valor", () => {
    expect(platformEstimateCents({ category: "mealPrep", type: "Semanal", guests: 1, mealsPerWeek: 10, weeks: 2 })).toBeGreaterThan(0);
    expect(platformEstimateCents({ category: "cleaning", type: "Residencial", guests: 1, areaM2: 80 })).toBeGreaterThan(0);
    expect(platformEstimateCents({ category: "gardening", type: "Paisagismo", guests: 1, areaM2: 200 })).toBeGreaterThan(0);
  });
});
