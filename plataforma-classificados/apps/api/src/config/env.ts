import { z } from 'zod';

const hex32 = z.string().regex(/^[0-9a-fA-F]{64}$/, 'deve ter 32 bytes em hexadecimal (64 caracteres)');
const bool = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default('info'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: bool,
  DB_POOL_MAX: z.coerce.number().default(20),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32),
  TERMS_VERSION: z.string().default('2026-11-01'),

  // Criptografia de dados pessoais. Em produção, prefira envelope encryption via KMS.
  PII_ENCRYPTION_KEY: hex32,
  PII_BLIND_INDEX_KEY: hex32,
  PPV_TOKEN_SECRET: hex32,

  // Armazenamento S3 compatível (MinIO, Backblaze B2, Wasabi, AWS S3...)
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: bool,
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_PRIVATE: z.string().default('classificados-private'),
  S3_BUCKET_PUBLIC: z.string().default('classificados-public'),
  PUBLIC_MEDIA_BASE_URL: z.string().url(),

  // Verificação de identidade (KYC) e varredura de segurança de mídia
  KYC_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  KYC_API_URL: z.string().optional(),
  KYC_API_KEY: z.string().optional(),
  KYC_FACE_MATCH_MIN: z.coerce.number().default(0.85),
  KYC_LIVENESS_MIN: z.coerce.number().default(0.8),
  SAFETY_SCANNER: z.enum(['mock', 'http']).default('mock'),
  SAFETY_API_URL: z.string().optional(),
  SAFETY_API_KEY: z.string().optional(),

  // Pagamentos
  PAYMENT_GATEWAY: z.enum(['mock', 'http']).default('mock'),
  PAYMENT_API_URL: z.string().optional(),
  PAYMENT_API_KEY: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  PIX_AUTOMATICO_ALLOWS_BIWEEKLY: bool,
  BILLING_GRACE_DAYS: z.coerce.number().default(3),
  PPV_PLATFORM_FEE_PCT: z.coerce.number().min(0).max(100).default(20),
});

export type Env = z.infer<typeof schema>;
export const env: Env = schema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
