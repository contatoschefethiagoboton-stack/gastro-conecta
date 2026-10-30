// Catálogo de serviços editável pelo painel (Textos do site → Serviços e capas).
// Cada categoria vira um card na página inicial e agrupa as profissões que o
// profissional escolhe no cadastro. O catálogo fica salvo como JSON no conteúdo
// do site (chave SERVICE_CATALOG_KEY); sem nada salvo, vale o catálogo padrão.

/** Tipo de calculadora usada para estimar o valor dos pedidos da categoria. */
export type RequestCategory = 'event' | 'mealPrep' | 'cleaning' | 'gardening';
export const REQUEST_CATEGORIES: Array<{ id: RequestCategory; label: string }> = [
  { id: 'event', label: 'Evento / gastronomia' },
  { id: 'mealPrep', label: 'Personal chef — marmitas' },
  { id: 'cleaning', label: 'Limpeza' },
  { id: 'gardening', label: 'Jardinagem / paisagismo' },
];

export const SERVICE_ICONS = ['chef', 'pot', 'wine', 'sparkles', 'leaf', 'utensils', 'cake', 'coffee', 'flame', 'music', 'camera', 'truck'] as const;
export type ServiceIcon = typeof SERVICE_ICONS[number];

export type ServiceItem = { id: string; label: string };
export type ServiceCategory = {
  id: string;
  name: string;
  subtitle: string;
  icon: ServiceIcon;
  calculator: RequestCategory;
  cover: string;
  services: ServiceItem[];
};
/** Profissão com a categoria a que pertence. */
export type ServiceType = ServiceItem & { categoryId: string; group: string; calculator: RequestCategory };

export const SERVICE_CATALOG_KEY = 'services.catalog';

// Os ids das categorias padrão mantêm os valores antigos (filtros e capas já salvas continuam valendo).
export const DEFAULT_SERVICE_CATALOG: ServiceCategory[] = [
  { id: 'Gastronomia', name: 'Chefs e cozinha', subtitle: 'Chef executivo, cozinheiros e auxiliares', icon: 'chef', calculator: 'event', cover: '', services: [
    { id: 'chef-executivo', label: 'Chef executivo' },
    { id: 'buffet', label: 'Buffet' },
    { id: 'cozinheiro', label: 'Cozinheiro(a)' },
    { id: 'auxiliar-cozinha', label: 'Auxiliar de cozinha' },
  ] },
  { id: 'personal', name: 'Personal chef', subtitle: 'Marmitas semanais, fit e low-carb', icon: 'pot', calculator: 'mealPrep', cover: '', services: [
    { id: 'personal-chef', label: 'Personal chef (marmitas semanais / fit)' },
  ] },
  { id: 'Bar & salão', name: 'Bar & salão', subtitle: 'Garçons e barmans para o seu evento', icon: 'wine', calculator: 'event', cover: '', services: [
    { id: 'barman', label: 'Barman' },
    { id: 'garcom', label: 'Garçom / garçonete' },
  ] },
  { id: 'Limpeza', name: 'Limpeza', subtitle: 'Residencial, pesada e pós-evento', icon: 'sparkles', calculator: 'cleaning', cover: '', services: [
    { id: 'limpeza-residencial', label: 'Limpeza residencial' },
    { id: 'limpeza-pesada', label: 'Limpeza pesada' },
    { id: 'limpeza-restaurante', label: 'Limpeza de restaurante' },
    { id: 'limpeza-pos-evento', label: 'Limpeza pós-evento' },
  ] },
  { id: 'Jardinagem', name: 'Jardinagem', subtitle: 'Manutenção e paisagismo', icon: 'leaf', calculator: 'gardening', cover: '', services: [
    { id: 'jardinagem', label: 'Jardinagem / paisagismo' },
  ] },
];

/** Gera um id estável a partir do nome (sem acentos, minúsculo, com hífens). */
export function slugify(text: string): string {
  return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const CALCULATORS = new Set<string>(REQUEST_CATEGORIES.map(c => c.id));
const ICONS = new Set<string>(SERVICE_ICONS);
const IMAGE_RE = /^(\/api\/gastro\/media\/\d+|\/img\/[\w.-]+|https:\/\/\S+)$/;

/**
 * Confere e normaliza um catálogo vindo do painel. Lança Error com mensagem em português
 * quando algo está inválido (nomes vazios, ids repetidos, imagem inválida…).
 */
export function normalizeServiceCatalog(value: unknown): ServiceCategory[] {
  if (!Array.isArray(value)) throw new Error('Catálogo de serviços inválido');
  if (!value.length) throw new Error('Mantenha pelo menos uma categoria de serviço');
  if (value.length > 40) throw new Error('Máximo de 40 categorias');
  const categoryIds = new Set<string>();
  const serviceIds = new Set<string>();
  return value.map((raw: any, index) => {
    const name = String(raw?.name ?? '').trim().slice(0, 80);
    if (name.length < 2) throw new Error(`Categoria ${index + 1}: informe o nome`);
    const id = String(raw?.id ?? '').trim().slice(0, 60) || slugify(name);
    if (!id || categoryIds.has(id)) throw new Error(`Categoria “${name}”: nome repetido`);
    categoryIds.add(id);
    const cover = String(raw?.cover ?? '').trim();
    if (cover && !IMAGE_RE.test(cover)) throw new Error(`Categoria “${name}”: imagem inválida`);
    const rawServices = Array.isArray(raw?.services) ? raw.services : [];
    if (!rawServices.length) throw new Error(`Categoria “${name}”: adicione pelo menos uma profissão`);
    if (rawServices.length > 40) throw new Error(`Categoria “${name}”: máximo de 40 profissões`);
    const services = rawServices.map((s: any) => {
      const label = String(s?.label ?? '').trim().slice(0, 100);
      if (label.length < 2) throw new Error(`Categoria “${name}”: há uma profissão sem nome`);
      let sid = String(s?.id ?? '').trim().slice(0, 60) || slugify(label);
      if (!sid) throw new Error(`Profissão “${label}”: nome inválido`);
      // Profissão nova com nome igual a outra existente ganha um sufixo.
      if (serviceIds.has(sid) && !s?.id) { let n = 2; while (serviceIds.has(`${sid}-${n}`)) n++; sid = `${sid}-${n}`; }
      if (serviceIds.has(sid)) throw new Error(`Profissão “${label}” repetida`);
      serviceIds.add(sid);
      return { id: sid, label };
    });
    return {
      id, name, cover, services,
      subtitle: String(raw?.subtitle ?? '').trim().slice(0, 160),
      icon: (ICONS.has(raw?.icon) ? raw.icon : 'utensils') as ServiceIcon,
      calculator: (CALCULATORS.has(raw?.calculator) ? raw.calculator : 'event') as RequestCategory,
    };
  });
}

/**
 * Catálogo atual a partir do conteúdo do site. Nunca falha: se o JSON salvo estiver
 * corrompido, volta ao padrão. Antes do primeiro salvamento, valem as capas antigas (cover.cat.<id>).
 */
export function serviceCatalogFrom(content: Record<string, string | undefined> | undefined): ServiceCategory[] {
  const raw = content?.[SERVICE_CATALOG_KEY];
  if (raw) { try { return normalizeServiceCatalog(JSON.parse(raw)); } catch { /* JSON corrompido: usa o padrão */ } }
  return DEFAULT_SERVICE_CATALOG.map(c => ({ ...c, cover: content?.[`cover.cat.${c.id}`] || '' }));
}

export const allServices = (catalog: ServiceCategory[]): ServiceType[] =>
  catalog.flatMap(c => c.services.map(s => ({ ...s, categoryId: c.id, group: c.name, calculator: c.calculator })));
export const findService = (catalog: ServiceCategory[], id: string | null | undefined) => allServices(catalog).find(s => s.id === id);
export const findCategory = (catalog: ServiceCategory[], id: string | null | undefined) => catalog.find(c => c.id === id);

// Atalhos sobre o catálogo padrão (testes e textos fixos).
export const SERVICE_TYPES: ServiceType[] = allServices(DEFAULT_SERVICE_CATALOG);
export const serviceById = (id: string | null | undefined) => findService(DEFAULT_SERVICE_CATALOG, id);
export const serviceLabel = (id: string | null | undefined, catalog: ServiceCategory[] = DEFAULT_SERVICE_CATALOG) => findService(catalog, id)?.label ?? 'Serviço';

export const MEAL_PLANS = ['Semanal', 'Fitness', 'Low-carb', 'Congelados personalizados'] as const;
export const CLEANING_KINDS = ['Residencial', 'Limpeza pesada', 'Restaurante', 'Pós-evento'] as const;
export const GARDEN_KINDS = ['Manutenção', 'Paisagismo'] as const;

/** Escopo do contrato: só mão de obra ou serviço completo (louças, utensílios e ingredientes). */
export type ContractScope = 'labor' | 'full';
export const SCOPE_LABELS: Record<ContractScope, string> = {
  labor: 'Somente serviço / mão de obra',
  full: 'Serviço completo (inclui louças, pratos, talheres, copos, utensílios de cozinha e ingredientes)',
};

/** O que o cliente escolheu no pedido: categoria e, opcionalmente, a profissão exata. */
export type RequestTarget = { serviceCategoryId?: string; serviceId?: string };

/** O profissional atende o pedido? (radar só mostra pedidos compatíveis). */
export function serviceMatchesRequest(services: string[], category: RequestCategory, catalog: ServiceCategory[] = DEFAULT_SERVICE_CATALOG, target: RequestTarget = {}): boolean {
  if (!services.length) return true;
  if (target.serviceId && findService(catalog, target.serviceId)) return services.includes(target.serviceId);
  const wanted = findCategory(catalog, target.serviceCategoryId);
  if (wanted) return services.some(id => wanted.services.some(s => s.id === id));
  return services.some(id => {
    const s = findService(catalog, id);
    if (!s) return false;
    if (category === 'event') return s.calculator === 'event' || s.calculator === 'mealPrep';
    return s.calculator === category;
  });
}
