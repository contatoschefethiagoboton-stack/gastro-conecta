// Marketing automático: monta posts de boas-vindas aos profissionais novos e de depoimentos de clientes
// para a página do Facebook e o Instagram oficiais. Por padrão os posts ficam como rascunho para o
// dono aprovar com um clique; com "publicar automaticamente" ligado, saem sozinhos (no máximo 2 por dia).
//
// Publicação usa as mesmas variáveis do robô (META_PAGE_ACCESS_TOKEN, META_PAGE_ID e, para o Instagram,
// META_IG_USER_ID). Instagram só aceita imagem JPEG pública: fotos em outro formato vão só para o Facebook.
import { Router, type Express } from "express";
import { z } from "zod";
import { assertOrigin, body, errorHandler, parse, wrap } from "./http";
import { dbConfigured, execute, query } from "./db";
import { requireStaff, audit } from "./staff";
import { getInternalFlag, setInternalFlag } from "./content";
import { dbState } from "./bootstrap";
import { loadProfessionals, type Professional } from "./catalog";
import { siteOrigin } from "./indexing";
import { slugify } from "@shared/services";

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;
const pageToken = () => process.env.META_PAGE_ACCESS_TOKEN?.trim() ?? "";
const pageId = () => process.env.META_PAGE_ID?.trim() ?? "";
const igUserId = () => process.env.META_IG_USER_ID?.trim() ?? "";
const MAX_AUTO_PER_DAY = 2;
const HOUR = 60 * 60 * 1000;

const hashtag = (text: string) => `#${slugify(text).replace(/-/g, "")}`;
const utm = (path: string, campaign: string) => { const u = new URL(path, siteOrigin()); u.searchParams.set("utm_source", "instagram"); u.searchParams.set("utm_medium", "post"); u.searchParams.set("utm_campaign", campaign); return u.href; };

/** Legenda de boas-vindas a um profissional novo. */
export function welcomeCaption(p: Pick<Professional, "id" | "name" | "city" | "category" | "services">): { caption: string; link: string } {
  const city = p.city.split(",")[0]?.trim() ?? "";
  const link = utm(`/profissionais/${p.id}`, "boas-vindas");
  const services = (p.services ?? []).slice(0, 3).join(", ") || p.category;
  const tags = [...new Set(["#eventosconecta", city && hashtag(city), city && `${hashtag(`eventos ${city}`)}`, ...(p.services ?? []).slice(0, 3).map(hashtag)].filter(Boolean))].join(" ");
  return { link, caption: `👋 Boas-vindas ao Eventos Conecta, ${p.name}!\n\n${services}${city ? ` em ${city} e região` : ""}.\n\nPrecisa para o seu evento? Peça orçamento grátis e receba propostas: ${link}\n\n${tags}` };
}

/** Legenda de depoimento (só o primeiro nome de quem avaliou). */
export function testimonialCaption(review: { rating: number; feedback: string; reviewerName: string }, p: Pick<Professional, "id" | "name" | "city">): { caption: string; link: string } {
  const first = String(review.reviewerName ?? "").trim().split(/\s+/)[0] || "Cliente";
  const city = p.city.split(",")[0]?.trim() ?? "";
  const link = utm(`/profissionais/${p.id}`, "depoimento");
  return { link, caption: `${"⭐".repeat(Math.max(1, Math.min(5, Math.round(review.rating))))}\n\n“${review.feedback.trim().slice(0, 400)}”\n— ${first}, sobre ${p.name}${city ? ` (${city})` : ""}\n\nContrate profissionais avaliados por clientes de verdade: ${link}\n\n#eventosconecta #depoimento${city ? ` ${hashtag(city)}` : ""}` };
}

const imageOf = (p: Professional) => p.gallery?.[0] || p.image || "";

/** Cria rascunhos novos (um por profissional e um por depoimento). Devolve quantos foram criados. */
export async function generateDrafts(): Promise<number> {
  const all = (await loadProfessionals()).filter(p => !p.demo);
  const byId = new Map(all.map(p => [Number(p.id.replace("user-", "")), p]));
  let created = 0;
  // Profissionais ativos que entraram nos últimos 30 dias (e aparecem no catálogo).
  const recent = await query<any[]>("SELECT u.id FROM users u JOIN account_profiles p ON p.userId = u.id WHERE p.accountType = 'provider' AND p.status = 'active' AND u.createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)");
  for (const row of recent) {
    const p = byId.get(Number(row.id));
    if (!p) continue;
    const { caption, link } = welcomeCaption(p);
    const image = imageOf(p);
    const result = await execute("INSERT IGNORE INTO gc_social_posts (kind, refId, caption, imageUrl, link, status) VALUES ('new_provider', ?, ?, ?, ?, 'draft')", [Number(row.id), caption, image ? new URL(image, siteOrigin()).href : null, link]);
    created += result.affectedRows;
  }
  // Depoimentos de clientes: nota 4+ com comentário de verdade, sobre profissional visível.
  const reviews = await query<any[]>(`SELECT r.id, r.rating, r.feedback, r.targetId, ru.name reviewerName FROM gastro_reviews r JOIN users ru ON ru.id = r.reviewerId
    JOIN account_profiles rp ON rp.userId = r.reviewerId AND rp.accountType = 'client'
    WHERE r.rating >= 4 AND CHAR_LENGTH(r.feedback) >= 20 AND r.createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY) ORDER BY r.id DESC LIMIT 50`);
  for (const r of reviews) {
    const p = byId.get(Number(r.targetId));
    if (!p) continue;
    const { caption, link } = testimonialCaption({ rating: Number(r.rating), feedback: String(r.feedback), reviewerName: String(r.reviewerName ?? "") }, p);
    const image = imageOf(p);
    const result = await execute("INSERT IGNORE INTO gc_social_posts (kind, refId, caption, imageUrl, link, status) VALUES ('testimonial', ?, ?, ?, ?, 'draft')", [Number(r.id), caption, image ? new URL(image, siteOrigin()).href : null, link]);
    created += result.affectedRows;
  }
  return created;
}

async function graphPost(path: string, payload: Record<string, unknown>): Promise<{ id?: string; error?: string }> {
  try {
    const response = await fetch(`${GRAPH}/${path}`, { method: "POST", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${pageToken()}` }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({})) as { id?: string; post_id?: string; error?: { message?: string; code?: number } };
    return response.ok ? { id: data.post_id ?? data.id } : { error: `${data.error?.code ?? response.status}: ${data.error?.message ?? "erro da Meta"}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "falha de rede" };
  }
}

/** Instagram só publica JPEG: confere o tipo da imagem (arquivos do próprio site ou link externo). */
async function isJpeg(url: string): Promise<boolean> {
  const local = /\/api\/gastro\/media\/(\d+)$/.exec(new URL(url).pathname);
  if (local) { const rows = await query<any[]>("SELECT mime FROM gc_media WHERE id = ? AND isPublic = 1 LIMIT 1", [Number(local[1])]); return rows[0]?.mime === "image/jpeg"; }
  return /\.jpe?g($|\?)/i.test(url);
}

export async function publishPost(id: number): Promise<{ ok: boolean; error?: string }> {
  const rows = await query<any[]>("SELECT * FROM gc_social_posts WHERE id = ? LIMIT 1", [id]);
  const post = rows[0];
  if (!post) return { ok: false, error: "Post não encontrado" };
  if (!pageToken() || !pageId()) return { ok: false, error: "Configure META_PAGE_ACCESS_TOKEN e META_PAGE_ID no Render para publicar." };
  const errors: string[] = [];
  const fb = post.imageUrl ? await graphPost(`${pageId()}/photos`, { url: post.imageUrl, caption: post.caption }) : await graphPost(`${pageId()}/feed`, { message: post.caption, link: post.link });
  if (fb.error) errors.push(`Facebook ${fb.error}`);
  let igId: string | undefined;
  if (igUserId() && post.imageUrl && await isJpeg(post.imageUrl)) {
    const container = await graphPost(`${igUserId()}/media`, { image_url: post.imageUrl, caption: post.caption });
    if (container.id) { const published = await graphPost(`${igUserId()}/media_publish`, { creation_id: container.id }); igId = published.id; if (published.error) errors.push(`Instagram ${published.error}`); }
    else if (container.error) errors.push(`Instagram ${container.error}`);
  }
  const ok = Boolean(fb.id || igId);
  await execute("UPDATE gc_social_posts SET status = ?, fbPostId = ?, igPostId = ?, error = ?, publishedAt = IF(? , CURRENT_TIMESTAMP, publishedAt) WHERE id = ?", [ok ? "published" : "failed", fb.id ?? null, igId ?? null, errors.join(" | ").slice(0, 500) || null, ok, id]);
  return ok ? { ok: true, ...(errors.length ? { error: errors.join(" | ") } : {}) } : { ok: false, error: errors.join(" | ") };
}

export async function autoPublishEnabled() { return (await getInternalFlag("social.autoPublish").catch(() => null)) === "true"; }

/** Rotina: gera rascunhos e, se ligado, publica até 2 por dia (o mais antigo primeiro). */
export async function runSocialPosts() {
  if (!dbConfigured() || !dbState.ready) return;
  await generateDrafts();
  if (!(await autoPublishEnabled())) return;
  const today = await query<any[]>("SELECT COUNT(*) total FROM gc_social_posts WHERE status = 'published' AND publishedAt >= CURRENT_DATE");
  let room = MAX_AUTO_PER_DAY - Number(today[0]?.total ?? 0);
  const queue = await query<any[]>("SELECT id FROM gc_social_posts WHERE status IN ('draft', 'approved') ORDER BY FIELD(status, 'approved', 'draft'), id ASC LIMIT 5");
  for (const row of queue) { if (room-- <= 0) break; await publishPost(Number(row.id)); }
}

let timer: NodeJS.Timeout | null = null;
export function startSocialScheduler() {
  if (timer) return;
  const tick = () => { runSocialPosts().catch(error => console.warn("[Redes] rotina de posts falhou:", error instanceof Error ? error.message : error)); };
  setTimeout(tick, 2 * 60_000).unref();
  timer = setInterval(tick, 6 * HOUR);
  timer.unref();
}

// ------------------------------------------------------------------ painel

const router = Router();
const idSchema = z.coerce.number().int().positive();

router.get("/admin/social/posts", wrap(async (req, res) => {
  await requireStaff(req);
  const rows = await query<any[]>("SELECT * FROM gc_social_posts ORDER BY FIELD(status, 'draft', 'approved', 'failed', 'published', 'discarded'), id DESC LIMIT 60");
  res.json({ autoPublish: await autoPublishEnabled(), instagram: Boolean(igUserId()), facebook: Boolean(pageToken() && pageId()), posts: rows.map(r => ({ ...r, createdAt: new Date(r.createdAt).toISOString(), publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null })) });
}));

router.post("/admin/social/posts/generate", wrap(async (req, res) => {
  assertOrigin(req);
  await requireStaff(req);
  res.json({ created: await generateDrafts() });
}));

router.post("/admin/social/posts/:id/publish", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireStaff(req);
  const id = parse(idSchema, req.params.id);
  const result = await publishPost(id);
  await audit(ctx.user.id, "social.post_publish", { id, ok: result.ok, error: result.error });
  res.status(result.ok ? 200 : 502).json(result.ok ? result : { error: result.error });
}));

router.patch("/admin/social/posts/:id", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireStaff(req);
  const id = parse(idSchema, req.params.id);
  const input = body(req, z.object({ caption: z.string().trim().min(5).max(2200).optional(), status: z.enum(["draft", "approved", "discarded"]).optional() }).strict());
  const sets: string[] = [], values: unknown[] = [];
  if (input.caption) { sets.push("caption = ?"); values.push(input.caption); }
  if (input.status) { sets.push("status = ?"); values.push(input.status); }
  if (sets.length) await execute(`UPDATE gc_social_posts SET ${sets.join(", ")} WHERE id = ? AND status <> 'published'`, [...values, id]);
  await audit(ctx.user.id, "social.post_edit", { id, ...input });
  res.json({ ok: true });
}));

router.put("/admin/social/posts-settings", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireStaff(req);
  const input = body(req, z.object({ autoPublish: z.boolean() }));
  await setInternalFlag("social.autoPublish", String(input.autoPublish));
  await audit(ctx.user.id, "social.post_settings", input);
  res.json(input);
}));

router.use(errorHandler);

export function registerSocialPostRoutes(app: Express) {
  app.use("/api/gastro", router);
}
