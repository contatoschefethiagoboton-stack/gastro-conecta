import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';

export type UserRole = 'advertiser' | 'moderator' | 'admin';
type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: UserRole };
    user: { sub: string; role: UserRole };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: Guard;
    requireRole: (...roles: UserRole[]) => Guard;
  }
}

export default fp(async (app) => {
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: '1h' } });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, 'unauthorized', 'Faça login novamente.');
    }
  });

  // Para a equipe, revalida papel e status no banco a cada requisição:
  // suspender um moderador corta o acesso na hora, sem esperar o JWT expirar.
  app.decorate('requireRole', (...roles: UserRole[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    const { rows } = await pool.query<{ role: UserRole; status: string }>(
      'SELECT role, status FROM users WHERE id = $1',
      [req.user.sub],
    );
    const u = rows[0];
    if (!u || u.status !== 'active' || !roles.includes(u.role)) {
      throw new HttpError(403, 'forbidden', 'Acesso negado.');
    }
    req.user.role = u.role;
  });
});
