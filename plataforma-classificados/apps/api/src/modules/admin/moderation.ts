/**
 * Moderação: aprovar, editar, pausar e excluir perfis, anúncios, fotos, vídeos,
 * verificações de identidade e conteúdo PPV. Toda ação gera admin_logs.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, tx } from '../../db/pool.js';
import { logAdmin, logPrivateAccess } from '../../lib/audit.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { queues } from '../../lib/queues.js';
import { deletePublic, presignPrivateGet, publishPrivateObject } from '../../lib/storage.js';

const idParam = z.object({ id: z.string().uuid() });
const decisionSchema = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).optional() });
const extOf = (mime: string) => (mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.startsWith('video/') ? 'mp4' : 'jpg');

export async function moderationRoutes(app: FastifyInstance) {
  const staff = { preHandler: app.requireRole('moderator', 'admin') };
  const adminOnly = { preHandler: app.requireRole('admin') };

  // --------------------------------------------------------------- filas
  app.get('/admin/queue/:type', staff, async (req) => {
    const { type } = z.object({ type: z.enum(['verifications', 'ads', 'media', 'ppv', 'reports']) }).parse(req.params);
    const sql: Record<typeof type, string> = {
      verifications: `SELECT iv.id, iv.user_id, p.display_name, iv.document_type, iv.face_match_score, iv.liveness_score,
                             iv.document_authentic, iv.document_cpf_matches, iv.challenge_detected, iv.auto_decision,
                             iv.auto_reasons, iv.submitted_at
                        FROM identity_verifications iv JOIN profiles p ON p.user_id = iv.user_id
                       WHERE iv.status = 'pending_review' ORDER BY iv.submitted_at LIMIT 100`,
      ads: `SELECT a.id, a.slug, a.title, a.category, a.gender, a.city, a.region_label, a.created_at, a.updated_at, p.display_name
              FROM advertisements a JOIN profiles p ON p.user_id = a.user_id
             WHERE a.status = 'pending_review' ORDER BY a.updated_at LIMIT 100`,
      media: `SELECT m.id, m.ad_id, m.user_id, m.kind, m.mime_type, m.width, m.height, m.created_at, m.storage_key
                FROM ad_media m WHERE m.moderation = 'pending' AND m.safety_scan_status = 'clean'
               ORDER BY m.created_at LIMIT 100`,
      ppv: `SELECT i.id, i.user_id, i.title, i.kind, i.price_cents, i.view_mode, i.media_key, i.created_at
              FROM ppv_items i WHERE i.moderation = 'pending' ORDER BY i.created_at LIMIT 100`,
      reports: `SELECT r.*, a.slug, a.title FROM reports r JOIN advertisements a ON a.id = r.ad_id
                 WHERE r.status IN ('open', 'investigating')
                 ORDER BY (r.reason IN ('menor_de_idade', 'trafico_coercao')) DESC, r.created_at LIMIT 100`,
    };
    const { rows } = await pool.query(sql[type]);
    // Mídias privadas: URL temporária de 5 min apenas para o moderador
    if (type === 'media' || type === 'ppv') {
      for (const r of rows) {
        r.preview_url = await presignPrivateGet(r.storage_key ?? r.media_key);
        delete r.storage_key;
        delete r.media_key;
      }
    }
    return rows;
  });

  // --------------------------------------------------------------- verificação de identidade
  app.get('/admin/verifications/:id', staff, async (req) => {
    const { id } = idParam.parse(req.params);
    const v = (await pool.query('SELECT * FROM identity_verifications WHERE id = $1', [id])).rows[0];
    if (!v) throw notFound('Verificação');
    // Ver documento é acesso a dado sigiloso → registrado
    await logPrivateAccess(pool, req, v.user_id, ['documento', 'selfie', 'video_kyc'], 'moderacao_kyc');
    const sign = (k: string | null) => (k ? presignPrivateGet(k) : null);
    return {
      ...v,
      document_front_key: undefined, document_back_key: undefined, selfie_key: undefined, video_key: undefined,
      files: {
        documentFront: await sign(v.document_front_key),
        documentBack: await sign(v.document_back_key),
        selfie: await sign(v.selfie_key),
        video: await sign(v.video_key),
      },
    };
  });

  app.post('/admin/verifications/:id/decision', staff, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = decisionSchema.parse(req.body);
    return tx(async (c) => {
      const v = (await c.query('SELECT * FROM identity_verifications WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!v || v.status !== 'pending_review') throw new HttpError(409, 'invalid_state', 'Verificação não está em revisão.');
      if (b.decision === 'approve' && v.auto_decision === 'hard_reject') throw new HttpError(422, 'hard_reject', 'Bloqueio automático não pode ser aprovado.');

      if (b.decision === 'reject') {
        await c.query(
          `UPDATE identity_verifications SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), rejection_reason = $3 WHERE id = $1`,
          [id, req.user.sub, b.reason ?? 'Reprovado na revisão'],
        );
      } else {
        // Publica o vídeo de verificação no anúncio (requisito: prova pública de perfil real)
        const publicKey = `verification/${v.user_id}/${id}.mp4`;
        const url = await publishPrivateObject(v.video_key, publicKey);
        const media = await c.query<{ id: string }>(
          `INSERT INTO ad_media (user_id, kind, storage_key, public_key, public_url, mime_type, safety_scan_status, moderation, moderated_by, moderated_at)
           VALUES ($1, 'verification_video', $2, $3, $4, 'video/mp4', 'clean', 'approved', $5, now()) RETURNING id`,
          [v.user_id, v.video_key, publicKey, url, req.user.sub],
        );
        await c.query(`UPDATE identity_verifications SET status = 'approved', reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [id, req.user.sub]);
        await c.query(
          `UPDATE profiles SET is_verified = true, verified_at = now(), verification_video_media_id = $2,
                  birth_date = COALESCE($3, birth_date)
            WHERE user_id = $1`,
          [v.user_id, media.rows[0]!.id, v.document_birth_date],
        );
        await c.query(`UPDATE users SET status = 'active' WHERE id = $1 AND status = 'pending_verification'`, [v.user_id]);
      }
      await logAdmin(c, req, { action: `kyc.${b.decision}`, targetType: 'identity_verification', targetId: id, reason: b.reason });
      await queues.notifications.add('kyc', { type: 'kyc.result', userId: v.user_id, approved: b.decision === 'approve' });
      return { id, status: b.decision === 'approve' ? 'approved' : 'rejected' };
    });
  });

  // --------------------------------------------------------------- anúncios
  app.post('/admin/ads/:id/status', staff, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z
      .object({ status: z.enum(['active', 'paused_by_admin', 'rejected', 'removed']), reason: z.string().trim().max(500).optional() })
      .parse(req.body);
    return tx(async (c) => {
      const before = (await c.query('SELECT id, user_id, status, moderation_note FROM advertisements WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!before) throw notFound('Anúncio');
      let visibleUntil: Date | null = null;
      if (b.status === 'active') {
        const r = (
          await c.query(
            `SELECT p.is_verified,
                    (SELECT COALESCE(current_period_end, trial_ends_at) FROM subscriptions
                      WHERE user_id = $1 AND status IN ('trialing', 'active', 'past_due') LIMIT 1) AS until
               FROM profiles p WHERE p.user_id = $1`,
            [before.user_id],
          )
        ).rows[0];
        if (!r?.is_verified) throw new HttpError(422, 'not_verified', 'Anunciante sem identidade verificada.');
        if (!r.until) throw new HttpError(422, 'no_subscription', 'Anunciante sem assinatura ou degustação vigente.');
        visibleUntil = r.until;
      }
      const after = (
        await c.query(
          `UPDATE advertisements SET status = $2::ad_status, moderation_note = $3,
                  published_at = CASE WHEN $2::ad_status = 'active' THEN COALESCE(published_at, now()) ELSE published_at END,
                  visible_until = COALESCE($4::timestamptz, visible_until)
            WHERE id = $1 RETURNING id, status, moderation_note`,
          [id, b.status, b.reason ?? null, visibleUntil],
        )
      ).rows[0];
      await logAdmin(c, req, { action: 'ad.status', targetType: 'advertisement', targetId: id, before, after, reason: b.reason });
      return after;
    });
  });

  /** Edição pelo moderador (ex.: remover telefone no texto, corrigir região). */
  app.patch('/admin/ads/:id', staff, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z
      .object({
        title: z.string().trim().min(5).max(120).optional(),
        description: z.string().trim().min(20).max(5000).optional(),
        regionLabel: z.string().trim().min(2).max(80).optional(),
        city: z.string().trim().min(2).max(80).optional(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(req.body);
    return tx(async (c) => {
      const before = (await c.query('SELECT title, description, region_label, city FROM advertisements WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!before) throw notFound('Anúncio');
      const after = (
        await c.query(
          `UPDATE advertisements SET title = COALESCE($2, title), description = COALESCE($3, description),
                  region_label = COALESCE($4, region_label), city = COALESCE($5, city)
            WHERE id = $1 RETURNING title, description, region_label, city`,
          [id, b.title ?? null, b.description ?? null, b.regionLabel ?? null, b.city ?? null],
        )
      ).rows[0];
      await logAdmin(c, req, { action: 'ad.edit', targetType: 'advertisement', targetId: id, before, after, reason: b.reason });
      return after;
    });
  });

  // --------------------------------------------------------------- mídia
  app.post('/admin/media/:id/decision', staff, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = decisionSchema.parse(req.body);
    return tx(async (c) => {
      const m = (await c.query('SELECT * FROM ad_media WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!m) throw notFound('Mídia');
      if (m.safety_scan_status !== 'clean') throw new HttpError(422, 'not_scanned', 'Mídia sem varredura de segurança concluída.');
      let publicUrl: string | null = null;
      let publicKey: string | null = null;
      if (b.decision === 'approve') {
        publicKey = `media/${m.user_id}/${m.id}.${extOf(m.mime_type)}`;
        publicUrl = await publishPrivateObject(m.storage_key, publicKey);
      }
      await c.query(
        `UPDATE ad_media SET moderation = $2, public_key = $3, public_url = $4, moderated_by = $5, moderated_at = now(), rejection_reason = $6
          WHERE id = $1`,
        [id, b.decision === 'approve' ? 'approved' : 'rejected', publicKey, publicUrl, req.user.sub, b.reason ?? null],
      );
      await logAdmin(c, req, { action: `media.${b.decision}`, targetType: 'ad_media', targetId: id, reason: b.reason });
      return { id, moderation: b.decision === 'approve' ? 'approved' : 'rejected', publicUrl };
    });
  });

  app.delete('/admin/media/:id', staff, async (req) => {
    const { id } = idParam.parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.query);
    return tx(async (c) => {
      const m = (await c.query('SELECT id, public_key, moderation FROM ad_media WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!m) throw notFound('Mídia');
      if (m.public_key) await deletePublic(m.public_key);
      await c.query(`UPDATE ad_media SET moderation = 'rejected', public_url = NULL, public_key = NULL, rejection_reason = $2 WHERE id = $1`, [id, reason]);
      await logAdmin(c, req, { action: 'media.delete', targetType: 'ad_media', targetId: id, before: m, reason });
      return { id, deleted: true };
    });
  });

  app.post('/admin/ppv/:id/decision', staff, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = decisionSchema.parse(req.body);
    await tx(async (c) => {
      const r = await c.query(`UPDATE ppv_items SET moderation = $2 WHERE id = $1 AND moderation = 'pending' RETURNING id`, [
        id, b.decision === 'approve' ? 'approved' : 'rejected',
      ]);
      if (!r.rowCount) throw new HttpError(409, 'invalid_state', 'Item não está pendente.');
      await logAdmin(c, req, { action: `ppv.${b.decision}`, targetType: 'ppv_item', targetId: id, reason: b.reason });
    });
    return { id, moderation: b.decision };
  });

  // --------------------------------------------------------------- perfis / contas
  app.post('/admin/users/:id/status', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ status: z.enum(['active', 'suspended', 'banned']), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    return tx(async (c) => {
      const before = (await c.query('SELECT id, status FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!before) throw notFound('Usuário');
      await c.query('UPDATE users SET status = $2 WHERE id = $1', [id, b.status]);
      if (b.status !== 'active') {
        await c.query(`UPDATE advertisements SET status = 'paused_by_admin' WHERE user_id = $1 AND status IN ('active', 'pending_review')`, [id]);
      }
      await logAdmin(c, req, { action: 'user.status', targetType: 'user', targetId: id, before, after: { status: b.status }, reason: b.reason });
      return { id, status: b.status };
    });
  });

  app.post('/admin/reports/:id/resolve', staff, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ status: z.enum(['investigating', 'resolved', 'dismissed']), reason: z.string().trim().max(500).optional() }).parse(req.body);
    await tx(async (c) => {
      await c.query('UPDATE reports SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1', [id, b.status, req.user.sub]);
      await logAdmin(c, req, { action: 'report.resolve', targetType: 'report', targetId: id, after: { status: b.status }, reason: b.reason });
    });
    return { id, status: b.status };
  });
}
