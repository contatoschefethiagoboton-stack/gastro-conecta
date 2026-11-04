import { describe, expect, it } from 'vitest';
import { draftServiceFromName, draftToCategory, findServiceArea, suggestIcon } from '../shared/serviceAreas';
import { DEFAULT_SERVICE_CATALOG, normalizeServiceCatalog, SERVICE_ICONS, allServices } from '../shared/services';
import { resolveSeoRoute, seoCatalogFrom, seoCitiesFrom, seoPaths } from '../shared/seo';

const existing = allServices(DEFAULT_SERVICE_CATALOG).map(s => s.label);

describe('criação automática de serviço', () => {
  it.each([
    ['Confeitaria', 'cake', 'Confeiteiro(a)'],
    ['DJ', 'music', 'DJ'],
    ['Fotografia e vídeo', 'camera', 'Fotógrafo(a)'],
    ['Churrasco', 'flame', 'Churrasqueiro'],
    ['Decoração de festas', 'flower', 'Florista'],
    ['Recreação infantil', 'party', 'Recreador(a)'],
    ['Segurança', 'shield', 'Segurança'],
    ['Petiscos', 'sandwich', 'Salgadeiro(a)'],
    ['Sommelier', 'wine', 'Sommelier'],
    ['Limpeza de piscina', 'droplets', 'Piscineiro'],
  ])('%s → ícone %s e profissão %s', (name, icon, service) => {
    const { draft, matched } = draftServiceFromName(name, existing);
    expect(matched).toBe(true);
    expect(draft.icon).toBe(icon);
    expect(draft.services).toContain(service);
    expect(draft.subtitle.length).toBeGreaterThan(10);
  });
  it('não repete profissões que já existem em outra categoria', () => {
    const { draft } = draftServiceFromName('Garçons e copa', existing);
    expect(draft.services).not.toContain('Garçom / garçonete');
    expect(draft.services).not.toContain('Barman');
    expect(draft.services).toContain('Copeiro(a)');
  });
  it('nome desconhecido vira categoria genérica com o próprio nome como profissão', () => {
    const { draft, matched } = draftServiceFromName('xilofonia quântica', existing);
    expect(matched).toBe(false);
    expect(draft.name).toBe('Xilofonia quântica');
    expect(draft.icon).toBe('party');
    expect(draft.services).toEqual(['Xilofonia quântica']);
  });
  it('o rascunho passa na validação do catálogo e ganha ids', () => {
    const catalog = normalizeServiceCatalog([...DEFAULT_SERVICE_CATALOG, draftToCategory(draftServiceFromName('Confeitaria', existing).draft)]);
    const cat = catalog.at(-1)!;
    expect(cat.id).toBe('confeitaria');
    expect(cat.services.map(s => s.id)).toContain('confeiteiro-a');
  });
  it('todos os ícones das áreas existem na lista de ícones', () => {
    for (const name of ['bolo', 'van', 'maquiagem', 'pet', 'aula', 'telão', 'tenda', 'lavanderia', 'eletricista', 'mestre de cerimônias'])
      expect(SERVICE_ICONS).toContain(suggestIcon(name));
    expect(findServiceArea('')).toBeNull();
  });
});

describe('páginas do Google para serviços novos', () => {
  const catalog = normalizeServiceCatalog([...DEFAULT_SERVICE_CATALOG, draftToCategory(draftServiceFromName('Confeitaria', existing).draft), draftToCategory(draftServiceFromName('Limpeza de piscina', existing).draft)]);
  const seo = seoCatalogFrom(catalog);
  const cities = seoCitiesFrom({});
  it('cria página do serviço novo e de cada profissão nova', () => {
    expect(seo.services.map(s => s.slug)).toEqual(expect.arrayContaining(['confeitaria-para-evento', 'limpeza-de-piscina']));
    expect(seo.professions.map(p => p.slug)).toEqual(expect.arrayContaining(['confeiteiro-a', 'bolo-personalizado', 'piscineiro']));
    const r = resolveSeoRoute('/sp/campinas/confeitaria-para-evento', cities, seo) as any;
    expect(r.page.h1).toBe('Confeitaria para evento em Campinas');
    const j = resolveSeoRoute('/sp/valinhos/bolo-personalizado', cities, seo) as any;
    expect(j.page.h1).toBe('Bolo personalizado em Valinhos: receba pedidos de clientes');
    expect(j.page.title.length).toBeLessThanOrEqual(70);
    expect(seoPaths(cities, seo)).toContain('/sp/campinas/confeitaria-para-evento');
  });
  it('mantém as páginas padrão e não duplica endereços', () => {
    expect(seo.services.map(s => s.slug)).toContain('garcom-para-evento');
    expect(new Set(seo.services.map(s => s.slug)).size).toBe(seo.services.length);
    expect(new Set(seo.professions.map(p => p.slug)).size).toBe(seo.professions.length);
  });
  it('serviço excluído no painel perde a página', () => {
    const semJardim = seoCatalogFrom(DEFAULT_SERVICE_CATALOG.filter(c => c.id !== 'Jardinagem'));
    expect(semJardim.services.map(s => s.slug)).not.toContain('jardineiro');
    expect(resolveSeoRoute('/servicos/jardineiro', cities, semJardim)).toBeNull();
  });
});
