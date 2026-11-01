import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { HttpError } from './lib/errors.js';
import { redis } from './lib/redis.js';
import { complianceRoutes } from './modules/admin/compliance.js';
import { metricsRoutes } from './modules/admin/metrics.js';
import { moderationRoutes } from './modules/admin/moderation.js';
import { offersRoutes } from './modules/admin/offers.js';
import { adRoutes } from './modules/ads/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { paymentRoutes } from './modules/payments/routes.js';
import { ppvRoutes } from './modules/ppv/routes.js';
import { searchRoutes } from './modules/search/routes.js';
import { taxonomyRoutes } from './modules/taxonomy.js';
import { verificationRoutes } from './modules/verification/routes.js';
import authPlugin from './plugins/auth.js';

export async function buildServer() {
  const app = Fastify({
    trustProxy: true, // atrás do proxy do Render/CDN: req.ip = IP real do cliente
    bodyLimit: 1_000_000,
    logger: {
      level: env.LOG_LEVEL,
      // nunca logar credenciais ou PII
      redact: ['req.headers.authorization', 'req.headers["x-status-token"]', 'req.headers.cookie'],
    },
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } });
  await app.register(cors, { origin: env.WEB_ORIGIN.split(',').map((s) => s.trim()), credentials: false });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute', redis });
  await app.register(authPlugin);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'validation', message: 'Dados inválidos.', issues: err.flatten() });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: 'request_error', message: err.message });
    req.log.error({ err }, 'erro não tratado');
    return reply.code(500).send({ error: 'internal', message: 'Erro interno.' });
  });

  app.get('/health', { config: { rateLimit: false } }, async () => {
    await pool.query('SELECT 1');
    return { ok: true };
  });

  // Público (sem login)
  await app.register(taxonomyRoutes);
  await app.register(searchRoutes);
  // Anunciante + rotas públicas dos anúncios/PPV
  await app.register(authRoutes);
  await app.register(adRoutes);
  await app.register(verificationRoutes);
  await app.register(paymentRoutes);
  await app.register(ppvRoutes);
  // Painel administrativo
  await app.register(metricsRoutes);
  await app.register(moderationRoutes);
  await app.register(offersRoutes);
  await app.register(complianceRoutes);

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = await buildServer();
  const shutdown = async () => {
    await app.close();
    await pool.end();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}
