import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type Db, pool, tx } from '../../db/pool.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { queues } from '../../lib/queues.js';
import { headPrivate, MB, presignUpload } from '../../lib/storage.js';
import { roundCoord, slugify } from '../../lib/validators.js';
import {
  ACCEPTED_PAYMENTS, AMENITIES, AUDIENCES, CATEGORIES, GENDERS, MASSAGE_TYPES,
  ORIENTATIONS, SERVICE_LOCATIONS, SERVICES,
} from '../taxonomy.js';

const uniq = <T extends readonly [string, ...string[]]>(values: T) =>
  z.array(z.enum(values)).max(values.length).default([]).transform((a) => [...new Set(a)]);

const handle = z.string().trim().max(40).regex(/^[A-Za-z0-9_.+\-]+$/);
const phone = z.string().regex(/^\+?\d{10,14}$/, 'Use o formato +5511999999999');

export const adSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(20).max(5000),
    category: z.enum(CATEGORIES),
    gender: z.enum(GENDERS),
    orientation: z.enum(ORIENTATIONS),
    massageTypes: uniq(MASSAGE_TYPES),
    audiences: uniq(AUDIENCES),
    services: uniq(SERVICES),
    serviceLocations: uniq(SERVICE_LOCATIONS),
    amenities: uniq(AMENITIES),
    acceptedPayments: uniq(ACCEPTED_PAYMENTS),
    whatsapp: phone.optional(),
    telegram: handle.optional(),
    phonePublic: phone.optional(),
    offersVideoCall: z.boolean().default(false),
    externalLinks: z
      .array(z.object({ label: z.string().trim().min(2).max(30), url: z.string().url().startsWith('https://') }))
      .max(8)
      .default([]),
    regionLabel: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().length(2).toUpperCase().optional(),
    country: z.string().trim().length(2).toUpperCase().default('BR'),
    // Centro da REGIÃO de atendimento escolhido no mapa — será arredondado (~1 km)
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    serviceRadiusKm: z.number().int().min(0).max(200).default(5),
    prices: z
      .array(z.object({ label: z.string().trim().min(2).max(40), durationMinutes: z.number().int().positive().optional(), priceCents: z.number().int().min(0) }))
      .max(12)
      .default([]),
  })
  .refine((a) => a.category === 'massagem' || a.massageTypes.length === 0, {
    message: 'Tipos de massagem só se aplicam à categoria Massagens',
    path: ['massageTypes'],
  })
  .refine((a) => a.whatsapp || a.telegram || a.phonePublic, { message: 'Informe ao menos um canal de contato', path: ['whatsapp'] });

type AdInput = z.infer<typeof adSchema>;

const adParams = (a: AdInput) => [
  a.title, a.description, a.category, a.gender, a.orientation,
  a.massageTypes, a.audiences, a.services, a.serviceLocations, a.amenities, a.acceptedPayments,
  a.whatsapp ?? null, a.telegram ?? null, a.phonePublic ?? null, a.offersVideoCall, JSON.stringify(a.externalLinks),
  a.regionLabel, a.city, a.state ?? null, a.country, roundCoord(a.lng), roundCoord(a.lat), a.serviceRadiusKm,
];

const AD_COLUMNS_SET = `
  title = $2, description = $3, category = $4, gender = $5, orientation = $6,
  massage_types = $7::massage_type[], audiences = $8::audience[], services = $9::service_practice[],
  service_locations = $10::service_location[], amenities = $11::amenity[], accepted_payments = $12::accepted_payment[],
  whatsapp = $13, telegram = $14, phone_public = $15, offers_video_call = $16, external_links = $17::jsonb,
  region_label = $18, city = $19, state = $20, country = $21,
  location = ST_SetSRID(ST_MakePoint($22, $23), 4326)::geography, service_radius_km = $24`;

async function replacePrices(c: Db, adId: string, prices: AdInput['prices']) {
  await c.query('DELETE FROM ad_prices WHERE ad_id = $1', [adId]);
  for (const [i, p] of prices.entries()) {
    await c.query(
      'INSERT INTO ad_prices (ad_id, label, duration_minutes, price_cents, position) VALUES ($1, $2, $3, $4, $5)',
      [adId, p.label, p.durationMinutes ?? null, p.priceCents, i],
    );
  }
}

export async function adRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------- anunciante
  app.post('/me/ads', { preHandler: app.authenticate }, async (req, reply) => {
    const a = adSchema.parse(req.body);
    const id = randomUUID();
    await tx(async (c) => {
      const { rows } = await c.query<{ n: string; max_ads: number | null }>(
        `SELECT (SELECT count(*) FROM advertisements WHERE user_id = $1 AND status <> 'removed') AS n,
                (SELECT pl.max_ads FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
                  WHERE s.user_id = $1 AND s.status IN ('trialing', 'active', 'past_due') LIMIT 1) AS max_ads`,
        [req.user.sub],
      );
      if (Number(rows[0]!.n) >= (rows[0]!.max_ads ?? 1)) throw new HttpError(422, 'ad_limit', 'Limite de anúncios do plano atingido.');
      await c.query(
        `INSERT INTO advertisements (id, user_id, slug, title, description, category, gender, orientation, location, region_label, city)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography, $11, $12)`,
        [id, req.user.sub, slugify(a.title), a.title, a.description, a.category, a.gender, a.orientation,
         roundCoord(a.lng), roundCoord(a.lat), a.regionLabel, a.city],
      );
      await c.query(`UPDATE advertisements SET ${AD_COLUMNS_SET} WHERE id = $1`, [id, ...adParams(a)]);
      await replacePrices(c, id, a.prices);
    });
    return reply.code(201).send({ id, status: 'draft' });
  });

  app.put('/me/ads/:id', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const a = adSchema.parse(req.body);
    return tx(async (c) => {
      // Edição de anúncio publicado volta para moderação
      const { rows } = await c.query(
        `UPDATE advertisements SET ${AD_COLUMNS_SET},
            status = CASE WHEN status = 'active' THEN 'pending_review'::ad_status ELSE status END
          WHERE id = $1 AND user_id = $25 AND status NOT IN ('removed', 'paused_by_admin')
          RETURNING status`,
        [id, ...adParams(a), req.user.sub],
      );
      if (!rows[0]) throw notFound('Anúncio');
      await replacePrices(c, id, a.prices);
      return { id, status: rows[0].status };
    });
  });

  /** Envia para moderação: exige identidade verificada e assinatura/degustação vigente. */
  app.post('/me/ads/:id/submit', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { rows } = await pool.query<{ is_verified: boolean; live: boolean; photos: string }>(
      `SELECT p.is_verified,
              EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = p.user_id AND s.status IN ('trialing', 'active')) AS live,
              (SELECT count(*) FROM ad_media m WHERE m.ad_id = $1 AND m.kind = 'photo' AND m.moderation <> 'rejected') AS photos
         FROM profiles p WHERE p.user_id = $2`,
      [id, req.user.sub],
    );
    const r = rows[0];
    if (!r?.is_verified) throw new HttpError(422, 'not_verified', 'Conclua a verificação de identidade antes de publicar.');
    if (!r.live) throw new HttpError(402, 'no_subscription', 'Assine um plano para publicar o anúncio.');
    if (Number(r.photos) < 1) throw new HttpError(422, 'no_photos', 'Envie ao menos uma foto.');
    const upd = await pool.query(
      `UPDATE advertisements SET status = 'pending_review'
        WHERE id = $1 AND user_id = $2 AND status IN ('draft', 'rejected', 'paused_by_user') RETURNING id`,
      [id, req.user.sub],
    );
    if (!upd.rowCount) throw new HttpError(409, 'invalid_state', 'Este anúncio não pode ser enviado agora.');
    return { id, status: 'pending_review' };
  });

  app.post('/me/ads/:id/pause', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await pool.query(
      `UPDATE advertisements SET status = 'paused_by_user' WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING id`,
      [id, req.user.sub],
    );
    if (!r.rowCount) throw new HttpError(409, 'invalid_state', 'Somente anúncios publicados podem ser pausados.');
    return { id, status: 'paused_by_user' };
  });

  app.get('/me/ads', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `SELECT id, slug, title, status, moderation_note, visible_until, created_at
         FROM advertisements WHERE user_id = $1 AND status <> 'removed' ORDER BY created_at DESC`,
      [req.user.sub],
    );
    return rows;
  });

  /** Upload de foto/vídeo: vai para quarentena privada; só aparece após varredura + moderação. */
  app.post('/me/ads/:id/media', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ kind: z.enum(['photo', 'video']) }).parse(req.body);
    const own = await pool.query('SELECT 1 FROM advertisements WHERE id = $1 AND user_id = $2', [id, req.user.sub]);
    if (!own.rowCount) throw notFound('Anúncio');

    const key = `quarantine/${req.user.sub}/${id}/${randomUUID()}`;
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO ad_media (ad_id, user_id, kind, storage_key, mime_type) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [id, req.user.sub, b.kind, key, b.kind === 'photo' ? 'image/*' : 'video/*'],
    );
    const upload = await presignUpload({
      key,
      contentTypePrefix: b.kind === 'photo' ? 'image/' : 'video/',
      maxBytes: b.kind === 'photo' ? 20 * MB : 300 * MB,
    });
    return reply.code(201).send({ mediaId: ins.rows[0]!.id, upload });
  });

  app.post('/me/media/:id/complete', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { rows } = await pool.query<{ storage_key: string }>(
      'SELECT storage_key FROM ad_media WHERE id = $1 AND user_id = $2 AND safety_scan_status = $3',
      [id, req.user.sub, 'pending'],
    );
    if (!rows[0]) throw notFound('Mídia');
    const head = await headPrivate(rows[0].storage_key);
    if (!head) throw new HttpError(400, 'missing_upload', 'Arquivo não encontrado.');
    await pool.query('UPDATE ad_media SET size_bytes = $2, mime_type = $3 WHERE id = $1', [id, head.size, head.contentType]);
    await queues.media.add('scan', { kind: 'ad_media', mediaId: id }, { jobId: `media-${id}` });
    return { id, status: 'scanning' };
  });

  // ---------------------------------------------------------------- público
  app.get('/ads/:slug', async (req, reply) => {
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const { rows } = await pool.query(
      `SELECT a.id, a.slug, a.title, a.description, a.category, a.gender, a.orientation,
              -- arrays de ENUM viram text[] para o driver pg devolver listas JSON (e não "{a,b}")
              a.massage_types::text[] AS massage_types, a.audiences::text[] AS audiences, a.services::text[] AS services,
              a.service_locations::text[] AS service_locations, a.amenities::text[] AS amenities,
              a.accepted_payments::text[] AS accepted_payments,
              a.whatsapp, a.telegram, a.phone_public, a.offers_video_call, a.external_links,
              a.region_label, a.city, a.state, a.service_radius_km,
              ST_Y(a.location::geometry) AS lat, ST_X(a.location::geometry) AS lng,
              p.display_name, p.is_verified, p.verified_at,
              date_part('year', age(p.birth_date))::int AS age,
              vv.public_url AS verification_video_url,
              COALESCE((SELECT json_agg(json_build_object('label', label, 'durationMinutes', duration_minutes, 'priceCents', price_cents) ORDER BY position)
                          FROM ad_prices WHERE ad_id = a.id), '[]') AS prices,
              COALESCE((SELECT json_agg(json_build_object('id', m.id, 'kind', m.kind, 'url', m.public_url, 'width', m.width, 'height', m.height) ORDER BY m.position)
                          FROM ad_media m WHERE m.ad_id = a.id AND m.moderation = 'approved' AND m.kind <> 'verification_video'), '[]') AS media
         FROM advertisements a
         JOIN profiles p ON p.user_id = a.user_id
         JOIN users u ON u.id = a.user_id AND u.status = 'active'
         LEFT JOIN ad_media vv ON vv.id = p.verification_video_media_id AND vv.moderation = 'approved'
        WHERE a.slug = $1 AND a.status = 'active' AND a.visible_until > now()`,
      [slug],
    );
    if (!rows[0]) throw notFound('Anúncio');
    reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return rows[0];
  });

  /** Denúncia pública — sem login. "menor_de_idade" e "trafico_coercao" pausam o anúncio na hora. */
  app.post('/ads/:id/report', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z
      .object({
        reason: z.enum(['menor_de_idade', 'perfil_falso', 'golpe', 'trafico_coercao', 'conteudo_sem_consentimento', 'outro']),
        details: z.string().trim().max(2000).optional(),
      })
      .parse(req.body);
    await tx(async (c) => {
      await c.query('INSERT INTO reports (ad_id, reason, details, reporter_ip) VALUES ($1, $2, $3, $4)', [id, b.reason, b.details ?? null, req.ip]);
      if (['menor_de_idade', 'trafico_coercao', 'conteudo_sem_consentimento'].includes(b.reason)) {
        await c.query(
          `UPDATE advertisements SET status = 'paused_by_admin', moderation_note = 'Pausado automaticamente por denúncia grave'
            WHERE id = $1 AND status = 'active'`,
          [id],
        );
      }
    });
    return reply.code(202).send({ received: true });
  });
}
