/**
 * Gestão de ofertas: degustação gratuita manual (padrão 10 dias), descontos,
 * cupons e troca de plano.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx } from '../../db/pool.js';
import { logAdmin } from '../../lib/audit.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { gateway } from '../payments/gateways/index.js';
import { applyDiscount, extendAdsVisibility } from '../payments/service.js';

const idParam = z.object({ id: z.string().uuid() });

export async function offersRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  /** Libera degustação gratuita. Se já houver degustação, estende. */
  app.post('/admin/users/:id/trial', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z
      .object({
        days: z.number().int().min(1).max(60).default(10),
        planCode: z.enum(['quinzenal', 'mensal']).default('mensal'),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(req.body);

    return tx(async (c) => {
      const user = (await c.query(`SELECT id FROM users WHERE id = $1 AND role = 'advertiser' FOR UPDATE`, [id])).rows[0];
      if (!user) throw notFound('Anunciante');
      const live = (
        await c.query(`SELECT id, status, trial_ends_at FROM subscriptions WHERE user_id = $1 AND status IN ('incomplete', 'trialing', 'active', 'past_due') FOR UPDATE`, [id])
      ).rows[0];
      if (live && live.status !== 'trialing' && live.status !== 'incomplete') {
        throw new HttpError(409, 'has_paid_subscription', 'Anunciante já possui assinatura paga. Use desconto.');
      }
      if (live?.status === 'incomplete') await c.query(`UPDATE subscriptions SET status = 'canceled' WHERE id = $1`, [live.id]);

      let row;
      if (live?.status === 'trialing') {
        row = (
          await c.query(
            `UPDATE subscriptions SET trial_ends_at = GREATEST(trial_ends_at, now()) + make_interval(days => $2),
                    current_period_end = GREATEST(trial_ends_at, now()) + make_interval(days => $2), trial_granted_by = $3
              WHERE id = $1 RETURNING id, trial_ends_at`,
            [live.id, b.days, req.user.sub],
          )
        ).rows[0];
      } else {
        row = (
          await c.query(
            `INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end, trial_ends_at, trial_granted_by)
             SELECT $1, id, 'trialing', now(), now() + make_interval(days => $2), now() + make_interval(days => $2), $3
               FROM plans WHERE code = $4
             RETURNING id, trial_ends_at`,
            [id, b.days, req.user.sub, b.planCode],
          )
        ).rows[0];
      }
      await extendAdsVisibility(c, id, row.trial_ends_at);
      await logAdmin(c, req, { action: 'trial.grant', targetType: 'user', targetId: id, before: live ?? null, after: { days: b.days, until: row.trial_ends_at }, reason: b.reason });
      return { subscriptionId: row.id, trialEndsAt: row.trial_ends_at };
    });
  });

  /** Desconto manual numa assinatura (percentual ou valor fixo, por N ciclos ou para sempre). */
  app.post('/admin/subscriptions/:id/discount', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z
      .object({
        percentOff: z.number().int().min(1).max(100).optional(),
        amountOffCents: z.number().int().positive().optional(),
        cycles: z.number().int().min(1).max(24).optional(), // ausente = para sempre
        reason: z.string().trim().min(3).max(500),
      })
      .refine((v) => (v.percentOff === undefined) !== (v.amountOffCents === undefined), 'Informe percentual OU valor')
      .parse(req.body);

    return tx(async (c) => {
      const sub = (
        await c.query(`SELECT s.*, pl.price_cents FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id WHERE s.id = $1 FOR UPDATE OF s`, [id])
      ).rows[0];
      if (!sub) throw notFound('Assinatura');
      const d = (
        await c.query(
          `INSERT INTO discounts (description, percent_off, amount_off_cents, duration_cycles, created_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [b.reason, b.percentOff ?? null, b.amountOffCents ?? null, b.cycles ?? null, req.user.sub],
        )
      ).rows[0];
      await c.query('UPDATE subscriptions SET discount_id = $2, discount_cycles_remaining = $3 WHERE id = $1', [id, d.id, b.cycles ?? null]);
      const newAmount = applyDiscount(sub.price_cents, d);
      // Próximas cobranças com o novo valor. (Em desconto por N ciclos, o worker restaura o valor cheio ao zerar.)
      if (sub.gateway_subscription_id) await gateway.updateSubscriptionAmount(sub.gateway_subscription_id, newAmount);
      await logAdmin(c, req, { action: 'subscription.discount', targetType: 'subscription', targetId: id, after: { discountId: d.id, newAmount }, reason: b.reason });
      return { subscriptionId: id, discountId: d.id, nextAmountCents: newAmount };
    });
  });

  app.post('/admin/subscriptions/:id/plan', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ planCode: z.enum(['quinzenal', 'mensal']), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    return tx(async (c) => {
      const sub = (await c.query('SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!sub) throw notFound('Assinatura');
      const plan = (await c.query('SELECT * FROM plans WHERE code = $1', [b.planCode])).rows[0];
      await c.query('UPDATE subscriptions SET plan_id = $2 WHERE id = $1', [id, plan.id]);
      if (sub.gateway_subscription_id) await gateway.updateSubscriptionAmount(sub.gateway_subscription_id, plan.price_cents);
      await logAdmin(c, req, { action: 'subscription.plan', targetType: 'subscription', targetId: id, before: { planId: sub.plan_id }, after: { planId: plan.id }, reason: b.reason });
      return { subscriptionId: id, plan: b.planCode };
    });
  });

  app.post('/admin/coupons', adminOnly, async (req, reply) => {
    const b = z
      .object({
        code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/),
        description: z.string().trim().min(3).max(200),
        percentOff: z.number().int().min(1).max(100).optional(),
        amountOffCents: z.number().int().positive().optional(),
        durationCycles: z.number().int().min(1).max(24).optional(),
        validUntil: z.string().datetime().optional(),
        maxRedemptions: z.number().int().positive().optional(),
      })
      .refine((v) => (v.percentOff === undefined) !== (v.amountOffCents === undefined), 'Informe percentual OU valor')
      .parse(req.body);
    const row = await tx(async (c) => {
      const d = (
        await c.query(
          `INSERT INTO discounts (code, description, percent_off, amount_off_cents, duration_cycles, valid_until, max_redemptions, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, code`,
          [b.code, b.description, b.percentOff ?? null, b.amountOffCents ?? null, b.durationCycles ?? null, b.validUntil ?? null, b.maxRedemptions ?? null, req.user.sub],
        )
      ).rows[0];
      await logAdmin(c, req, { action: 'coupon.create', targetType: 'discount', targetId: d.id, after: b });
      return d;
    });
    return reply.code(201).send(row);
  });
}
