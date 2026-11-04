// Entende mensagens de Instagram, Facebook e WhatsApp ("preciso de garçom para sábado em Campinas")
// sem depender de IA: serviço, cidade, data e número de convidados. A IA (opcional) só completa
// quando as regras não acham o serviço.
import { slugify } from './services';
import { normalizeCityName, type SeoCity, type SeoService } from './seo';

export type Intent = {
  kind: 'client' | 'provider' | 'none';
  serviceSlug?: string;
  city?: SeoCity;
  date?: string; // AAAA-MM-DD
  guests?: number;
  source: 'rules' | 'ai';
};

/** Palavras que as pessoas usam → serviço (slug da página de SEO). */
const SYNONYMS: Array<[RegExp, string]> = [
  [/\bgar[cç]o(m|ns|nete|netes)\b/, 'garcom-para-evento'],
  [/\b(barman|barmans|bartender|bartenders|drinks?|open bar|coquetel(eiro)?)\b/, 'barman-para-evento'],
  [/\bpersonal chef\b|\bmarmitas?\b|\bfit\b/, 'personal-chef'],
  [/\bbuffets?\b|\bcomida para (a )?festa\b/, 'buffet-para-festa'],
  [/\b(cozinheir[oa]s?|auxiliar de cozinha|ajudante de cozinha)\b/, 'cozinheiro-para-evento'],
  [/\bchefs?\b|\bjantar (em casa|especial)\b/, 'chef-para-evento'],
  [/\blimpeza (pos|pós|depois)[- ]?(evento|festa)\b|\blimpar (o salao|a casa) depois\b/, 'limpeza-pos-evento'],
  [/\b(diarista|faxina|faxineira|limpeza (residencial|pesada))\b/, 'diarista'],
  [/\b(jardineir[oa]|jardim|jardinagem|paisagis(mo|ta)|poda|cortar grama)\b/, 'jardineiro'],
];

const CLIENT_HINTS = /\b(preciso|precisando|procuro|procurando|quero contratar|contratar|orcamento|orçamento|quanto (custa|cobra|fica|sai)|valor|indica(m|ção|cao)?|alguem (indica|faz|tem)|alguém (indica|faz|tem)|disponivel|disponível|tem (vaga|data|agenda)|faz(em)? (festa|evento))\b/;
const PROVIDER_HINTS = /\b(sou (garcom|garçom|garçonete|garconete|chef|cozinheir[oa]|barman|bartender|diarista|jardineir[oa]|confeiteir[oa])|trabalho (como|com)|quero trabalhar|vagas?\b|freelas?\b|me cadastrar|como (faço|faco) para (participar|me cadastrar|entrar)|procuro (trabalho|servico|serviço|freela))/;

const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const plain = (text: string) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** "sábado", "amanhã", "dia 12", "12/12", "12/12/2026" → AAAA-MM-DD (sempre no futuro). */
export function parseDate(text: string, now = new Date()): string | undefined {
  const t = plain(text);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const addDays = (n: number) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  if (/\bhoje\b/.test(t)) return iso(today);
  if (/\bdepois de amanha\b/.test(t)) return addDays(2);
  if (/\bamanha\b/.test(t)) return addDays(1);
  const full = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (full) {
    const day = Number(full[1]), month = Number(full[2]);
    let year = full[3] ? Number(full[3].length === 2 ? `20${full[3]}` : full[3]) : today.getUTCFullYear();
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    let d = new Date(Date.UTC(year, month - 1, day));
    if (!full[3] && d < today) { year += 1; d = new Date(Date.UTC(year, month - 1, day)); }
    return d.getUTCMonth() === month - 1 ? iso(d) : undefined;
  }
  const dayOnly = /\bdia (\d{1,2})\b/.exec(t);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    if (day < 1 || day > 31) return undefined;
    let d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
    if (d < today) d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, day));
    return iso(d);
  }
  const weekday = WEEKDAYS.findIndex(w => new RegExp(`\\b${w}(-feira)?\\b`).test(t));
  if (weekday >= 0) {
    const diff = (weekday - today.getUTCDay() + 7) % 7 || 7;
    return addDays(diff);
  }
  return undefined;
}

/** "50 pessoas", "para 30 convidados" → 50 / 30. */
export function parseGuests(text: string): number | undefined {
  const m = /\b(\d{1,4})\s*(pessoas|convidados|pax|adultos)\b/.exec(plain(text));
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 10000 ? n : undefined;
}

export function findCity(text: string, cities: SeoCity[]): SeoCity | undefined {
  const t = ` ${slugify(text).replace(/-/g, ' ')} `;
  // Nomes mais longos primeiro ("santa barbara d oeste" antes de "barbara").
  return [...cities].sort((a, b) => b.name.length - a.name.length).find(c => t.includes(` ${normalizeCityName(c.name).replace(/-/g, ' ')} `));
}

export function findService(text: string, services: SeoService[]): string | undefined {
  const t = plain(text);
  const known = new Set(services.map(s => s.slug));
  for (const [re, slug] of SYNONYMS) if (known.has(slug) && re.test(t)) return slug;
  // Serviços criados no painel: procura o nome curto ("confeitaria", "dj"…).
  const words = ` ${slugify(text).replace(/-/g, ' ')} `;
  return services.find(s => s.short.length >= 2 && words.includes(` ${slugify(s.short).replace(/-/g, ' ')} `))?.slug;
}

/** Intenção da mensagem pelas regras (sem IA). */
export function detectIntent(text: string, cities: SeoCity[], services: SeoService[], now = new Date()): Intent {
  const t = plain(text);
  const serviceSlug = findService(text, services);
  const city = findCity(text, cities);
  const date = parseDate(text, now);
  const guests = parseGuests(text);
  if (PROVIDER_HINTS.test(t)) return { kind: 'provider', serviceSlug, city, source: 'rules' };
  const isClient = CLIENT_HINTS.test(t) || (Boolean(serviceSlug) && (Boolean(date) || Boolean(guests) || /\b(para|pra) (festa|evento|casamento|aniversario|churrasco)\b/.test(t)));
  return isClient ? { kind: 'client', serviceSlug, city, date, guests, source: 'rules' } : { kind: 'none', source: 'rules' };
}
