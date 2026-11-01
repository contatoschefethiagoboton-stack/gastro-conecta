import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { pool, tx } from '../../db/pool.js';
import { decrypt } from '../../lib/crypto.js';
import { HttpError } from '../../lib/errors.js';
import { gateway } from './gateways/index.js';
import { applyDiscount, processGatewayEvent } from './service.js';

const subscribeSchema = z.object({
  planCode: z.enum(['quinzenal', 'mensal']),
  method: z.enum(['pix_automatico', 'cartao_credito', 'debito_conta']),
  cardToken: z.string().min(8).max(500).optional(),
  bankAccount: z.object({ bank: z.string().max(5), agency: z.string().max(10), account: z.string().max(20) }).optional(),
  couponCode: z.string().trim().max(40).optional(),
  deviceFingerprint: z.string().max(200).optional(),
});

export async function paymentRoutes(app: FastifyInstance) {
  app.get('/plans', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    const { rows } = await pool.query(
      `SELECT code, name, cycle, period_days, price_cents, currency, max_ads, max_photos, features
         FROM plans WHERE is_active ORDER BY period_days`,
    );
    return rows;
  });

  app.get('/me/subscription', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `SELECT s.id, s.status, s.payment_method, s.current_period_end, s.trial_ends_at, s.cancel_at_period_end,
              pl.code AS plan, pl.price_cents
         FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
        WHERE s.user_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
      [req.user.sub],
    );
    return rows[0] ?? null;
  });

  /** Inicia a assinatura recorrente. Retorna QR Code (PIX Automático) ou URL de autorização/3DS. */
  app.post('/me/subscription', { preHandler: app.authenticate, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const b = subscribeSchema.parse(req.body);
    if (b.method === 'cartao_credito' && !b.cardToken) throw new HttpError(400, 'card_token_required', 'Cartão não informado.');
    if (b.method === 'debito_conta' && !b.bankAccount) throw new HttpError(400, 'bank_required', 'Dados bancários não informados.');
    if (b.method === 'pix_automatico' && b.planCode === 'quinzenal' && !env.PIX_AUTOMATICO_ALLOWS_BIWEEKLY) {
      // As periodicidades do PIX Automático são definidas pelo Bacen (semanal, mensal, ...). Confirme com o PSP.
      throw new HttpError(422, 'pix_interval_unsupported', 'Para o plano quinzenal use cartão de crédito ou escolha o plano mensal no PIX Automático.');
    }

    const userId = req.user.sub;
    const prepared = await tx(async (c) => {
      const plan = (await c.query('SELECT * FROM plans WHERE code = $1 AND is_active', [b.planCode])).rows[0];
      if (!plan) throw new HttpError(404, 'plan_not_found', 'Plano indisponível.');

      // descarta tentativa anterior não concluída
      await c.query(`UPDATE subscriptions SET status = 'canceled', canceled_at = now() WHERE user_id = $1 AND status = 'incomplete'`, [userId]);
      const live = await c.query(`SELECT 1 FROM subscriptions WHERE user_id = $1 AND status IN ('trialing', 'active', 'past_due')`, [userId]);
      if (live.rowCount) throw new HttpError(409, 'already_subscribed', 'Você já possui uma assinatura ativa.');

      let discount = null;
      if (b.couponCode) {
        discount = (
          await c.query(
            `UPDATE discounts SET redemptions = redemptions + 1
              WHERE code = $1 AND (valid_until IS NULL OR valid_until > now())
                AND (max_redemptions IS NULL OR redemptions < max_redemptions)
              RETURNING *`,
            [b.couponCode],
          )
        ).rows[0];
        if (!discount) throw new HttpError(422, 'invalid_coupon', 'Cupom inválido ou esgotado.');
      }

      const sub = (
        await c.query<{ id: string }>(
          `INSERT INTO subscriptions (user_id, plan_id, status, payment_method, gateway, discount_id, discount_cycles_remaining)
           VALUES ($1, $2, 'incomplete', $3, $4, $5, $6) RETURNING id`,
          [userId, plan.id, b.method, gateway.name, discount?.id ?? null, discount?.duration_cycles ?? null],
        )
      ).rows[0]!;

      // Dados do titular vão ao PSP (exigência de PIX/antifraude) — única saída permitida de PII.
      const pd = (await c.query('SELECT full_name_enc, cpf_enc, phone_enc FROM advertiser_private_data WHERE user_id = $1', [userId])).rows[0];
      const email = (await c.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId])).rows[0]!.email;
      const recurring = discount && discount.duration_cycles === null ? applyDiscount(plan.price_cents, discount) : plan.price_cents;
      return {
        sub,
        plan,
        firstAmount: applyDiscount(plan.price_cents, discount),
        recurring,
        customer: {
          name: decrypt(pd.full_name_enc, userId),
          document: decrypt(pd.cpf_enc, userId),
          phone: decrypt(pd.phone_enc, userId),
          email,
        },
      };
    });

    try {
      const result = await gateway.createSubscription({
        reference: `sub_${prepared.sub.id}`,
        customer: prepared.customer,
        method: b.method,
        amountCents: prepared.firstAmount,
        recurringAmountCents: prepared.recurring,
        intervalDays: prepared.plan.period_days as 15 | 30,
        cardToken: b.cardToken,
        bankAccount: b.bankAccount,
        antiFraud: { ip: req.ip, userAgent: req.headers['user-agent'], deviceFingerprint: b.deviceFingerprint },
      });
      await pool.query(
        'UPDATE subscriptions SET gateway_subscription_id = $2, gateway_customer_id = $3 WHERE id = $1',
        [prepared.sub.id, result.gatewaySubscriptionId, result.gatewayCustomerId ?? null],
      );
      return reply.code(201).send({
        subscriptionId: prepared.sub.id,
        status: 'incomplete',
        amountCents: prepared.firstAmount,
        pix: result.pix,
        redirectUrl: result.redirectUrl,
      });
    } catch (err) {
      await pool.query(`UPDATE subscriptions SET status = 'canceled', canceled_at = now() WHERE id = $1`, [prepared.sub.id]);
      req.log.error({ err }, 'falha ao criar assinatura no gateway');
      throw new HttpError(502, 'gateway_error', 'Não foi possível iniciar o pagamento. Tente novamente.');
    }
  });

  app.post('/me/subscription/cancel', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `UPDATE subscriptions SET cancel_at_period_end = true, canceled_at = now()
        WHERE user_id = $1 AND status IN ('active', 'past_due') RETURNING gateway_subscription_id, current_period_end`,
      [req.user.sub],
    );
    if (!rows[0]) throw new HttpError(404, 'no_subscription', 'Nenhuma assinatura ativa.');
    if (rows[0].gateway_subscription_id) await gateway.cancelSubscription(rows[0].gateway_subscription_id);
    return { canceled: true, activeUntil: rows[0].current_period_end };
  });

  // -------------------------------------------------------------------- webhooks
  // Escopo isolado: aqui o corpo chega como Buffer para validar a assinatura HMAC.
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

    scope.post('/webhooks/payments', { config: { rateLimit: false } }, async (req, reply) => {
      const raw = req.body as Buffer;
      if (!gateway.verifyWebhook(raw, req.headers)) {
        req.log.warn({ ip: req.ip }, 'webhook com assinatura inválida');
        return reply.code(401).send({ error: 'invalid_signature' });
      }
      const ev = gateway.parseWebhook(raw);
      if (!ev) return reply.send({ ignored: true });

      // Idempotência: o PSP pode reenviar o mesmo evento várias vezes
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO webhook_events (gateway, event_id, event_type, payload) VALUES ($1, $2, $3, $4)
         ON CONFLICT (gateway, event_id) DO UPDATE SET event_id = EXCLUDED.event_id
         RETURNING id, processed_at`,
        [gateway.name, ev.eventId, ev.type, raw.toString('utf8')],
      );
      const row = ins.rows[0] as { id: string; processed_at: Date | null };
      if (row.processed_at) return reply.send({ duplicate: true });

      try {
        await tx(async (c) => {
          await processGatewayEvent(c, gateway.name, ev);
          await c.query('UPDATE webhook_events SET processed_at = now(), error = NULL WHERE id = $1', [row.id]);
        });
        return reply.send({ ok: true });
      } catch (err) {
        await pool.query('UPDATE webhook_events SET error = $2 WHERE id = $1', [row.id, String(err)]);
        req.log.error({ err, eventId: ev.eventId }, 'falha ao processar webhook');
        return reply.code(500).send({ error: 'processing_failed' }); // PSP tentará de novo
      }
    });
  });
}
