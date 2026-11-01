/**
 * Criptografia de campo para dados pessoais (LGPD).
 *
 * Formato do blob: [versão 1B][IV 12B][TAG 16B][ciphertext]
 * AAD (dados autenticados) = user_id → um blob copiado para outra linha falha ao decifrar.
 *
 * Produção: guarde a chave em KMS/HSM (AWS KMS, GCP KMS, Vault) e use envelope
 * encryption; aqui a chave vem de variável de ambiente para simplificar o deploy.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

const VERSION = 1;
const key = () => Buffer.from(env.PII_ENCRYPTION_KEY, 'hex');
const bidxKey = () => Buffer.from(env.PII_BLIND_INDEX_KEY, 'hex');

export function encrypt(plain: string, aad: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct]);
}

export function decrypt(blob: Buffer, aad: string): string {
  if (blob[0] !== VERSION) throw new Error(`Versão de cifra desconhecida: ${blob[0]}`);
  const iv = blob.subarray(1, 13);
  const tag = blob.subarray(13, 29);
  const ct = blob.subarray(29);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Índice cego determinístico: permite unicidade/busca exata sem decifrar. */
export function blindIndex(value: string, context: string): Buffer {
  return createHmac('sha256', bidxKey()).update(`${context}:${value.trim().toLowerCase()}`).digest();
}

export const sha256 = (data: Buffer | string): Buffer => createHash('sha256').update(data).digest();

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export function hmac(secretHex: string, data: string): Buffer {
  return createHmac('sha256', Buffer.from(secretHex, 'hex')).update(data).digest();
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
