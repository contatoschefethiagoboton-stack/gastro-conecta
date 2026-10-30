export type Professional = {
  id: string;
  name: string;
  /** Nome da categoria principal (ex.: "Chefs e cozinha"). */
  type: string;
  /** Ids das categorias do catálogo de serviços que o profissional atende (filtros). */
  categoryIds?: string[];
  category: string;
  city: string;
  description: string;
  image: string;
  tags: string[];
  featured: boolean;
  demo: boolean;
  gallery?: string[];
  socials?: Array<{ network: string; url: string }>;
  website?: string;
  /** Serviços oferecidos (rótulos). */
  services?: string[];
  rating?: { average: number; count: number };
  /** Selo "Top Rated": média 4,5+ com 3 ou mais avaliações. */
  topRated?: boolean;
};

export const heroImage = '/img/hero.svg';
export const professionals: Professional[] = [
  {
    id: 'demo-chef', name: 'Ateliê da Mesa', type: 'Chefs e cozinha',
    category: 'Italiana contemporânea', city: 'São Paulo, SP',
    description: 'Um jantar feito para o seu momento. Menus autorais inspirados na cozinha italiana, com ingredientes frescos e um cuidado especial em cada detalhe.',
    image: '/img/demo-chef.svg',
    categoryIds: ['Gastronomia'], tags: ['Chef executivo', 'Jantar em casa'], featured: true, demo: true,
  },
  {
    id: 'demo-buffet', name: 'Essência Buffet', type: 'Chefs e cozinha',
    category: 'Celebrações & eventos', city: 'São Paulo, SP',
    description: 'Da recepção intimista à grande celebração, uma experiência gastronômica pensada para receber bem. Cozinha brasileira contemporânea e serviço acolhedor.',
    image: '/img/demo-buffet.svg',
    categoryIds: ['Gastronomia'], tags: ['Buffet', 'Eventos corporativos'], featured: false, demo: true,
  },
  {
    id: 'demo-brasa', name: 'Casa & Brasa', type: 'Chefs e cozinha',
    category: 'Brasileira & fogo', city: 'Campinas, SP',
    description: 'O encontro entre o sabor da brasa e a hospitalidade brasileira. Cortes selecionados, acompanhamentos sazonais e uma mesa que convida a ficar.',
    image: '/img/demo-brasa.svg',
    categoryIds: ['Gastronomia'], tags: ['Chef executivo', 'Churrasco premium'], featured: false, demo: true,
  },
];

// ------------------------------------------------------------------ portfólios demonstrativos editáveis

/** Portfólios demonstrativos editáveis no painel (Serviços e capas). JSON salvo no conteúdo do site. */
export const DEMO_CATALOG_KEY = 'catalog.demos';
export type DemoProfessional = { id: string; name: string; categoryId: string; category: string; city: string; description: string; image: string; tags: string[] };

const DEMO_IMAGE_RE = /^(\/api\/gastro\/media\/\d+|\/img\/[\w.-]+|https:\/\/\S+)$/;

export const DEFAULT_DEMOS: DemoProfessional[] = professionals.map(p => ({ id: p.id, name: p.name, categoryId: p.categoryIds?.[0] ?? '', category: p.category, city: p.city, description: p.description, image: p.image, tags: p.tags }));

/** Confere a lista vinda do painel. Lança Error com mensagem em português se algo estiver inválido. */
export function normalizeDemos(value: unknown): DemoProfessional[] {
  if (!Array.isArray(value)) throw new Error('Lista de portfólios inválida');
  if (value.length > 30) throw new Error('Máximo de 30 portfólios demonstrativos');
  const ids = new Set<string>();
  return value.map((raw: any, index) => {
    const name = String(raw?.name ?? '').trim().slice(0, 100);
    if (name.length < 2) throw new Error(`Portfólio ${index + 1}: informe o nome`);
    let id = String(raw?.id ?? '').trim().slice(0, 60);
    if (!/^demo-[\w-]+$/.test(id)) {
      const base = `demo-${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'portfolio'}`;
      id = base; let n = 2; while (ids.has(id)) id = `${base}-${n++}`;
    }
    if (ids.has(id)) throw new Error(`Portfólio “${name}” repetido`);
    ids.add(id);
    const image = String(raw?.image ?? '').trim();
    if (image && !DEMO_IMAGE_RE.test(image)) throw new Error(`Portfólio “${name}”: imagem inválida`);
    const tags = (Array.isArray(raw?.tags) ? raw.tags : String(raw?.tags ?? '').split(','))
      .map((t: unknown) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 6);
    return {
      id, name, image, tags,
      categoryId: String(raw?.categoryId ?? '').trim().slice(0, 60),
      category: String(raw?.category ?? '').trim().slice(0, 100),
      city: String(raw?.city ?? '').trim().slice(0, 100),
      description: String(raw?.description ?? '').trim().slice(0, 1000),
    };
  });
}

/** Lista atual de portfólios demonstrativos. Antes do primeiro salvamento, valem as capas antigas (cover.demo.<id>). */
export function demosFrom(content: Record<string, string | undefined> | undefined): DemoProfessional[] {
  const raw = content?.[DEMO_CATALOG_KEY];
  if (raw) { try { return normalizeDemos(JSON.parse(raw)); } catch { /* JSON corrompido: usa o padrão */ } }
  return DEFAULT_DEMOS.map(d => ({ ...d, image: content?.[`cover.demo.${d.id}`] || d.image }));
}

/** Converte os demonstrativos em cards do catálogo (nome da categoria vem do catálogo de serviços). */
export function demoProfessionals(content: Record<string, string | undefined> | undefined, categoryName: (id: string) => string | undefined): Professional[] {
  if (content?.['catalog.showDemo'] === 'false') return [];
  return demosFrom(content).map(d => ({
    id: d.id, name: d.name, type: categoryName(d.categoryId) ?? 'Profissional', categoryIds: d.categoryId ? [d.categoryId] : [],
    category: d.category, city: d.city, description: d.description, image: d.image, tags: d.tags, featured: false, demo: true,
  }));
}
