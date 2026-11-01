/**
 * Armazenamento de mídia em dois buckets:
 *  - PRIVADO: quarentena de uploads, documentos de KYC, conteúdo PPV. Nunca público.
 *  - PÚBLICO: mídia aprovada, servida por CDN.
 * Uploads vão direto do navegador ao bucket via POST pré-assinado (a API não trafega o arquivo).
 */
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import { env } from '../config/env.js';

export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});

export const MB = 1024 * 1024;

export async function presignUpload(opts: {
  key: string;
  contentTypePrefix: 'image/' | 'video/' | 'application/pdf';
  maxBytes: number;
  expiresIn?: number;
}) {
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: env.S3_BUCKET_PRIVATE,
    Key: opts.key,
    Conditions: [
      ['content-length-range', 1, opts.maxBytes],
      ['starts-with', '$Content-Type', opts.contentTypePrefix],
    ],
    Expires: opts.expiresIn ?? 900,
  });
  return { url, fields, maxBytes: opts.maxBytes };
}

export async function headPrivate(key: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET_PRIVATE, Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? 'application/octet-stream' };
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function getPrivateBuffer(key: string): Promise<Buffer> {
  const r = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET_PRIVATE, Key: key }));
  if (!r.Body) throw new Error(`Objeto vazio: ${key}`);
  return Buffer.from(await r.Body.transformToByteArray());
}

export async function getPrivateStream(key: string, range?: string) {
  const r = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET_PRIVATE, Key: key, Range: range }));
  return {
    body: r.Body as Readable,
    contentLength: r.ContentLength,
    contentRange: r.ContentRange,
    contentType: r.ContentType ?? 'application/octet-stream',
  };
}

/** URL temporária (padrão 5 min) para moderação/KYC visualizar arquivo privado. */
export const presignPrivateGet = (key: string, expiresIn = 300) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET_PRIVATE, Key: key }), { expiresIn });

export async function putPublic(key: string, body: Buffer, contentType: string): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET_PUBLIC,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return `${env.PUBLIC_MEDIA_BASE_URL}/${key}`;
}

/** Publica mídia aprovada: copia do bucket privado para o público. */
export async function publishPrivateObject(privateKey: string, publicKey: string): Promise<string> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: env.S3_BUCKET_PUBLIC,
      Key: publicKey,
      CopySource: `${env.S3_BUCKET_PRIVATE}/${privateKey}`,
      CacheControl: 'public, max-age=31536000, immutable',
      MetadataDirective: 'REPLACE',
    }),
  );
  return `${env.PUBLIC_MEDIA_BASE_URL}/${publicKey}`;
}

export async function deletePublic(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET_PUBLIC, Key: key }));
}
