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
