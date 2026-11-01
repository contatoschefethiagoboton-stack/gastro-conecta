/**
 * Máquina de estados de assinatura:
 *
 *   incomplete ──(1º pagamento / autorização)──▶ active ──(falha)──▶ past_due
 *        │                                        ▲  │                 │
 *        │                       (pagamento ok)───┘  │      (carência esgotada)
 *        ▼                                           ▼                 ▼
 *     canceled ◀──────────(cancelamento)────────  canceled           expired
 *
 *   trialing (degustação liberada pelo admin) ──(fim)──▶ expired
 *
 * Anúncios acompanham a assinatura: visible_until = fim do período; sem pagamento → paused_billing.
 */
import { env } from '../../config/env.js';
import type { Db, Tx } from '../../db/pool.js';
import { queues } from '../../lib/queues.js';
import { markPpvPaid, revokePpvPurchase } from '../ppv/service.js';
import type { GatewayEvent } from './gateways/types.js';

export function applyDiscount(
  priceCents: number,
  d: { percent_off: number | null; amount_off_cents: number | null } | null,
): number {
  if (!d) return priceCents;
  const off = d.percent_off ? Math.round((priceCents * d.percent_off) / 100) : d.amount_off_cents ?? 0;
  return Math.max(0, priceCents - off);
}

/** Libera/estende anúncios até `until` e reativa os que estavam pausados por cobrança. */
export async function extendAdsVisibility(db: Db, userId: string, until: Date | string): Promise<void> {
  await db.query(
    `UPDATE advertisements
        SET visible_until = $2,
            status = CASE WHEN status = 'paused_billing' THEN 'active'::ad_status ELSE status END,
            published_at = CASE WHEN status = 'paused_billing' AND published_at IS NULL THEN now() ELSE published_at END
      WHERE user_id = $1 AND status NOT IN ('removed', 'rejected')`,
    [userId, until],
  );
}

export async function pauseAdsForBilling(db: Db, userId: string): Promise<void> {
  await db.query(`UPDATE advertisements SET status = 'paused_billing' WHERE user_id = $1 AND status = 'active'`, [userId]);
}

const parseRef = (ref?: string) => {
  const m = ref?.match(/^(sub|ppv)_([0-9a-f-]{36})$/);
  return m ? { kind: m[1] as 'sub' | 'ppv', id: m[2]! } : null;
};

async function findSubscription(c: Tx, ev: { reference?: string; gatewaySubscriptionId?: string }) {
  const ref = parseRef(ev.reference);
  const { rows } = await c.query(
    `SELECT s.*, pl.period_days, pl.price_cents
       FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
      WHERE ($1::uuid IS NOT NULL AND s.id = $1::uuid) OR ($2::text IS NOT NULL AND s.gateway_subscription_id = $2)
      LIMIT 1
      FOR UPDATE OF s`,
    [ref?.kind === 'sub' ? ref.id : null, ev.gatewaySubscriptionId ?? null],
  );
  return rows[0] as
    | { id: string; user_id: string; status: string; current_period_end: Date | null; period_days: number; discount_cycles_remaining: number | null }
    | undefined;
}

export async function processGatewayEvent(c: Tx, gatewayName: string, ev: GatewayEvent): Promise<void> {
  const ref = parseRef(ev.reference);

  // ---------------------------------------------------------------- PPV
  if (ref?.kind === 'ppv') {
    if (ev.type === 'payment.paid') return markPpvPaid(c, ref.id, gatewayName, ev);
    if (ev.type === 'payment.refunded' || ev.type === 'payment.chargeback') return revokePpvPurchase(c, ref.id, ev.type);
    if (ev.type === 'payment.failed') {
      await c.query(`UPDATE ppv_purchases SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [ref.id]);
    }
    return;
  }

  // ---------------------------------------------------------------- assinatura
  switch (ev.type) {
    case 'subscription.activated': {
      // Autorização (PIX Automático/mandato) — o período só começa com o pagamento confirmado.
      await c.query(
        `UPDATE subscriptions SET gateway_subscription_id = COALESCE(gateway_subscription_id, $2)
          WHERE id = $1`,
        [ref?.id ?? null, ev.gatewaySubscriptionId],
      );
      return;
    }

    case 'payment.paid': {
      const sub = await findSubscription(c, ev);
      if (!sub) throw new Error(`Assinatura não encontrada para ${ev.reference ?? ev.gatewaySubscriptionId}`);

      const ins = await c.query(
        `INSERT INTO payments (user_id, subscription_id, purpose, method, gateway, gateway_payment_id, amount_cents, status, paid_at, raw)
         VALUES ($1, $2, 'subscription', $3, $4, $5, $6, 'paid', $7, $8)
         ON CONFLICT (gateway, gateway_payment_id) DO UPDATE SET status = 'paid', paid_at = EXCLUDED.paid_at
         RETURNING (xmax = 0) AS inserted`,
        [sub.user_id, sub.id, ev.method, gatewayName, ev.gatewayPaymentId, ev.amountCents, ev.paidAt, JSON.stringify(ev)],
      );
      if (!ins.rows[0]?.inserted) return; // mesmo pagamento já contabilizado

      const now = new Date();
      const start = ev.periodStart
        ? new Date(ev.periodStart)
        : sub.current_period_end && sub.current_period_end > now
          ? sub.current_period_end
          : now;
      const end = ev.periodEnd ? new Date(ev.periodEnd) : new Date(start.getTime() + sub.period_days * 86_400_000);

      await c.query(
        `UPDATE subscriptions SET
           status = 'active', current_period_start = $2, current_period_end = $3, past_due_since = NULL,
           discount_cycles_remaining = CASE WHEN discount_cycles_remaining > 0 THEN discount_cycles_remaining - 1 ELSE discount_cycles_remaining END
         WHERE id = $1`,
        [sub.id, start, end],
      );
      await c.query(`UPDATE users SET status = 'active' WHERE id = $1 AND status = 'pending_verification'
                       AND EXISTS (SELECT 1 FROM profiles WHERE user_id = $1 AND is_verified)`, [sub.user_id]);
      await extendAdsVisibility(c, sub.user_id, end);
      return;
    }

    case 'payment.failed': {
      const sub = await findSubscription(c, ev);
      if (!sub) return;
      await c.query(
        `INSERT INTO payments (user_id, subscription_id, purpose, method, gateway, gateway_payment_id, amount_cents, status, failure_reason, raw)
         VALUES ($1, $2, 'subscription', $3, $4, $5, $6, 'failed', $7, $8)
         ON CONFLICT (gateway, gateway_payment_id) DO UPDATE SET status = 'failed', failure_reason = EXCLUDED.failure_reason`,
        [sub.user_id, sub.id, ev.method, gatewayName, ev.gatewayPaymentId, ev.amountCents, ev.reason, JSON.stringify(ev)],
      );
      // Anúncio continua no ar durante a carência (BILLING_GRACE_DAYS); o worker pausa depois.
      await c.query(
        `UPDATE subscriptions SET status = 'past_due', past_due_since = COALESCE(past_due_since, now())
          WHERE id = $1 AND status IN ('active', 'past_due')`,
        [sub.id],
      );
      await queues.notifications.add('past_due', { type: 'billing.past_due', userId: sub.user_id });
      return;
    }

    case 'payment.refunded':
    case 'payment.chargeback': {
      const { rows } = await c.query<{ user_id: string; subscription_id: string }>(
        `UPDATE payments SET status = $2 WHERE gateway = $1 AND gateway_payment_id = $3
         RETURNING user_id, subscription_id`,
        [gatewayName, ev.type === 'payment.refunded' ? 'refunded' : 'chargeback', ev.gatewayPaymentId],
      );
      const p = rows[0];
      if (p && ev.type === 'payment.chargeback') {
        await c.query(`UPDATE subscriptions SET status = 'expired' WHERE id = $1`, [p.subscription_id]);
        await pauseAdsForBilling(c, p.user_id);
        await c.query(
          `INSERT INTO fraud_flags (user_id, kind, severity, details) VALUES ($1, 'chargeback', 'high', $2)`,
          [p.user_id, JSON.stringify({ gatewayPaymentId: ev.gatewayPaymentId })],
        );
      }
      return;
    }

    case 'subscription.canceled': {
      // Cancelado no PSP: mantém no ar até o fim do período já pago.
      await c.query(
        `UPDATE subscriptions SET cancel_at_period_end = true, canceled_at = now()
          WHERE gateway_subscription_id = $1`,
        [ev.gatewaySubscriptionId],
      );
      return;
    }
  }
}

/** Varredura periódica (worker a cada 10 min): expira degustações e inadimplentes. */
export async function billingSweep(c: Tx): Promise<{ expired: number }> {
  const { rows } = await c.query<{ user_id: string }>(
    `UPDATE subscriptions SET status = 'expired'
      WHERE (status = 'trialing' AND trial_ends_at < now())
         OR (status = 'past_due' AND past_due_since < now() - make_interval(days => $1))
         OR (status = 'active'   AND current_period_end < now() - make_interval(days => $1))
         OR (status = 'active'   AND cancel_at_period_end AND current_period_end < now())
         OR (status = 'incomplete' AND created_at < now() - interval '2 days')
      RETURNING user_id`,
    [env.BILLING_GRACE_DAYS],
  );
  for (const r of rows) await pauseAdsForBilling(c, r.user_id);
  // Segurança extra: qualquer anúncio ativo cujo período venceu sai do ar
  await c.query(`UPDATE advertisements SET status = 'paused_billing' WHERE status = 'active' AND visible_until < now()`);
  return { expired: rows.length };
}
