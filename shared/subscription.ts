// Assinatura mensal fixa do profissional (sem comissões sobre eventos).
export const RENEWAL_WINDOW_DAYS = 5;
const DAY = 24 * 60 * 60 * 1000;

export type SubscriptionPhase =
  | 'inactive'        // nunca assinou: perfil oculto
  | 'active'          // em dia
  | 'renewal'         // faltam 5 dias ou menos: cobrança automática via Pix
  | 'manual'          // cobrança automática falhou: Pix manual liberado no painel
  | 'blocked';        // vencida sem pagamento: oculto/bloqueado

export type SubscriptionState = { periodEnd: Date | null; autoFailed: boolean };

export function subscriptionPhase(state: SubscriptionState, now = new Date()): SubscriptionPhase {
  if (!state.periodEnd) return 'inactive';
  const end = state.periodEnd.getTime();
  if (now.getTime() >= end) return 'blocked';
  if (end - now.getTime() <= RENEWAL_WINDOW_DAYS * DAY) return state.autoFailed ? 'manual' : 'renewal';
  return 'active';
}

/** Perfil visível no catálogo e liberado para enviar propostas. */
export const subscriptionVisible = (phase: SubscriptionPhase) => phase === 'active' || phase === 'renewal' || phase === 'manual';

/** Quando a cobrança automática deve ser tentada para o período atual. */
export const renewalAttemptAt = (periodEnd: Date) => new Date(periodEnd.getTime() - RENEWAL_WINDOW_DAYS * DAY);

/** Novo vencimento depois de um pagamento aprovado: soma um mês a partir do vencimento (ou de hoje, se já venceu). */
export function nextPeriodEnd(currentEnd: Date | null, now = new Date()): Date {
  const base = currentEnd && currentEnd.getTime() > now.getTime() ? new Date(currentEnd) : new Date(now);
  const day = base.getUTCDate();
  base.setUTCMonth(base.getUTCMonth() + 1);
  if (base.getUTCDate() < day) base.setUTCDate(0); // 31/01 -> 28/02
  return base;
}

export const PHASE_LABELS: Record<SubscriptionPhase, string> = {
  inactive: 'Assinatura não ativada — perfil oculto',
  active: 'Assinatura em dia',
  renewal: 'Renovação automática via Pix em andamento',
  manual: 'Cobrança automática falhou — pague via Pix para não ficar oculto',
  blocked: 'Assinatura vencida — perfil oculto e propostas bloqueadas',
};

// ------------------------------------------------------------------ período de teste (grátis, definido pelo dono)

export type TrialUnit = 'days' | 'weeks' | 'months';
export const TRIAL_UNITS: Array<{ id: TrialUnit; one: string; many: string }> = [
  { id: 'days', one: 'dia', many: 'dias' },
  { id: 'weeks', one: 'semana', many: 'semanas' },
  { id: 'months', one: 'mês', many: 'meses' },
];
export type TrialSettings = { amount: number; unit: TrialUnit };
export const TRIAL_OFF: TrialSettings = { amount: 0, unit: 'days' };

export const isTrialUnit = (u: unknown): u is TrialUnit => TRIAL_UNITS.some(t => t.id === u);

/** Confere a duração escolhida no painel (até 365 dias, 52 semanas ou 12 meses; 0 = sem teste). */
export function normalizeTrial(amount: unknown, unit: unknown): TrialSettings {
  const u: TrialUnit = isTrialUnit(unit) ? unit : 'days';
  const max = u === 'days' ? 365 : u === 'weeks' ? 52 : 12;
  const n = Math.floor(Number(amount));
  return { amount: Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0, unit: u };
}

/** "7 dias", "2 semanas", "1 mês". */
export function trialLabel(t: TrialSettings): string {
  const unit = TRIAL_UNITS.find(x => x.id === t.unit) ?? TRIAL_UNITS[0];
  return t.amount <= 0 ? 'sem período de teste' : `${t.amount} ${t.amount === 1 ? unit.one : unit.many}`;
}

/** Fim do período de teste a partir de uma data. */
export function trialEnd(start: Date, t: TrialSettings): Date {
  const end = new Date(start);
  if (t.unit === 'days') end.setUTCDate(end.getUTCDate() + t.amount);
  else if (t.unit === 'weeks') end.setUTCDate(end.getUTCDate() + t.amount * 7);
  else {
    const day = end.getUTCDate();
    end.setUTCMonth(end.getUTCMonth() + t.amount);
    if (end.getUTCDate() < day) end.setUTCDate(0); // 31/01 + 1 mês = 28/02
  }
  return end;
}
