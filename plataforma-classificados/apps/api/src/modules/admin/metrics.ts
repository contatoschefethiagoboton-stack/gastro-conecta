import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';

export async function getSnapshot() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*) FROM advertisements WHERE status = 'active' AND visible_until > now())::int          AS active_ads,
      (SELECT count(*) FROM users WHERE role = 'advertiser' AND status = 'active')::int                    AS active_advertisers,
      (SELECT count(*) FROM subscriptions WHERE status = 'active')::int                                     AS paying_subscriptions,
      (SELECT count(*) FROM subscriptions WHERE status = 'trialing')::int                                   AS trials,
      (SELECT count(*) FROM subscriptions WHERE status = 'past_due')::int                                   AS past_due,
      (SELECT COALESCE(sum(amount_cents), 0) FROM payments WHERE status = 'paid' AND paid_at >= date_trunc('day', now()))::bigint   AS revenue_today_cents,
      (SELECT COALESCE(sum(amount_cents), 0) FROM payments WHERE status = 'paid' AND paid_at >= date_trunc('month', now()))::bigint AS revenue_month_cents,
      (SELECT COALESCE(sum(pl.price_cents * 30.0 / pl.period_days), 0)
         FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id WHERE s.status = 'active')::bigint                                AS mrr_cents,
      (SELECT count(*) FROM identity_verifications WHERE status = 'pending_review')::int AS pending_verifications,
      (SELECT count(*) FROM advertisements WHERE status = 'pending_review')::int        AS pending_ads,
      (SELECT count(*) FROM ad_media WHERE moderation = 'pending' AND safety_scan_status = 'clean')::int AS pending_media,
      (SELECT count(*) FROM ppv_items WHERE moderation = 'pending')::int                AS pending_ppv,
      (SELECT count(*) FROM reports WHERE status = 'open')::int                         AS open_reports,
      (SELECT count(*) FROM fraud_flags WHERE status = 'open' AND severity IN ('high', 'critical'))::int AS open_fraud_flags,
      now() AS generated_at`);
  return rows[0];
}

export async function getSeries(days: number) {
  const { rows } = await pool.query(
    `WITH d AS (SELECT generate_series(date_trunc('day', now()) - make_interval(days => $1 - 1), date_trunc('day', now()), interval '1 day') AS day)
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            (SELECT count(*) FROM users u WHERE u.role = 'advertiser' AND date_trunc('day', u.created_at) = d.day)::int AS new_advertisers,
            (SELECT count(*) FROM advertisements a WHERE date_trunc('day', a.published_at) = d.day)::int              AS ads_published,
            (SELECT COALESCE(sum(amount_cents), 0) FROM payments p WHERE p.status = 'paid' AND p.purpose = 'subscription' AND date_trunc('day', p.paid_at) = d.day)::bigint AS subscription_cents,
            (SELECT COALESCE(sum(amount_cents), 0) FROM payments p WHERE p.status = 'paid' AND p.purpose = 'ppv' AND date_trunc('day', p.paid_at) = d.day)::bigint          AS ppv_cents
       FROM d ORDER BY d.day`,
    [days],
  );
  return rows;
}

export async function metricsRoutes(app: FastifyInstance) {
  const guard = { preHandler: app.requireRole('admin') };

  app.get('/admin/metrics', guard, async (req) => {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(req.query);
    return { snapshot: await getSnapshot(), series: await getSeries(days) };
  });

  /**
   * Tempo real via Server-Sent Events: envia um snapshot a cada 10 s.
   * O front usa fetch() com streaming (permite cabeçalho Authorization).
   */
  app.get('/admin/metrics/stream', guard, async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': String(req.headers.origin ?? ''),
    });
    const push = async () => {
      try {
        reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(await getSnapshot())}\n\n`);
      } catch (err) {
        req.log.error({ err }, 'falha no stream de métricas');
      }
    };
    await push();
    const timer = setInterval(push, 10_000);
    req.raw.on('close', () => clearInterval(timer));
    return reply; // mantém a conexão aberta
  });
}
