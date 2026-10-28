// Dados de contato do negócio. Edite aqui para atualizar o site inteiro.
export const business = {
  name: 'GastroConecta',
  company: 'Boton Eventos e Alimentação LTDA',
  chef: 'Thiago Boton',
  region: 'Campinas e região',
  whatsappNumber: '5519993984529', // DDI + DDD + número, só dígitos
  whatsappDisplay: '(19) 99398-4529',
  email: 'thiagoboton22@gmail.com',
  showcaseUrl: 'https://www.chefcampinas.vip',
  showcaseLabel: 'chefcampinas.vip',
} as const;

const MAX_MESSAGE = 1500;

/** Link wa.me com mensagem pré-preenchida. */
export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${business.whatsappNumber}`;
  const text = (message ?? '').trim().slice(0, MAX_MESSAGE);
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export type QuoteSummaryInput = {
  type: string;
  title?: string;
  date?: string; // AAAA-MM-DD
  city?: string;
  location?: string;
  guests?: string | number;
  budget?: string | number;
  description?: string;
  requestId?: number | null;
};

function formatDate(value?: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'a definir';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

function formatBudget(value?: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'a definir';
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
}

/** Mensagem de WhatsApp com o resumo do pedido de orçamento. */
export function quoteWhatsappMessage(q: QuoteSummaryInput): string {
  const lines = [
    `Olá! Vim pelo site ${business.name} e quero um orçamento.`,
    q.requestId ? `Pedido nº ${q.requestId}` : '',
    `Ocasião: ${q.title?.trim() || q.type}`,
    `Data: ${formatDate(q.date)}`,
    `Cidade: ${q.city?.trim() || 'a definir'}${q.location?.trim() ? ` (${q.location.trim()})` : ''}`,
    `Convidados: ${q.guests || 'a definir'}`,
    `Orçamento estimado: ${formatBudget(q.budget)}`,
    q.description?.trim() ? `Detalhes: ${q.description.trim().slice(0, 600)}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
