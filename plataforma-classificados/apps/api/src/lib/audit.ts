import type { FastifyRequest } from 'fastify';
import type { Db } from '../db/pool.js';

export interface AdminLogEntry {
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/** Grava no log administrativo encadeado por hash (ver admin_logs no SQL). */
export async function logAdmin(db: Db, req: FastifyRequest, e: AdminLogEntry): Promise<void> {
  await db.query(
    `INSERT INTO admin_logs (admin_id, action, target_type, target_id, before_state, after_state, reason, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      req.user.sub,
      e.action,
      e.targetType,
      e.targetId,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
      e.reason ?? null,
      req.ip,
      req.headers['user-agent'] ?? null,
    ],
  );
}

/** Registra toda decifragem/visualização de dado sigiloso ou documento. */
export async function logPrivateAccess(
  db: Db,
  req: FastifyRequest,
  targetUserId: string,
  fields: string[],
  purpose: string,
  legalRequestId?: string,
): Promise<void> {
  await db.query(
    `INSERT INTO private_data_access_logs (accessed_by, target_user_id, legal_request_id, fields, purpose, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [req.user.sub, targetUserId, legalRequestId ?? null, fields, purpose, req.ip],
  );
}
