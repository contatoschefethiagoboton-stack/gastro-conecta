/**
 * Cadastro e login do ANUNCIANTE. Clientes finais navegam sem conta.
 *
 * O cadastro exige os dados sigilosos (nome, CPF, RG, telefone, CEP, endereço),
 * que são cifrados antes de chegar ao banco e nunca retornam em nenhuma rota pública.
 */
import * as argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { isUniqueViolation, pool, tx } from '../../db/pool.js';
import { blindIndex, encrypt } from '../../lib/crypto.js';
import { HttpError } from '../../lib/errors.js';
import { ageFromBirthDate, isValidCpf, onlyDigits, slugify } from '../../lib/validators.js';

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10, 'Mínimo de 10 caracteres').max(128),
  fullName: z.string().trim().min(5).max(200),
  cpf: z.string().transform(onlyDigits).refine(isValidCpf, 'CPF inválido'),
  rg: z.string().trim().min(4).max(20),
  phone: z.string().transform(onlyDigits).refine((v) => v.length >= 10 && v.length <= 13, 'Telefone inválido'),
  cep: z.string().transform(onlyDigits).refine((v) => v.length === 8, 'CEP inválido'),
  address: z.object({
    street: z.string().trim().min(2).max(200),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(100).optional(),
    district: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().length(2).toUpperCase(),
  }),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  displayName: z.string().trim().min(2).max(60).optional(), // nome artístico (opcional)
  acceptTerms: z.literal(true),
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const b = registerSchema.parse(req.body);
    if (ageFromBirthDate(b.birthDate) < 18) {
      throw new HttpError(422, 'underage', 'Cadastro permitido somente para maiores de 18 anos.');
    }
    const passwordHash = await argon2.hash(b.password, { type: argon2.argon2id });

    try {
      const userId = await tx(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, terms_accepted_at, terms_version)
           VALUES ($1, $2, now(), $3) RETURNING id`,
          [b.email, passwordHash, env.TERMS_VERSION],
        );
        const id = rows[0]!.id;
        await c.query(
          `INSERT INTO advertiser_private_data
             (user_id, full_name_enc, cpf_enc, cpf_hash, rg_enc, phone_enc, phone_hash, cep_enc, address_enc)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            encrypt(b.fullName, id),
            encrypt(b.cpf, id),
            blindIndex(b.cpf, 'cpf'),
            encrypt(b.rg, id),
            encrypt(b.phone, id),
            blindIndex(b.phone, 'phone'),
            encrypt(b.cep, id),
            encrypt(JSON.stringify(b.address), id),
          ],
        );
        const displayName = b.displayName || `Perfil ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        await c.query(
          'INSERT INTO profiles (user_id, display_name, slug, birth_date) VALUES ($1, $2, $3, $4)',
          [id, displayName, slugify(displayName), b.birthDate],
        );
        return id;
      });

      const token = app.jwt.sign({ sub: userId, role: 'advertiser' });
      return reply.code(201).send({ userId, token, nextStep: 'verificacao_identidade' });
    } catch (err) {
      // Mensagem genérica: não revela se o CPF ou o e-mail já existe (anti-enumeração)
      if (isUniqueViolation(err)) throw new HttpError(409, 'already_registered', 'Não foi possível concluir o cadastro com estes dados.');
      throw err;
    }
  });

  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (req) => {
    const b = loginSchema.parse(req.body);
    const { rows } = await pool.query<{ id: string; password_hash: string; role: 'advertiser' | 'moderator' | 'admin'; status: string }>(
      'SELECT id, password_hash, role, status FROM users WHERE email = $1',
      [b.email],
    );
    const u = rows[0];
    // Sempre roda argon2 (mesmo sem usuário) para não vazar existência por tempo de resposta
    const ok = u ? await argon2.verify(u.password_hash, b.password) : (await argon2.hash(b.password), false);

    await pool.query(
      'INSERT INTO auth_events (user_id, email_hash, success, ip, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [u?.id ?? null, blindIndex(b.email, 'email'), ok, req.ip, req.headers['user-agent'] ?? null],
    );

    if (!u || !ok) throw new HttpError(401, 'invalid_credentials', 'E-mail ou senha incorretos.');
    if (u.status === 'banned' || u.status === 'deleted') throw new HttpError(403, 'account_blocked', 'Conta bloqueada.');

    await pool.query('UPDATE users SET last_login_at = now(), last_login_ip = $2 WHERE id = $1', [u.id, req.ip]);
    // TODO produção: exigir TOTP (mfa_secret_enc) para moderator/admin antes de emitir o token.
    const expiresIn = u.role === 'advertiser' ? '1h' : '30m';
    return { token: app.jwt.sign({ sub: u.id, role: u.role }, { expiresIn }), role: u.role, status: u.status };
  });

  /** Painel do anunciante: resumo da conta (sem dados sigilosos). */
  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `SELECT u.email, u.status, p.display_name, p.slug, p.is_verified,
              (SELECT status FROM identity_verifications WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS verification_status,
              (SELECT json_build_object('status', s.status, 'plan', pl.code, 'periodEnd', s.current_period_end, 'trialEndsAt', s.trial_ends_at)
                 FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
                WHERE s.user_id = u.id ORDER BY s.created_at DESC LIMIT 1) AS subscription
         FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1`,
      [req.user.sub],
    );
    return rows[0] ?? null;
  });
}
