/**
 * Pay-per-View — proteção do conteúdo exclusivo.
 *
 * O que a plataforma GARANTE (lado servidor):
 *  - o arquivo original nunca tem URL pública; vive só no bucket privado;
 *  - cada abertura consome 1 visualização de forma atômica (sem corrida);
 *  - a sessão de visualização expira (TTL no Redis); depois disso o servidor recusa;
 *  - fotos são entregues uma única vez por sessão, já com marca d'água forense
 *    (código único da compra) — um vazamento é rastreável até a compra;
 *  - respostas com Cache-Control: no-store (o navegador não grava em cache/disco);
 *  - estorno/chargeback revoga o acesso imediatamente.
 *
 * O que NENHUMA plataforma web consegue garantir: impedir captura de tela ou
 * filmagem da tela, nem "apagar" algo do aparelho do comprador. O visualizador
 * do front-end reduz o risco (blob em memória, revogado ao fim, sem download,
 * desfoque ao perder o foco), e a marca d'água torna o vazamento rastreável.
 * Para vídeo em escala, evolua para HLS cifrado/DRM (Widevine/FairPlay).
 */
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { env } from '../../config/env.js';
import type { Tx } from '../../db/pool.js';
import { pool } from '../../db/pool.js';
import { hmac, randomToken, safeEqual } from '../../lib/crypto.js';
import { queues } from '../../lib/queues.js';
import { redis } from '../../lib/redis.js';
import type { GatewayEvent } from '../payments/gateways/types.js';

// --------------------------------------------------------------- token de acesso
// Token = "<purchaseId>.<HMAC>": não precisa ser armazenado, pode ir por e-mail e
// também ser exibido na tela de confirmação. Revogação via revoked_at.
export const buildAccessToken = (purchaseId: string) =>
  `${purchaseId}.${hmac(env.PPV_TOKEN_SECRET, `ppv-access:${purchaseId}`).toString('base64url')}`;

export function verifyAccessToken(token: string): string | null {
  const [id, sig] = token.split('.');
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const expected = hmac(env.PPV_TOKEN_SECRET, `ppv-access:${id}`);
  return safeEqual(Buffer.from(sig, 'base64url'), expected) ? id : null;
}

export const newWatermarkCode = () => randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 8);

// --------------------------------------------------------------- pagamento
export async function markPpvPaid(c: Tx, purchaseId: string, gatewayName: string, ev: Extract<GatewayEvent, { type: 'payment.paid' }>) {
  const { rows } = await c.query(
    `UPDATE ppv_purchases p
        SET status = 'paid', access_expires_at = now() + make_interval(days => i.access_valid_days)
       FROM ppv_items i
      WHERE p.id = $1 AND i.id = p.item_id AND p.status = 'pending'
      RETURNING p.id, p.amount_cents, i.user_id`,
    [purchaseId],
  );
  const p = rows[0];
  if (!p) return; // já processado
  await c.query(
    `INSERT INTO payments (user_id, ppv_purchase_id, purpose, method, gateway, gateway_payment_id, amount_cents, status, paid_at, raw)
     VALUES ($1, $2, 'ppv', $3, $4, $5, $6, 'paid', $7, $8)
     ON CONFLICT (gateway, gateway_payment_id) DO NOTHING`,
    [p.user_id, purchaseId, ev.method, gatewayName, ev.gatewayPaymentId, ev.amountCents, ev.paidAt, JSON.stringify(ev)],
  );
  await queues.notifications.add('ppv', { type: 'ppv.deliver', purchaseId });
}

export async function revokePpvPurchase(c: Tx, purchaseId: string, reason: string) {
  await c.query(
    `UPDATE ppv_purchases SET revoked_at = now(), status = $2 WHERE id = $1`,
    [purchaseId, reason === 'payment.chargeback' ? 'chargeback' : 'refunded'],
  );
  // Sessões já abertas morrem sozinhas no TTL curto (view_window_seconds); novas aberturas são recusadas.
}

// --------------------------------------------------------------- visualização
export interface ViewSession {
  purchaseId: string;
  itemId: string;
  kind: 'photo' | 'video';
  mediaKey: string;
  watermark: string;
}

const sessionKey = (id: string) => `ppv:session:${id}`;

/** Consome 1 visualização (atômico) e abre uma sessão curta no Redis. */
export async function openViewSession(purchaseId: string, ip: string, userAgent?: string) {
  const { rows } = await pool.query(
    `UPDATE ppv_purchases p
        SET views_used      = p.views_used + 1,
            first_opened_at = COALESCE(p.first_opened_at, now()),
            consumed_at     = CASE WHEN p.views_used + 1 >= i.max_views THEN now() END
       FROM ppv_items i
      WHERE p.id = $1 AND i.id = p.item_id
        AND p.status = 'paid' AND p.revoked_at IS NULL AND p.consumed_at IS NULL
        AND p.access_expires_at > now() AND p.views_used < i.max_views AND i.is_active
      RETURNING p.id, p.watermark_code, p.views_used, i.id AS item_id, i.kind, i.media_key,
                i.max_views, i.view_mode, i.view_window_seconds`,
    [purchaseId],
  );
  const r = rows[0];
  if (!r) return null;

  await pool.query('INSERT INTO ppv_access_logs (purchase_id, ip, user_agent) VALUES ($1, $2, $3)', [purchaseId, ip, userAgent ?? null]);

  const sessionId = randomUUID();
  const session: ViewSession = { purchaseId, itemId: r.item_id, kind: r.kind, mediaKey: r.media_key, watermark: r.watermark_code };
  await redis.set(sessionKey(sessionId), JSON.stringify(session), 'EX', r.view_window_seconds);

  return {
    sessionId,
    kind: r.kind as 'photo' | 'video',
    expiresInSeconds: r.view_window_seconds as number,
    remainingViews: (r.max_views as number) - (r.views_used as number),
    viewMode: r.view_mode as 'single_view' | 'time_limited',
    watermarkCode: r.watermark_code as string,
  };
}

export async function getViewSession(sessionId: string): Promise<ViewSession | null> {
  const raw = await redis.get(sessionKey(sessionId));
  return raw ? (JSON.parse(raw) as ViewSession) : null;
}

/** Foto: só pode ser baixada UMA vez por sessão. */
export async function claimPhotoDelivery(sessionId: string): Promise<boolean> {
  const ok = await redis.set(`${sessionKey(sessionId)}:served`, '1', 'EX', 3600, 'NX');
  return ok === 'OK';
}

/** Marca d'água forense em mosaico (código da compra + data), aplicada no servidor. */
export async function watermarkImage(input: Buffer, code: string): Promise<Buffer> {
  const img = sharp(input).rotate();
  const meta = await img.metadata();
  const w = Math.min(meta.width ?? 1600, 1600);
  const resized = await img.resize({ width: w, withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const h = resized.info.height;
  const text = `${code} · ${new Date().toISOString().slice(0, 10)}`;
  const tiles: string[] = [];
  for (let y = 60; y < h; y += 180) {
    for (let x = -100; x < w; x += 360) {
      tiles.push(`<text x="${x}" y="${y}" transform="rotate(-25 ${x} ${y})">${text}</text>`);
    }
  }
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
       <style>text{font:600 26px sans-serif;fill:#fff;fill-opacity:.22;stroke:#000;stroke-opacity:.18;stroke-width:1}</style>
       ${tiles.join('')}
     </svg>`,
  );
  return sharp(resized.data).composite([{ input: svg }]).jpeg({ quality: 85 }).toBuffer();
}
