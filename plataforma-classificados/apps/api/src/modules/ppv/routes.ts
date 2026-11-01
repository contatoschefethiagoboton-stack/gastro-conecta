import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { blindIndex, encrypt, randomToken, safeEqual, sha256 } from '../../lib/crypto.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { queues } from '../../lib/queues.js';
import { getPrivateBuffer, getPrivateStream, headPrivate, MB, presignUpload } from '../../lib/storage.js';
import { gateway } from '../payments/gateways/index.js';
import {
  buildAccessToken, claimPhotoDelivery, getViewSession, newWatermarkCode, openViewSession,
  verifyAccessToken, watermarkImage,
} from './service.js';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Content-Disposition': 'inline',
  'Cross-Origin-Resource-Policy': 'same-site',
};

const itemSchema = z
  .object({
    adId: z.string().uuid(),
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().max(500).optional(),
    kind: z.enum(['photo', 'video']),
    mediaKey: z.string().min(10),
    priceCents: z.number().int().min(500).max(100_000),
    viewMode: z.enum(['single_view', 'time_limited']),
    maxViews: z.number().int().min(1).max(10).default(1),
    viewWindowSeconds: z.number().int().min(10).max(86_400).default(60),
    accessValidDays: z.number().int().min(1).max(90).default(7),
  })
  .transform((v) => (v.viewMode === 'single_view' ? { ...v, maxViews: 1 } : v));

export async function ppvRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------ anunciante
  app.post('/me/ppv/upload', { preHandler: app.authenticate }, async (req) => {
    const b = z.object({ kind: z.enum(['photo', 'video']) }).parse(req.body);
    const key = `ppv/${req.user.sub}/${randomUUID()}`;
    return {
      key,
      upload: await presignUpload({ key, contentTypePrefix: b.kind === 'photo' ? 'image/' : 'video/', maxBytes: b.kind === 'photo' ? 25 * MB : 500 * MB }),
    };
  });

  app.post('/me/ppv/items', { preHandler: app.authenticate }, async (req, reply) => {
    const b = itemSchema.parse(req.body);
    if (!b.mediaKey.startsWith(`ppv/${req.user.sub}/`)) throw new HttpError(400, 'invalid_key', 'Arquivo inválido.');
    if (!(await headPrivate(b.mediaKey))) throw new HttpError(400, 'missing_upload', 'Envie o arquivo antes.');
    const own = await pool.query('SELECT 1 FROM advertisements WHERE id = $1 AND user_id = $2', [b.adId, req.user.sub]);
    if (!own.rowCount) throw notFound('Anúncio');

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO ppv_items (user_id, ad_id, title, description, kind, media_key, price_cents, view_mode, max_views, view_window_seconds, access_valid_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [req.user.sub, b.adId, b.title, b.description ?? null, b.kind, b.mediaKey, b.priceCents, b.viewMode, b.maxViews, b.viewWindowSeconds, b.accessValidDays],
    );
    // worker: varredura de segurança + prévia borrada; depois vai para a fila de moderação
    await queues.media.add('ppv', { kind: 'ppv_item', itemId: rows[0]!.id }, { jobId: `ppv-${rows[0]!.id}` });
    return reply.code(201).send({ id: rows[0]!.id, moderation: 'pending' });
  });

  app.get('/me/ppv/sales', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `SELECT i.id, i.title, count(p.id) FILTER (WHERE p.status = 'paid') AS sales,
              COALESCE(sum(p.creator_amount_cents) FILTER (WHERE p.status = 'paid'), 0) AS earnings_cents
         FROM ppv_items i LEFT JOIN ppv_purchases p ON p.item_id = i.id
        WHERE i.user_id = $1 GROUP BY i.id ORDER BY i.created_at DESC`,
      [req.user.sub],
    );
    return rows;
  });

  // ------------------------------------------------------------ público: vitrine
  app.get('/ads/:adId/ppv', async (req, reply) => {
    const { adId } = z.object({ adId: z.string().uuid() }).parse(req.params);
    const { rows } = await pool.query(
      `SELECT id, title, description, kind, price_cents, teaser_url, view_mode, max_views, view_window_seconds, access_valid_days
         FROM ppv_items WHERE ad_id = $1 AND moderation = 'approved' AND is_active ORDER BY created_at DESC`,
      [adId],
    );
    reply.header('Cache-Control', 'public, max-age=60');
    return rows;
  });

  // ------------------------------------------------------------ compra rápida (sem cadastro)
  app.post('/ppv/checkout', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const b = z
      .object({
        itemId: z.string().uuid(),
        email: z.string().email().max(254),
        method: z.enum(['pix_avulso', 'cartao_credito']).default('pix_avulso'),
        cardToken: z.string().min(8).max(500).optional(),
        deviceFingerprint: z.string().max(200).optional(),
        confirmAdult: z.literal(true), // declaração de maioridade do comprador
      })
      .parse(req.body);

    const item = (
      await pool.query('SELECT id, title, price_cents FROM ppv_items WHERE id = $1 AND moderation = $2 AND is_active', [b.itemId, 'approved'])
    ).rows[0];
    if (!item) throw notFound('Conteúdo');

    const purchaseId = randomUUID();
    const statusToken = randomToken(24);
    const fee = Math.round((item.price_cents * env.PPV_PLATFORM_FEE_PCT) / 100);
    await pool.query(
      `INSERT INTO ppv_purchases (id, item_id, buyer_email_enc, buyer_email_hash, amount_cents, platform_fee_cents,
                                  creator_amount_cents, status_secret_hash, watermark_code, buyer_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [purchaseId, item.id, encrypt(b.email, purchaseId), blindIndex(b.email, 'email'), item.price_cents, fee,
       item.price_cents - fee, sha256(statusToken), newWatermarkCode(), req.ip],
    );

    const charge = await gateway.createCharge({
      reference: `ppv_${purchaseId}`,
      customer: { email: b.email },
      method: b.method,
      amountCents: item.price_cents,
      description: `Conteúdo exclusivo #${item.id.slice(0, 8)}`, // descrição discreta na fatura
      cardToken: b.cardToken,
      antiFraud: { ip: req.ip, userAgent: req.headers['user-agent'], deviceFingerprint: b.deviceFingerprint },
    });

    return reply.code(201).send({ purchaseId, statusToken, amountCents: item.price_cents, pix: charge.pix, redirectUrl: charge.redirectUrl });
  });

  /** O navegador consulta até o pagamento compensar; então recebe o token de acesso. */
  app.get('/ppv/purchases/:id/status', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const token = String(req.headers['x-status-token'] ?? '');
    const { rows } = await pool.query('SELECT status, status_secret_hash, revoked_at FROM ppv_purchases WHERE id = $1', [id]);
    const p = rows[0];
    if (!p || !safeEqual(sha256(token), p.status_secret_hash)) throw notFound('Compra');
    reply.headers(NO_STORE);
    return p.status === 'paid' && !p.revoked_at ? { status: 'paid', accessToken: buildAccessToken(id) } : { status: p.status };
  });

  // ------------------------------------------------------------ visualização
  app.post('/ppv/access/:token/open', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const { token } = z.object({ token: z.string().max(200) }).parse(req.params);
    const purchaseId = verifyAccessToken(token);
    if (!purchaseId) throw new HttpError(403, 'invalid_token', 'Link de acesso inválido.');
    const session = await openViewSession(purchaseId, req.ip, req.headers['user-agent']);
    if (!session) throw new HttpError(410, 'expired', 'Este conteúdo já foi visualizado ou o prazo de acesso expirou.');
    reply.headers(NO_STORE);
    return session;
  });

  app.get('/ppv/stream/:sessionId', async (req, reply) => {
    const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(req.params);
    const s = await getViewSession(sessionId);
    if (!s) throw new HttpError(410, 'session_expired', 'Sessão de visualização encerrada.');
    reply.headers(NO_STORE);

    if (s.kind === 'photo') {
      if (!(await claimPhotoDelivery(sessionId))) throw new HttpError(410, 'already_served', 'Conteúdo já entregue nesta sessão.');
      const marked = await watermarkImage(await getPrivateBuffer(s.mediaKey), s.watermark);
      return reply.type('image/jpeg').send(marked);
    }

    // Vídeo: proxy com suporte a Range; cada requisição revalida a sessão (expira = corta).
    const range = typeof req.headers.range === 'string' ? req.headers.range : 'bytes=0-';
    const obj = await getPrivateStream(s.mediaKey, range);
    reply.code(obj.contentRange ? 206 : 200).header('Accept-Ranges', 'bytes').type(obj.contentType);
    if (obj.contentRange) reply.header('Content-Range', obj.contentRange);
    if (obj.contentLength !== undefined) reply.header('Content-Length', obj.contentLength);
    return reply.send(obj.body);
  });
}
