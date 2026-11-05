// Marketing automático: monta posts de boas-vindas aos profissionais novos e de depoimentos de clientes
// para a página do Facebook e o Instagram oficiais. Por padrão os posts ficam como rascunho para o
// dono aprovar com um clique; com "publicar automaticamente" ligado, saem sozinhos (no máximo 2 por dia).
//
// Publicação usa as mesmas variáveis do robô (META_PAGE_ACCESS_TOKEN, META_PAGE_ID e, para o Instagram,
// META_IG_USER_ID). Instagram só aceita imagem JPEG pública: fotos em outro formato vão só para o Facebook.
import { Router, type Express } from "express";
import { z } from "zod";
import { assertOrigin, body, errorHandler, parse, wrap } from "./http";
import { HttpError } from "@shared/_core/errors";
import { dbConfigured, execute, query } from "./db";
import { requireStaff, audit } from "./staff";
import { getInternalFlag, setInternalFlag } from "./content";
import { dbState } from "./bootstrap";
import { loadProfessionals, type Professional } from "./catalog";
import { siteOrigin } from "./indexing";
import { notifyUser } from "./notify";
import { requireAuth } from "./auth";
import { loadDetails } from "./profiles";
import { slugify } from "@shared/services";

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;
const pageToken = () => process.env.META_PAGE_ACCESS_TOKEN?.trim() ?? "";
const pageId = () => process.env.META_PAGE_ID?.trim() ?? "";
const igUserId = () => process.env.META_IG_USER_ID?.trim() ?? "";
const MAX_AUTO_PER_DAY = 2;
const HOUR = 60 * 60 * 1000;

const hashtag = (text: string) => `#${slugify(text).replace(/-/g, "")}`;
// Quem publica é o próprio profissional, nas redes dele: o link leva ao perfil dele com rastreio.
const utm = (path: string, campaign: string) => { const u = new URL(path, siteOrigin()); u.searchParams.set("utm_source", "profissional"); u.searchParams.set("utm_medium", "redes"); u.searchParams.set("utm_campaign", campaign); return u.href; };

/** Legenda de boas-vindas a um profissional novo. */
export function welcomeCaption(p: Pick<Professional, "id" | "name" | "city" | "category" | "services">): { caption: string; link: string } {
  const city = p.city.split(",")[0]?.trim() ?? "";
  const link = utm(`/profissionais/${p.id}`, "boas-vindas");
  const services = (p.services ?? []).slice(0, 3).join(", ") || p.category;
  const tags = [...new Set(["#eventosconecta", city && hashtag(city), city && `${hashtag(`eventos ${city}`)}`, ...(p.services ?? []).slice(0, 3).map(hashtag)].filter(Boolean))].join(" ");
  return { link, caption: `🎉 Agora estou no Eventos Conecta!\n\n${services}${city ? ` em ${city} e região` : ""}.\n\nVai fazer um evento? Veja meu perfil, fotos dos meus trabalhos e peça seu orçamento grátis, com contrato em PDF: ${link}\n\n${tags}` };
}

/** Legenda de depoimento (só o primeiro nome de quem avaliou). */
export function testimonialCaption(review: { rating: number; feedback: string; reviewerName: string }, p: Pick<Professional, "id" | "name" | "city">): { caption: string; link: string } {
  const first = String(review.reviewerName ?? "").trim().split(/\s+/)[0] || "Cliente";
  const city = p.city.split(",")[0]?.trim() ?? "";
  const link = utm(`/profissionais/${p.id}`, "depoimento");
  return { link, caption: `${"⭐".repeat(Math.max(1, Math.min(5, Math.round(review.rating))))}\n\n“${review.feedback.trim().slice(0, 400)}”\n— ${first}, cliente${city ? ` em ${city}` : ""}\n\nObrigado pela confiança! 🙏 Quer o mesmo cuidado no seu evento? Peça seu orçamento grátis: ${link}\n\n#eventosconecta #depoimento${city ? ` ${hashtag(city)}` : ""}` };
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
    const result = await execute("INSERT IGNORE INTO gc_social_posts (kind, refId, providerId, caption, imageUrl, link, status) VALUES ('new_provider', ?, ?, ?, ?, ?, 'draft')", [Number(row.id), Number(row.id), caption, image ? new URL(image, siteOrigin()).href : null, link]);
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
    const result = await execute("INSERT IGNORE INTO gc_social_posts (kind, refId, providerId, caption, imageUrl, link, status) VALUES ('testimonial', ?, ?, ?, ?, ?, 'draft')", [Number(r.id), Number(r.targetId), caption, image ? new URL(image, siteOrigin()).href : null, link]);
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

/** Envio automático das artes aos profissionais (ligado por padrão). */
export async function autoSendEnabled() { return (await getInternalFlag("social.autoSend").catch(() => null)) !== "false"; }

/** Envia a arte ao profissional: aviso no painel + WhatsApp com o link para baixar e publicar. */
export async function sendToProvider(id: number): Promise<{ ok: boolean; error?: string }> {
  const post = (await query<any[]>("SELECT id, kind, providerId, status FROM gc_social_posts WHERE id = ? LIMIT 1", [id]))[0];
  if (!post) return { ok: false, error: "Arte não encontrada" };
  if (!post.providerId) return { ok: false, error: "Arte sem profissional vinculado" };
  if (post.status === "discarded") return { ok: false, error: "Arte descartada" };
  const testimonial = post.kind === "testimonial";
  await notifyUser(Number(post.providerId), {
    type: "promo.art",
    title: testimonial ? "Você recebeu um depoimento: tem arte pronta para postar!" : "Sua arte de divulgação está pronta!",
    body: testimonial ? "Transformamos a avaliação do seu cliente em uma arte para o seu Instagram, Facebook e status do WhatsApp. É só baixar e publicar — o link leva direto para o seu perfil." : "Preparamos uma arte com a sua foto para você anunciar nas suas redes que está no Eventos Conecta. É só baixar e publicar — o link leva direto para o seu perfil.",
    path: "/painel?aba=divulgar",
  });
  await execute("UPDATE gc_social_posts SET status = 'sent', sentAt = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  return { ok: true };
}

/** Rotina: gera as artes e, se ligado, envia aos profissionais (até 20 por rodada). Publicação pela Meta só se ligada. */
export async function runSocialPosts() {
  if (!dbConfigured() || !dbState.ready) return;
  await generateDrafts();
  if (await autoSendEnabled()) {
    const pending = await query<any[]>("SELECT id FROM gc_social_posts WHERE status IN ('draft', 'approved') AND providerId IS NOT NULL ORDER BY id ASC LIMIT 20");
    for (const row of pending) await sendToProvider(Number(row.id)).catch(() => undefined);
  }
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
  const rows = await query<any[]>("SELECT sp.*, u.name providerName FROM gc_social_posts sp LEFT JOIN users u ON u.id = sp.providerId ORDER BY FIELD(sp.status, 'draft', 'approved', 'sent', 'failed', 'published', 'discarded'), sp.id DESC LIMIT 60");
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  res.json({ autoSend: await autoSendEnabled(), autoPublish: await autoPublishEnabled(), instagram: Boolean(igUserId()), facebook: Boolean(pageToken() && pageId()), posts: rows.map(r => ({ ...r, createdAt: iso(r.createdAt), publishedAt: iso(r.publishedAt), sentAt: iso(r.sentAt), sharedAt: iso(r.sharedAt) })) });
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

router.post("/admin/social/posts/:id/send", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireStaff(req);
  const id = parse(idSchema, req.params.id);
  const result = await sendToProvider(id);
  await audit(ctx.user.id, "social.post_send", { id, ok: result.ok, error: result.error });
  res.status(result.ok ? 200 : 400).json(result.ok ? result : { error: result.error });
}));

/** Kit de divulgação para todos os profissionais ativos (no máximo 1 vez a cada 7 dias por pessoa). */
router.post("/admin/social/kit", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireStaff(req);
  const rows = await query<any[]>(`SELECT u.id FROM users u JOIN account_profiles p ON p.userId = u.id JOIN gc_profile_details d ON d.userId = u.id AND d.completedAt IS NOT NULL
    WHERE u.role <> 'admin' AND p.accountType = 'provider' AND p.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM gc_notifications n WHERE n.userId = u.id AND n.type = 'promo.kit' AND n.createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY)) LIMIT 500`);
  for (const row of rows) await notifyUser(Number(row.id), { type: "promo.kit", title: "Seu kit de divulgação chegou", body: "Artes prontas com a sua foto para o feed e para o status/stories, com legenda e o link do seu perfil. Baixe e publique nas suas redes para receber mais pedidos.", path: "/painel?aba=divulgar" });
  await audit(ctx.user.id, "social.kit_send", { sent: rows.length });
  res.json({ sent: rows.length });
}));

router.put("/admin/social/posts-settings", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireStaff(req);
  const input = body(req, z.object({ autoPublish: z.boolean().optional(), autoSend: z.boolean().optional() }));
  if (input.autoPublish !== undefined) await setInternalFlag("social.autoPublish", String(input.autoPublish));
  if (input.autoSend !== undefined) await setInternalFlag("social.autoSend", String(input.autoSend));
  await audit(ctx.user.id, "social.post_settings", input);
  res.json(input);
}));

// ------------------------------------------------------------------ profissional: kit de divulgação

const media = (id: unknown) => (Number(id) > 0 ? `/api/gastro/media/${Number(id)}` : "");

/** Dados para o profissional montar as artes no próprio painel (foto, nome, serviços, nota) + artes enviadas. */
router.get("/promo/kit", wrap(async (req, res) => {
  const ctx = await requireAuth(req);
  if (ctx.profile.accountType !== "provider") throw new HttpError(403, "Disponível só para profissionais");
  const me = ctx.user.id;
  const pro = (await loadProfessionals()).find(p => p.id === `user-${me}`);
  const { details } = await loadDetails(me);
  const city = (pro?.city || ctx.profile.city || "").trim();
  const profile = {
    name: pro?.name || String(details?.tradeName || ctx.user.name || ""),
    profession: (pro?.services?.length ? pro.services.slice(0, 2).join(" · ") : ctx.profile.specialty) || pro?.category || "Profissional para eventos",
    city: city.split(",")[0]?.trim() ?? "",
    image: pro ? imageOf(pro) : media(details?.serviceMediaIds?.[0]) || media(details?.avatarMediaId),
    photos: [...new Set([...(pro?.gallery ?? []), pro?.image ?? "", ...(Array.isArray(details?.serviceMediaIds) ? details.serviceMediaIds.map(media) : []), media(details?.avatarMediaId)].filter(Boolean))].slice(0, 8),
    rating: pro?.rating ?? null,
    listed: Boolean(pro),
  };
  const welcome = welcomeCaption({ id: `user-${me}`, name: profile.name, city, category: profile.profession, services: pro?.services ?? [] });
  const posts = await query<any[]>(`SELECT sp.id, sp.kind, sp.caption, sp.link, sp.sentAt, sp.sharedAt, r.rating, r.feedback, ru.name reviewerName
    FROM gc_social_posts sp LEFT JOIN gastro_reviews r ON sp.kind = 'testimonial' AND r.id = sp.refId LEFT JOIN users ru ON ru.id = r.reviewerId
    WHERE sp.providerId = ? AND sp.status IN ('sent', 'published') ORDER BY sp.id DESC LIMIT 20`, [me]);
  res.json({
    profile,
    link: welcome.link,
    caption: welcome.caption,
    posts: posts.map(r => ({ id: Number(r.id), kind: r.kind, caption: r.caption, link: r.link, sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : null, sharedAt: r.sharedAt ? new Date(r.sharedAt).toISOString() : null,
      ...(r.kind === "testimonial" ? { quote: String(r.feedback ?? "").slice(0, 220), rating: Number(r.rating ?? 5), author: String(r.reviewerName ?? "").trim().split(/\s+/)[0] || "Cliente" } : {}) })),
  });
}));

/** O profissional marcou que publicou (para o painel do dono acompanhar). */
router.post("/promo/posts/:id/shared", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireAuth(req);
  const id = parse(idSchema, req.params.id);
  await execute("UPDATE gc_social_posts SET sharedAt = COALESCE(sharedAt, CURRENT_TIMESTAMP) WHERE id = ? AND providerId = ?", [id, ctx.user.id]);
  res.json({ ok: true });
}));

router.use(errorHandler);

export function registerSocialPostRoutes(app: Express) {
  app.use("/api/gastro", router);
}
