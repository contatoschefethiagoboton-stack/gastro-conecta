// Promoções sazonais. As campanhas ficam no banco de dados e são gerenciadas
// pelo painel de administração (Promoções). Cada campanha aparece sozinha no
// site entre "start" e "end" (mês-dia, todo ano); janelas que viram o ano
// (ex.: 01/11 a 06/01) funcionam normalmente. A lista abaixo só é usada para
// preencher o banco na primeira inicialização.
export type Promotion = {
  id: string | number;
  active: boolean;
  start: string; // "MM-DD"
  end: string;   // "MM-DD"
  badge: string;
  title: string;
  text: string;
  cta: string;
  whatsappMessage: string;
  eventType?: string; // pré-seleciona a ocasião no orçamento
  imageUrl?: string;
  sortOrder?: number;
  /** Adicional que o fornecedor paga para aparecer na promoção (centavos; 0 = grátis). */
  providerFeeCents?: number;
};

export const EVENT_TYPES = ['Jantar em casa', 'Aniversário', 'Casamento', 'Evento corporativo', 'Confraternização', 'Outra ocasião'] as const;
export const isMonthDay = (value: string) => /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);

export const defaultPromotions: Promotion[] = [
  {
    id: 'confraternizacao-corporativa', active: true, start: '10-01', end: '12-20',
    badge: 'Fim de ano', title: 'Confraternização da empresa',
    text: 'Coquetel, almoço ou jantar para celebrar o ano com a equipe. Cardápio sob medida e equipe completa em Campinas e região.',
    cta: 'Reservar data', eventType: 'Evento corporativo',
    whatsappMessage: 'Olá! Vi a campanha de confraternização de fim de ano e quero reservar uma data para a minha empresa.',
  },
  {
    id: 'natal-reveillon', active: true, start: '11-01', end: '01-06',
    badge: 'Natal & Réveillon', title: 'Ceia de Natal e Ano-Novo em casa',
    text: 'Ceia preparada e servida na sua casa, para você aproveitar a noite com a família. Datas concorridas: reserve com antecedência.',
    cta: 'Quero minha ceia', eventType: 'Jantar em casa',
    whatsappMessage: 'Olá! Tenho interesse na ceia de Natal/Ano-Novo em casa. Pode me passar as opções?',
  },
  {
    id: 'verao-churrasco', active: true, start: '01-07', end: '03-15',
    badge: 'Verão', title: 'Churrasco com churrasqueiro profissional',
    text: 'Você recebe os amigos e a gente cuida da brasa, dos cortes e dos acompanhamentos, direto na sua casa.',
    cta: 'Agendar churrasco', eventType: 'Confraternização',
    whatsappMessage: 'Olá! Quero agendar um churrasco com churrasqueiro profissional.',
  },
  {
    id: 'dia-das-maes', active: true, start: '04-15', end: '05-12',
    badge: 'Dia das Mães', title: 'Almoço especial para a mãe',
    text: 'Um almoço ou jantar de chef em casa, com menu pensado para homenagear quem merece.',
    cta: 'Planejar homenagem', eventType: 'Jantar em casa',
    whatsappMessage: 'Olá! Quero planejar um almoço/jantar especial de Dia das Mães.',
  },
  {
    id: 'dia-dos-namorados', active: true, start: '05-20', end: '06-12',
    badge: 'Dia dos Namorados', title: 'Jantar a dois com chef em casa',
    text: 'Menu degustação exclusivo para o casal, preparado e servido na sua casa.',
    cta: 'Reservar jantar', eventType: 'Jantar em casa',
    whatsappMessage: 'Olá! Quero reservar um jantar a dois de Dia dos Namorados.',
  },
  {
    id: 'arraia', active: true, start: '06-13', end: '07-31',
    badge: 'Festa junina', title: 'Boteco e arraiá em casa',
    text: 'Comidas típicas, petiscos de boteco e serviço completo para a sua festa junina ou julina.',
    cta: 'Montar meu arraiá', eventType: 'Confraternização',
    whatsappMessage: 'Olá! Quero fazer um boteco/arraiá em casa. Pode me passar as opções?',
  },
  {
    id: 'dia-dos-pais', active: true, start: '07-25', end: '08-14',
    badge: 'Dia dos Pais', title: 'Churrasco ou almoço para o pai',
    text: 'Churrasqueiro profissional ou chef em casa para celebrar o Dia dos Pais sem ninguém ficar preso na cozinha.',
    cta: 'Planejar o almoço', eventType: 'Confraternização',
    whatsappMessage: 'Olá! Quero planejar o almoço/churrasco de Dia dos Pais.',
  },
];

const MD = /^(\d{2})-(\d{2})$/;

function toKey(md: string): number {
  const m = MD.exec(md);
  if (!m) return -1;
  return Number(m[1]) * 100 + Number(m[2]);
}

/** Está dentro da janela? Aceita janelas que atravessam a virada do ano. */
export function isPromotionActive(p: Promotion, today: Date = new Date()): boolean {
  if (!p.active) return false;
  const start = toKey(p.start);
  const end = toKey(p.end);
  if (start < 0 || end < 0) return false;
  const now = (today.getMonth() + 1) * 100 + today.getDate();
  return start <= end ? now >= start && now <= end : now >= start || now <= end;
}

export function activePromotions(today: Date = new Date(), list: Promotion[] = defaultPromotions): Promotion[] {
  return list.filter(p => isPromotionActive(p, today));
}

/** Fim da janela em andamento (último segundo do dia "end"), ou null se a promoção não está no ar. */
export function promotionWindowEnd(p: Promotion, today: Date = new Date()): Date | null {
  if (!isPromotionActive(p, today)) return null;
  const [m, d] = p.end.split('-').map(Number);
  const now = (today.getMonth() + 1) * 100 + today.getDate();
  const year = toKey(p.start) > toKey(p.end) && now >= toKey(p.start) ? today.getFullYear() + 1 : today.getFullYear();
  return new Date(year, m - 1, d, 23, 59, 59);
}
