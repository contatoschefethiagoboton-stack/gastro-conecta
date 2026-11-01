/**
 * Auditoria, antifraude e atendimento a autoridades.
 *
 * Requisições de autoridades seguem o Marco Civil da Internet (Lei 12.965/2014):
 *  - "dados_cadastrais" (qualificação pessoal, filiação, endereço): podem ser
 *    requisitados por autoridade administrativa competente (art. 10, §3º);
 *  - "completo" (registros de acesso, conteúdo, documentos): somente com ordem judicial.
 * Fluxo de quatro olhos: um admin registra, OUTRO aprova; só então os dados são decifrados.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, tx } from '../../db/pool.js';
import { logAdmin, logPrivateAccess } from '../../lib/audit.js';
import { blindIndex, decrypt } from '../../lib/crypto.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { headPrivate, MB, presignPrivateGet, presignUpload } from '../../lib/storage.js';
import { onlyDigits } from '../../lib/validators.js';

const idParam = z.object({ id: z.string().uuid() });

export async function complianceRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') };
  const staff = { preHandler: app.requireRole('moderator', 'admin') };

  // --------------------------------------------------------------- busca de contas
  /** Busca por e-mail, nome artístico ou CPF exato (via blind index — sem decifrar a base). */
  app.get('/admin/users', adminOnly, async (req) => {
    const q = z.object({ q: z.string().trim().min(3).max(100) }).parse(req.query);
    const digits = onlyDigits(q.q);
    const byCpf = digits.length === 11 ? blindIndex(digits, 'cpf') : null;
    if (byCpf) await logAdmin(pool, req, { action: 'user.search_cpf', targetType: 'search', targetId: 'cpf' });
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.status, u.created_at, p.display_name, p.is_verified
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN advertiser_private_data pd ON pd.user_id = u.id
        WHERE u.email ILIKE $1 OR p.display_name ILIKE $1 OR ($2::bytea IS NOT NULL AND pd.cpf_hash = $2)
        ORDER BY u.created_at DESC LIMIT 50`,
      [`%${q.q.replace(/[%_]/g, '')}%`, byCpf],
    );
    return rows;
  });

  // --------------------------------------------------------------- sinais de fraude
  app.get('/admin/fraud/signals', staff, async () => {
    const [flags, sharedPhone, duplicatedMedia, sharedIp, chargebacks] = await Promise.all([
      pool.query(`SELECT f.*, p.display_name FROM fraud_flags f LEFT JOIN profiles p ON p.user_id = f.user_id
                   WHERE f.status = 'open' ORDER BY (f.severity = 'critical') DESC, (f.severity = 'high') DESC, f.created_at DESC LIMIT 200`),
      // mesmo telefone pessoal em contas diferentes
      pool.query(`SELECT encode(phone_hash, 'hex') AS phone_hash, array_agg(user_id) AS users, count(*)::int AS n
                    FROM advertiser_private_data GROUP BY phone_hash HAVING count(*) > 1 ORDER BY n DESC LIMIT 100`),
      // a mesma foto/vídeo (byte a byte) publicada por contas diferentes → perfil falso / foto roubada
      pool.query(`SELECT encode(sha256, 'hex') AS sha256, array_agg(DISTINCT user_id) AS users, count(DISTINCT user_id)::int AS n
                    FROM ad_media WHERE sha256 IS NOT NULL GROUP BY sha256 HAVING count(DISTINCT user_id) > 1 ORDER BY n DESC LIMIT 100`),
      // muitas contas logando do mesmo IP em 7 dias
      pool.query(`SELECT host(ip) AS ip, count(DISTINCT user_id)::int AS accounts
                    FROM auth_events WHERE success AND created_at > now() - interval '7 days' AND user_id IS NOT NULL
                   GROUP BY ip HAVING count(DISTINCT user_id) >= 3 ORDER BY accounts DESC LIMIT 100`),
      pool.query(`SELECT user_id, count(*)::int AS chargebacks FROM payments WHERE status = 'chargeback'
                   GROUP BY user_id HAVING count(*) >= 1 ORDER BY chargebacks DESC LIMIT 100`),
    ]);
    return {
      flags: flags.rows,
      sharedPhone: sharedPhone.rows,
      duplicatedMedia: duplicatedMedia.rows,
      sharedIp: sharedIp.rows,
      chargebacks: chargebacks.rows,
    };
  });

  /** Fotos visualmente parecidas (dHash, distância de Hamming ≤ 6) entre contas diferentes. */
  app.get('/admin/fraud/similar-media/:id', staff, async (req) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query(
      `SELECT o.id, o.user_id, o.ad_id, o.public_url,
              bit_count((m.phash # o.phash)::bit(64))::int AS distance
         FROM ad_media m JOIN ad_media o ON o.user_id <> m.user_id AND o.phash IS NOT NULL
        WHERE m.id = $1 AND m.phash IS NOT NULL AND bit_count((m.phash # o.phash)::bit(64)) <= 6
        ORDER BY distance LIMIT 50`,
      [id],
    );
    return rows;
  });

  app.post('/admin/fraud/flags/:id/resolve', staff, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const b = z.object({ status: z.enum(['resolved', 'false_positive']), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    await tx(async (c) => {
      await c.query('UPDATE fraud_flags SET status = $2 WHERE id = $1', [id, b.status]);
      await logAdmin(c, req, { action: 'fraud.resolve', targetType: 'fraud_flag', targetId: String(id), after: { status: b.status }, reason: b.reason });
    });
    return { id, status: b.status };
  });

  // --------------------------------------------------------------- logs de auditoria
  app.get('/admin/logs', adminOnly, async (req) => {
    const q = z
      .object({
        targetType: z.string().max(40).optional(),
        targetId: z.string().max(80).optional(),
        adminId: z.string().uuid().optional(),
        beforeId: z.coerce.number().int().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);
    const { rows } = await pool.query(
      `SELECT id, admin_id, action, target_type, target_id, before_state, after_state, reason, host(ip) AS ip, created_at,
              encode(row_hash, 'hex') AS row_hash
         FROM admin_logs
        WHERE ($1::text IS NULL OR target_type = $1) AND ($2::text IS NULL OR target_id = $2)
          AND ($3::uuid IS NULL OR admin_id = $3) AND ($4::bigint IS NULL OR id < $4)
        ORDER BY id DESC LIMIT $5`,
      [q.targetType ?? null, q.targetId ?? null, q.adminId ?? null, q.beforeId ?? null, q.limit],
    );
    return rows;
  });

  /** Recalcula a cadeia de hash inteira; aponta o 1º registro adulterado. */
  app.get('/admin/logs/verify', adminOnly, async () => {
    const { rows } = await pool.query<{ broken: string | null }>('SELECT admin_logs_verify() AS broken');
    return { intact: rows[0]!.broken === null, firstBrokenId: rows[0]!.broken };
  });

  // --------------------------------------------------------------- requisições de autoridades
  app.post('/admin/legal-requests/upload', adminOnly, async () => {
    const key = `legal/${randomUUID()}`;
    return { key, upload: await presignUpload({ key, contentTypePrefix: 'application/pdf', maxBytes: 20 * MB }) };
  });

  app.post('/admin/legal-requests', adminOnly, async (req, reply) => {
    const b = z
      .object({
        targetUserId: z.string().uuid(),
        authority: z.string().trim().min(3).max(200),
        processNumber: z.string().trim().min(3).max(100),
        scope: z.enum(['dados_cadastrais', 'completo']),
        documentKey: z.string().min(10), // ofício/ordem enviada ao bucket privado (legal/...)
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(req.body);
    if (!b.documentKey.startsWith('legal/') || !(await headPrivate(b.documentKey))) {
      throw new HttpError(400, 'missing_document', 'Anexe o ofício ou a ordem judicial.');
    }
    const row = await tx(async (c) => {
      const r = (
        await c.query(
          `INSERT INTO legal_requests (target_user_id, authority, process_number, scope, document_key, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, status`,
          [b.targetUserId, b.authority, b.processNumber, b.scope, b.documentKey, b.notes ?? null, req.user.sub],
        )
      ).rows[0];
      await logAdmin(c, req, { action: 'legal.create', targetType: 'legal_request', targetId: r.id, after: { ...b, documentKey: undefined } });
      return r;
    });
    return reply.code(201).send(row);
  });

  app.post('/admin/legal-requests/:id/review', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    return tx(async (c) => {
      const r = (await c.query('SELECT * FROM legal_requests WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!r) throw notFound('Requisição');
      if (r.status !== 'received') throw new HttpError(409, 'invalid_state', 'Requisição já revisada.');
      if (r.created_by === req.user.sub) throw new HttpError(403, 'four_eyes', 'A aprovação deve ser feita por outro administrador.');
      await c.query(
        `UPDATE legal_requests SET status = $2, approved_by = $3, approved_at = now() WHERE id = $1`,
        [id, b.decision === 'approve' ? 'approved' : 'rejected', req.user.sub],
      );
      await logAdmin(c, req, { action: `legal.${b.decision}`, targetType: 'legal_request', targetId: id, reason: b.reason });
      return { id, status: b.decision === 'approve' ? 'approved' : 'rejected' };
    });
  });

  /** Exporta os dados sigilosos — só após aprovação. Decifra, registra e encerra a requisição. */
  app.get('/admin/legal-requests/:id/export', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const out = await tx(async (c) => {
      const r = (await c.query('SELECT * FROM legal_requests WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!r) throw notFound('Requisição');
      if (r.status !== 'approved') throw new HttpError(403, 'not_approved', 'Requisição não aprovada.');
      const uid = r.target_user_id as string;
      const pd = (await c.query('SELECT * FROM advertiser_private_data WHERE user_id = $1', [uid])).rows[0];
      if (!pd) throw notFound('Dados do anunciante');

      const cadastrais = {
        nomeCompleto: decrypt(pd.full_name_enc, uid),
        cpf: decrypt(pd.cpf_enc, uid),
        rg: decrypt(pd.rg_enc, uid),
        telefone: decrypt(pd.phone_enc, uid),
        cep: decrypt(pd.cep_enc, uid),
        endereco: JSON.parse(decrypt(pd.address_enc, uid)),
      };
      const fields = Object.keys(cadastrais);
      let completo: Record<string, unknown> | undefined;

      if (r.scope === 'completo') {
        const account = (await c.query('SELECT email, created_at, last_login_at, host(last_login_ip) AS last_login_ip FROM users WHERE id = $1', [uid])).rows[0];
        const accessLogs = (
          await c.query(`SELECT host(ip) AS ip, user_agent, success, created_at FROM auth_events WHERE user_id = $1 AND created_at > now() - interval '6 months' ORDER BY created_at`, [uid])
        ).rows;
        const kyc = (await c.query(`SELECT * FROM identity_verifications WHERE user_id = $1 AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1`, [uid])).rows[0];
        completo = {
          conta: account,
          registrosDeAcesso: accessLogs, // Marco Civil art. 15: 6 meses
          documentosKyc: kyc
            ? {
                documentoFrente: await presignPrivateGet(kyc.document_front_key, 3600),
                documentoVerso: kyc.document_back_key ? await presignPrivateGet(kyc.document_back_key, 3600) : null,
                selfie: await presignPrivateGet(kyc.selfie_key, 3600),
                video: await presignPrivateGet(kyc.video_key, 3600),
              }
            : null,
        };
        fields.push('email', 'registros_acesso', 'documentos_kyc');
      }

      await logPrivateAccess(c, req, uid, fields, `requisicao_legal:${r.process_number}`, id);
      await c.query(`UPDATE legal_requests SET status = 'fulfilled', fulfilled_at = now() WHERE id = $1`, [id]);
      await logAdmin(c, req, { action: 'legal.export', targetType: 'legal_request', targetId: id, after: { fields } });
      return { requisicao: { id, autoridade: r.authority, processo: r.process_number, escopo: r.scope }, dadosCadastrais: cadastrais, ...completo };
    });
    reply.header('Cache-Control', 'no-store');
    return out;
  });
}
