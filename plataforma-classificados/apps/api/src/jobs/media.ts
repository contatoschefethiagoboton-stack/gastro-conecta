/**
 * Processamento de mídia (worker):
 *  1. SHA-256 (duplicidade exata entre contas)
 *  2. dHash 64 bits para fotos (fotos roubadas/recortadas/recomprimidas)
 *  3. varredura de segurança (CSAM hash matching) — achado = bloqueio + suspensão + preservação de evidência
 *  4. PPV: gera prévia fortemente borrada para a vitrine pública
 */
import sharp from 'sharp';
import { pool, tx } from '../db/pool.js';
import { sha256 } from '../lib/crypto.js';
import { getPrivateBuffer, putPublic } from '../lib/storage.js';
import { safetyScanner } from '../modules/verification/providers.js';

/** Difference hash: 9x8 em tons de cinza → 64 bits; retorna como bigint assinado (coluna int8). */
export async function dHash(buf: Buffer): Promise<string> {
  const px = await sharp(buf).rotate().grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let h = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      h = (h << 1n) | (px[y * 9 + x]! < px[y * 9 + x + 1]! ? 1n : 0n);
    }
  }
  return BigInt.asIntN(64, h).toString();
}

async function handleFlagged(userId: string, details: Record<string, unknown>) {
  // NÃO apagar: o material deve ser preservado e reportado às autoridades
  // (no Brasil: Polícia Federal / SaferNet; para provedores com presença nos EUA: NCMEC CyberTipline).
  await tx(async (c) => {
    await c.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [userId]);
    await c.query(`UPDATE advertisements SET status = 'paused_by_admin' WHERE user_id = $1 AND status <> 'removed'`, [userId]);
    await c.query(`INSERT INTO fraud_flags (user_id, kind, severity, details) VALUES ($1, 'csam_match', 'critical', $2)`, [userId, JSON.stringify(details)]);
  });
}

export async function processAdMedia(mediaId: string): Promise<void> {
  const m = (await pool.query('SELECT * FROM ad_media WHERE id = $1', [mediaId])).rows[0];
  if (!m || m.safety_scan_status !== 'pending') return;

  const buf = await getPrivateBuffer(m.storage_key);
  const hash = sha256(buf);
  let width: number | null = null;
  let height: number | null = null;
  let phash: string | null = null;

  if (m.kind === 'photo') {
    const meta = await sharp(buf).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
    phash = await dHash(buf);
  }
  // Vídeo: extraia quadros com ffmpeg e aplique o mesmo scanner/dHash por quadro (não incluso aqui).

  const scan = await safetyScanner.scan({ buffer: buf, mimeType: m.mime_type, sha256Hex: hash.toString('hex') });
  await pool.query(
    `UPDATE ad_media SET sha256 = $2, phash = $3, width = $4, height = $5, safety_scan_status = $6,
            moderation = CASE WHEN $6 = 'flagged' THEN 'blocked'::moderation_status ELSE moderation END
      WHERE id = $1`,
    [mediaId, hash, phash, width, height, scan.status],
  );
  if (scan.status === 'flagged') await handleFlagged(m.user_id, { mediaId, list: scan.matchedList });

  // mesma mídia já usada por OUTRA conta → sinal de perfil falso
  const dup = await pool.query('SELECT DISTINCT user_id FROM ad_media WHERE sha256 = $1 AND user_id <> $2 LIMIT 5', [hash, m.user_id]);
  if (dup.rowCount) {
    await pool.query(
      `INSERT INTO fraud_flags (user_id, kind, severity, details) VALUES ($1, 'midia_duplicada', 'medium', $2)`,
      [m.user_id, JSON.stringify({ mediaId, otherUsers: dup.rows.map((r) => r.user_id) })],
    );
  }
}

export async function processPpvItem(itemId: string): Promise<void> {
  const i = (await pool.query('SELECT * FROM ppv_items WHERE id = $1', [itemId])).rows[0];
  if (!i || i.sha256) return;
  const buf = await getPrivateBuffer(i.media_key);
  const hash = sha256(buf);
  const scan = await safetyScanner.scan({ buffer: buf, mimeType: i.kind === 'photo' ? 'image/jpeg' : 'video/mp4', sha256Hex: hash.toString('hex') });

  let teaserKey: string | null = null;
  let teaserUrl: string | null = null;
  if (scan.status === 'clean' && i.kind === 'photo') {
    const teaser = await sharp(buf).rotate().resize({ width: 480 }).blur(35).jpeg({ quality: 60 }).toBuffer();
    teaserKey = `ppv-teaser/${i.id}.jpg`;
    teaserUrl = await putPublic(teaserKey, teaser, 'image/jpeg');
  }
  // Vídeo: gere o teaser borrado a partir de um quadro com ffmpeg.

  await pool.query(
    `UPDATE ppv_items SET sha256 = $2, teaser_key = $3, teaser_url = $4,
            moderation = CASE WHEN $5 = 'flagged' THEN 'blocked'::moderation_status ELSE moderation END
      WHERE id = $1`,
    [itemId, hash, teaserKey, teaserUrl, scan.status],
  );
  if (scan.status === 'flagged') await handleFlagged(i.user_id, { ppvItemId: itemId, list: scan.matchedList });
}
