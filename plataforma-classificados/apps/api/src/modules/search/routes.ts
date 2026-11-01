/**
 * Busca pública com geolocalização (PostGIS) + filtros avançados.
 *
 * Desempenho:
 *  - ST_DWithin em geography usa o índice GiST parcial (somente anúncios ativos).
 *  - Filtros de array usam índices GIN (&& = "qualquer um", @> = "todos").
 *  - Paginação por cursor (keyset): custo constante em qualquer página.
 *  - Cache Redis de 30 s por combinação de filtros (tráfego anônimo é altamente repetitivo).
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { redis } from '../../lib/redis.js';
import {
  ACCEPTED_PAYMENTS, AGE_RANGE, AMENITIES, AUDIENCES, CATEGORIES, GENDERS, MASSAGE_TYPES,
  ORIENTATIONS, RADIUS_KM, SERVICE_LOCATIONS, SERVICES,
} from '../taxonomy.js';

/** Aceita "a,b,c" ou ?x=a&x=b */
const list = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? [] : (Array.isArray(v) ? v : v.split(',')).filter(Boolean)))
    .pipe(z.array(z.enum(values)));

export const searchSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(RADIUS_KM.min).max(RADIUS_KM.max).default(RADIUS_KM.default),
    q: z.string().trim().max(100).optional(),
    category: z.enum(CATEGORIES).optional(),
    gender: list(GENDERS),
    orientation: list(ORIENTATIONS),
    massageTypes: list(MASSAGE_TYPES),
    audiences: list(AUDIENCES),
    services: list(SERVICES),
    serviceLocations: list(SERVICE_LOCATIONS),
    amenities: list(AMENITIES),
    acceptedPayments: list(ACCEPTED_PAYMENTS),
    ageMin: z.coerce.number().int().min(AGE_RANGE.min).max(AGE_RANGE.max).default(AGE_RANGE.min),
    ageMax: z.coerce.number().int().min(AGE_RANGE.min).max(AGE_RANGE.max).default(AGE_RANGE.max),
    videoCall: z.enum(['true', 'false']).optional(),
    hasPpv: z.enum(['true', 'false']).optional(),
    priceMaxCents: z.coerce.number().int().positive().optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(60).default(24),
  })
  .refine((s) => (s.lat === undefined) === (s.lng === undefined), { message: 'Informe lat e lng juntos' })
  .refine((s) => s.ageMin <= s.ageMax, { message: 'Faixa etária inválida' });

type Search = z.infer<typeof searchSchema>;
type Cursor = { d?: number; t?: string; id: string };

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
const decodeCursor = (s?: string): Cursor | null => {
  if (!s) return null;
  try {
    return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Cursor;
  } catch {
    return null;
  }
};

export function buildSearchQuery(s: Search): { sql: string; params: unknown[]; geo: boolean } {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  const where = [
    `a.status = 'active'`,
    `a.visible_until > now()`,
    `p.is_verified`,
    `u.status = 'active'`,
    // Faixa etária em forma "sargável" (comparação direta com birth_date)
    `p.birth_date <= (current_date - make_interval(years => ${p(s.ageMin)}))`,
    `p.birth_date >  (current_date - make_interval(years => ${p(s.ageMax + 1)}))`,
  ];

  if (s.category) where.push(`a.category = ${p(s.category)}`);
  if (s.gender.length) where.push(`a.gender = ANY(${p(s.gender)}::ad_gender[])`);
  if (s.orientation.length) where.push(`a.orientation = ANY(${p(s.orientation)}::orientation[])`);
  // "qualquer um dos selecionados"
  if (s.massageTypes.length) where.push(`a.massage_types && ${p(s.massageTypes)}::massage_type[]`);
  if (s.serviceLocations.length) where.push(`a.service_locations && ${p(s.serviceLocations)}::service_location[]`);
  if (s.acceptedPayments.length) where.push(`a.accepted_payments && ${p(s.acceptedPayments)}::accepted_payment[]`);
  // "todos os selecionados"
  if (s.audiences.length) where.push(`a.audiences @> ${p(s.audiences)}::audience[]`);
  if (s.services.length) where.push(`a.services @> ${p(s.services)}::service_practice[]`);
  if (s.amenities.length) where.push(`a.amenities @> ${p(s.amenities)}::amenity[]`);
  if (s.videoCall === 'true') where.push('a.offers_video_call');
  if (s.q) where.push(`a.search_vector @@ websearch_to_tsquery('pt_unaccent', ${p(s.q)})`);
  if (s.hasPpv === 'true') {
    where.push(`EXISTS (SELECT 1 FROM ppv_items i WHERE i.ad_id = a.id AND i.moderation = 'approved' AND i.is_active)`);
  }
  if (s.priceMaxCents) {
    where.push(`EXISTS (SELECT 1 FROM ad_prices pr WHERE pr.ad_id = a.id AND pr.price_cents <= ${p(s.priceMaxCents)})`);
  }

  const geo = s.lat !== undefined && s.lng !== undefined;
  const cursor = decodeCursor(s.cursor);
  let distance = 'NULL::float8';
  let order: string;

  if (geo) {
    const point = `ST_SetSRID(ST_MakePoint(${p(s.lng)}, ${p(s.lat)}), 4326)::geography`;
    distance = `ST_Distance(a.location, ${point}) / 1000.0`;
    where.push(`ST_DWithin(a.location, ${point}, ${p(s.radiusKm * 1000)})`);
    if (cursor?.d !== undefined) where.push(`(${distance}, a.id) > (${p(cursor.d)}::float8, ${p(cursor.id)}::uuid)`);
    order = 'distance_km ASC, a.id ASC';
  } else {
    if (cursor?.t) where.push(`(a.published_at, a.id) < (${p(cursor.t)}::timestamptz, ${p(cursor.id)}::uuid)`);
    order = 'a.published_at DESC, a.id DESC';
  }

  const sql = `
    SELECT a.id, a.slug, a.title, a.category, a.gender, a.region_label, a.city, a.state,
           a.offers_video_call, a.service_radius_km, a.published_at,
           ST_Y(a.location::geometry) AS lat, ST_X(a.location::geometry) AS lng,
           ${distance} AS distance_km,
           p.display_name, date_part('year', age(p.birth_date))::int AS age,
           (SELECT min(price_cents) FROM ad_prices pr WHERE pr.ad_id = a.id) AS price_from_cents,
           (SELECT m.public_url FROM ad_media m
             WHERE m.ad_id = a.id AND m.kind = 'photo' AND m.moderation = 'approved'
             ORDER BY m.position LIMIT 1) AS cover_url
      FROM advertisements a
      JOIN profiles p ON p.user_id = a.user_id
      JOIN users u    ON u.id = a.user_id
     WHERE ${where.join('\n       AND ')}
     ORDER BY ${order}
     LIMIT ${p(s.limit + 1)}`;

  return { sql, params, geo };
}

export async function searchRoutes(app: FastifyInstance) {
  app.get('/search', async (req, reply) => {
    const s = searchSchema.parse(req.query);
    const cacheKey = `search:${createHash('sha1').update(JSON.stringify(s)).digest('hex')}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    reply.header('Cache-Control', 'public, max-age=30');
    if (cached) return reply.type('application/json').send(cached);

    const { sql, params, geo } = buildSearchQuery(s);
    const { rows } = await pool.query(sql, params);
    const hasMore = rows.length > s.limit;
    const items = rows.slice(0, s.limit).map((r) => ({
      ...r,
      distance_km: r.distance_km === null ? null : Math.round(Number(r.distance_km) * 10) / 10,
    }));
    const last = rows[s.limit - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor(geo ? { d: Number(last.distance_km), id: last.id } : { t: new Date(last.published_at).toISOString(), id: last.id })
        : null;

    const body = JSON.stringify({ items, nextCursor });
    await redis.set(cacheKey, body, 'EX', 30).catch(() => undefined);
    return reply.type('application/json').send(body);
  });
}
