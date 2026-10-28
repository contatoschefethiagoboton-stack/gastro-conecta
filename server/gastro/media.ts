import { HttpError } from "@shared/_core/errors";
import { execute, query } from "./db";

export type MediaKind = "avatar" | "service" | "resume" | "site" | "promo";

type Rule = { mimes: string[]; maxBytes: number; isPublic: boolean; adminOnly: boolean };
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// Limite de 4,5 MB por arquivo: cabe em qualquer MySQL gerenciado (inclusive TiDB Cloud).
export const MEDIA_RULES: Record<MediaKind, Rule> = {
  avatar: { mimes: IMAGE_MIMES, maxBytes: 3 * 1024 * 1024, isPublic: true, adminOnly: false },
  service: { mimes: IMAGE_MIMES, maxBytes: 4 * 1024 * 1024, isPublic: true, adminOnly: false },
  resume: { mimes: ["application/pdf", ...IMAGE_MIMES], maxBytes: 4.5 * 1024 * 1024, isPublic: false, adminOnly: false },
  site: { mimes: IMAGE_MIMES, maxBytes: 4.5 * 1024 * 1024, isPublic: true, adminOnly: true },
  promo: { mimes: IMAGE_MIMES, maxBytes: 4.5 * 1024 * 1024, isPublic: true, adminOnly: true },
};
export const MEDIA_KINDS = Object.keys(MEDIA_RULES) as MediaKind[];
const MAX_FILES_PER_USER = 60;

/** Descobre o tipo real pelo conteúdo (não confia na extensão). */
export function sniffMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

export function decodeBase64Payload(data: string): Buffer {
  const clean = data.replace(/^data:[^;,]+;base64,/, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new HttpError(400, "Arquivo em formato inválido");
  return Buffer.from(clean, "base64");
}

export const mediaUrl = (id: number | null | undefined) => (id ? `/api/gastro/media/${Number(id)}` : "");

export async function saveMedia(input: { ownerId: number; kind: MediaKind; filename?: string; data: string; isAdmin: boolean }) {
  const rule = MEDIA_RULES[input.kind];
  if (!rule) throw new HttpError(400, "Tipo de arquivo não permitido");
  if (rule.adminOnly && !input.isAdmin) throw new HttpError(403, "Envio reservado à administração");
  const buffer = decodeBase64Payload(input.data);
  if (!buffer.length) throw new HttpError(400, "Arquivo vazio");
  if (buffer.length > rule.maxBytes) throw new HttpError(413, `Arquivo grande demais (máximo ${(rule.maxBytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB)`);
  const mime = sniffMime(buffer);
  if (!mime || !rule.mimes.includes(mime)) throw new HttpError(400, input.kind === "resume" ? "Envie o currículo em PDF, JPG, PNG ou WEBP" : "Envie uma imagem JPG, PNG, WEBP ou GIF");
  if (!input.isAdmin) {
    const rows = await query<any[]>("SELECT COUNT(*) count FROM gc_media WHERE ownerId = ?", [input.ownerId]);
    if (Number(rows[0]?.count ?? 0) >= MAX_FILES_PER_USER) throw new HttpError(429, "Limite de arquivos atingido; remova arquivos antigos");
  }
  const filename = (input.filename ?? "").replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 180) || null;
  const result = await execute("INSERT INTO gc_media (ownerId, kind, mime, filename, size, isPublic, data) VALUES (?, ?, ?, ?, ?, ?, ?)", [input.ownerId, input.kind, mime, filename, buffer.length, rule.isPublic, buffer]);
  const id = Number(result.insertId);
  return { id, url: mediaUrl(id), mime, size: buffer.length, kind: input.kind };
}

/** Confere se os arquivos pertencem ao usuário e são do tipo esperado. */
export async function assertOwnedMedia(ownerId: number, ids: number[], kind: MediaKind) {
  const unique = [...new Set(ids.filter(id => Number.isInteger(id) && id > 0))];
  if (!unique.length) return;
  const rows = await query<any[]>(`SELECT id FROM gc_media WHERE ownerId = ? AND kind = ? AND id IN (${unique.map(() => "?").join(",")})`, [ownerId, kind, ...unique]);
  if (rows.length !== unique.length) throw new HttpError(400, "Arquivo enviado não encontrado; envie novamente");
}

/** Remove arquivos de cadastro que não estão mais em uso. */
export async function pruneProfileMedia(ownerId: number, keepIds: number[]) {
  const keep = [...new Set(keepIds.filter(id => Number.isInteger(id) && id > 0))];
  const clause = keep.length ? ` AND id NOT IN (${keep.map(() => "?").join(",")})` : "";
  await execute(`DELETE FROM gc_media WHERE ownerId = ? AND kind IN ('avatar','service','resume') AND createdAt < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE)${clause}`, [ownerId, ...keep]);
}
