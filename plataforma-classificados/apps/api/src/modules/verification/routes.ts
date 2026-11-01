import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { HttpError } from '../../lib/errors.js';
import { queues } from '../../lib/queues.js';
import { headPrivate, MB, presignUpload } from '../../lib/storage.js';
import { generateChallenge } from './service.js';

const PARTS = {
  document_front: { prefix: 'image/', max: 15 * MB },
  document_back: { prefix: 'image/', max: 15 * MB },
  selfie: { prefix: 'image/', max: 15 * MB },
  video: { prefix: 'video/', max: 100 * MB },
} as const;

const submitSchema = z.object({
  verificationId: z.string().uuid(),
  documentType: z.enum(['rg', 'cnh', 'passport']),
  documentFrontKey: z.string().min(10),
  documentBackKey: z.string().min(10).optional(),
  selfieKey: z.string().min(10),
  videoKey: z.string().min(10),
});

export async function verificationRoutes(app: FastifyInstance) {
  app.post('/me/verification/start', { preHandler: app.authenticate }, async (req) => {
    const userId = req.user.sub;
    const open = await pool.query<{ id: string; status: string; challenge_code: string }>(
      `SELECT id, status, challenge_code FROM identity_verifications
        WHERE user_id = $1 AND status IN ('awaiting_upload', 'processing', 'pending_review')`,
      [userId],
    );
    let v = open.rows[0];
    if (v && v.status !== 'awaiting_upload') {
      throw new HttpError(409, 'verification_in_progress', 'Sua verificação já foi enviada e está em análise.');
    }
    if (!v) {
      const ins = await pool.query<{ id: string; status: string; challenge_code: string }>(
        `INSERT INTO identity_verifications (user_id, challenge_code) VALUES ($1, $2)
         RETURNING id, status, challenge_code`,
        [userId, generateChallenge()],
      );
      v = ins.rows[0]!;
    }

    const uploads: Record<string, unknown> = {};
    for (const [part, rule] of Object.entries(PARTS)) {
      const key = `kyc/${userId}/${v.id}/${part}-${randomUUID()}`;
      uploads[part] = { key, ...(await presignUpload({ key, contentTypePrefix: rule.prefix, maxBytes: rule.max })) };
    }

    return {
      verificationId: v.id,
      challengeCode: v.challenge_code,
      instructions: [
        'Fotografe a frente (e o verso, se houver) do RG, CNH ou passaporte, sem reflexos.',
        'Tire uma selfie nítida, de frente, sem óculos escuros ou boné.',
        `Grave um vídeo de 5 a 15 segundos mostrando o rosto e dizendo o código: ${v.challenge_code}.`,
        'O vídeo de verificação será exibido publicamente no seu anúncio como prova de perfil real.',
      ],
      uploads,
    };
  });

  app.post('/me/verification/submit', { preHandler: app.authenticate }, async (req, reply) => {
    const b = submitSchema.parse(req.body);
    const prefix = `kyc/${req.user.sub}/${b.verificationId}/`;
    const keys = [b.documentFrontKey, b.documentBackKey, b.selfieKey, b.videoKey].filter(Boolean) as string[];

    // Impede que o usuário aponte para arquivos de outra pessoa
    if (keys.some((k) => !k.startsWith(prefix))) throw new HttpError(400, 'invalid_key', 'Arquivo inválido.');
    const heads = await Promise.all(keys.map(headPrivate));
    if (heads.some((h) => !h)) throw new HttpError(400, 'missing_upload', 'Envie todos os arquivos antes de concluir.');

    const { rowCount } = await pool.query(
      `UPDATE identity_verifications SET
         status = 'processing', document_type = $3, document_front_key = $4, document_back_key = $5,
         selfie_key = $6, video_key = $7, submitted_at = now()
       WHERE id = $1 AND user_id = $2 AND status = 'awaiting_upload'`,
      [b.verificationId, req.user.sub, b.documentType, b.documentFrontKey, b.documentBackKey ?? null, b.selfieKey, b.videoKey],
    );
    if (!rowCount) throw new HttpError(409, 'invalid_state', 'Verificação não está aguardando envio.');

    await queues.kyc.add('analyze', { verificationId: b.verificationId }, { jobId: `kyc-${b.verificationId}` });
    return reply.code(202).send({ status: 'processing' });
  });

  app.get('/me/verification', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `SELECT id, status, challenge_code, rejection_reason, submitted_at, reviewed_at
         FROM identity_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.sub],
    );
    return rows[0] ?? { status: 'not_started' };
  });
}
