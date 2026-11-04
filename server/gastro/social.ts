// Robô das redes: recebe comentários e mensagens do Instagram, do Facebook (Messenger) e do WhatsApp
// pelo webhook da Meta, entende o que a pessoa procura e responde com o link do orçamento já preenchido.
//
// Variáveis no Render (Environment):
//   META_APP_SECRET         segredo do app (Meta for Developers → App settings → Basic) — valida o webhook
//   META_VERIFY_TOKEN       texto que você inventa e repete no cadastro do webhook na Meta
//   META_PAGE_ACCESS_TOKEN  token da Página do Facebook (permanente, de usuário do sistema)
//   META_PAGE_ID            ID da Página do Facebook (o Instagram profissional precisa estar ligado a ela)
//   META_IG_USER_ID         ID da conta profissional do Instagram (opcional; evita responder a si mesmo)
//   WhatsApp: usa o token e o número já configurados em Painel → Notificações.
import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Express, type Request } from "express";
import { z } from "zod";
import { assertOrigin, body, errorHandler, wrap } from "./http";
import { dbConfigured, execute, query } from "./db";
import { requireStaff, audit } from "./staff";
import { getInternalFlag, getSiteContent, setInternalFlag } from "./content";
import { sendWhatsappText } from "./notify";
import { copilotProvider, resolveCopilotEndpoint } from "./routes";
import { siteOrigin } from "./indexing";
import { detectIntent, type Intent } from "@shared/socialIntent";
import { JOBS_BASE, jobCityPath, seoCatalogFrom, seoCitiesFrom, type SeoCatalog, type SeoCity } from "@shared/seo";
import { serviceCatalogFrom } from "@shared/services";

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;
const pageToken = () => process.env.META_PAGE_ACCESS_TOKEN?.trim() ?? "";
const pageId = () => process.env.META_PAGE_ID?.trim() ?? "";
const igUserId = () => process.env.META_IG_USER_ID?.trim() ?? "";
const REPLY_COOLDOWN_HOURS = 12;

export const socialStatus = () => ({
  webhook: Boolean(process.env.META_APP_SECRET && process.env.META_VERIFY_TOKEN),
  pages: Boolean(pageToken() && pageId()),
  instagram: Boolean(pageToken() && pageId()),
});

/** Confere a assinatura X-Hub-Signature-256 (HMAC SHA-256 do corpo bruto com o segredo do app). */
export function validMetaSignature(raw: Buffer | undefined, header: string | undefined, secret = process.env.META_APP_SECRET ?? ""): boolean {
  if (!secret || !raw || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ------------------------------------------------------------------ mensagens recebidas (formato normalizado)

export type Inbound = { platform: "instagram" | "facebook" | "whatsapp"; kind: "dm" | "comment"; externalId: string; senderId: string; senderName?: string; text: string };

/** Traduz o JSON do webhook da Meta para uma lista de mensagens. Ignora ecos e mensagens da própria conta. */
export function parseMetaWebhook(payload: any, own: { pageId?: string; igUserId?: string } = {}): Inbound[] {
  const out: Inbound[] = [];
  const mine = (id: unknown) => Boolean(id) && (String(id) === own.pageId || String(id) === own.igUserId);
  const object = String(payload?.object ?? "");
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    if (object === "page" || object === "instagram") {
      const platform = object === "page" ? "facebook" : "instagram";
      for (const m of Array.isArray(entry.messaging) ? entry.messaging : []) {
        if (!m?.message?.text || m.message.is_echo || mine(m.sender?.id)) continue;
        out.push({ platform, kind: "dm", externalId: String(m.message.mid ?? `${m.sender?.id}-${m.timestamp}`), senderId: String(m.sender?.id ?? ""), text: String(m.message.text) });
      }
      for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
        const v = change?.value ?? {};
        if (object === "page" && change.field === "feed" && v.item === "comment" && v.verb === "add" && v.message && !mine(v.from?.id)) {
          out.push({ platform: "facebook", kind: "comment", externalId: String(v.comment_id), senderId: String(v.from?.id ?? ""), senderName: v.from?.name, text: String(v.message) });
        }
        if (object === "instagram" && change.field === "comments" && v.text && !mine(v.from?.id)) {
          out.push({ platform: "instagram", kind: "comment", externalId: String(v.id), senderId: String(v.from?.id ?? ""), senderName: v.from?.username, text: String(v.text) });
        }
      }
    }
    if (object === "whatsapp_business_account") {
      for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
        const v = change?.value ?? {};
        const names = new Map((v.contacts ?? []).map((c: any) => [String(c.wa_id), c.profile?.name]));
        for (const msg of v.messages ?? []) {
          if (msg.type !== "text" || !msg.text?.body) continue;
          out.push({ platform: "whatsapp", kind: "dm", externalId: String(msg.id), senderId: String(msg.from), senderName: names.get(String(msg.from)) as string | undefined, text: String(msg.text.body) });
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ resposta

const firstName = (name?: string) => (name ? ` ${String(name).trim().split(/\s+/)[0].replace(/^@/, "").slice(0, 30)}` : "");
const brDate = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : "");

/** Link do orçamento já preenchido (serviço, cidade e data) com UTM para medir de onde veio. */
export function quoteLink(intent: Intent, platform: string, kind: string, origin = siteOrigin()): string {
  const url = new URL("/orcamento", origin);
  if (intent.serviceSlug) url.searchParams.set("servico", intent.serviceSlug);
  if (intent.city) url.searchParams.set("cidade", `${intent.city.name}, ${intent.city.uf}`);
  if (intent.date) url.searchParams.set("data", intent.date);
  url.searchParams.set("utm_source", platform);
  url.searchParams.set("utm_medium", kind === "comment" ? "comentario" : "mensagem");
  url.searchParams.set("utm_campaign", "robo-redes");
  return url.href;
}

export function buildReply(intent: Intent, msg: Pick<Inbound, "platform" | "kind" | "senderName">, seo: SeoCatalog, cities: SeoCity[], origin = siteOrigin()): string | null {
  const hi = `Oi${firstName(msg.senderName)}! 👋`;
  if (intent.kind === "provider") {
    const profession = intent.serviceSlug ? seo.professions.find(p => p.serviceIds.some(id => seo.services.find(s => s.slug === intent.serviceSlug)?.serviceIds.includes(id))) : undefined;
    const path = profession && (intent.city ?? cities[0]) ? jobCityPath(profession, intent.city ?? cities[0]!, seo) : JOBS_BASE;
    const url = new URL(path, origin);
    url.searchParams.set("utm_source", msg.platform); url.searchParams.set("utm_medium", msg.kind === "comment" ? "comentario" : "mensagem"); url.searchParams.set("utm_campaign", "robo-redes");
    return `${hi} Que bom que você trabalha com eventos. No Eventos Conecta você recebe pedidos de clientes da sua região e fica com 100% do valor, sem comissão. Cadastre-se aqui: ${url.href}`;
  }
  if (intent.kind !== "client") return null;
  const service = intent.serviceSlug ? seo.services.find(s => s.slug === intent.serviceSlug) : undefined;
  const what = service ? ` para ${service.short}` : "";
  const where = intent.city ? ` em ${intent.city.name}` : "";
  const when = intent.date ? ` no dia ${brDate(intent.date)}` : "";
  return `${hi} Aqui é o Eventos Conecta. Peça seu orçamento grátis${what}${where}${when} neste link e receba propostas de profissionais da região, com contrato em PDF: ${quoteLink(intent, msg.platform, msg.kind, origin)}`;
}

/** IA opcional: quando as regras não acharam o serviço, pede para a IA classificar (só entre os serviços do site). */
async function refineWithAi(text: string, intent: Intent, seo: SeoCatalog, cities: SeoCity[]): Promise<Intent> {
  const { base, key, model } = copilotProvider();
  if (!base || !key || intent.kind === "none" && text.length < 12 || intent.serviceSlug) return intent;
  try {
    const system = `Classifique a mensagem de rede social de um marketplace de eventos. Responda SOMENTE JSON {"kind":"client"|"provider"|"none","service":um de ${JSON.stringify(seo.services.map(s => s.slug))} ou null,"city":um de ${JSON.stringify(cities.map(c => c.name))} ou null}. client = quer contratar; provider = profissional querendo trabalhar; none = outro assunto.`;
    const response = await fetch(resolveCopilotEndpoint(base), { method: "POST", signal: AbortSignal.timeout(12_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: text.slice(0, 600) }], ...(model.startsWith("gpt-5") ? {} : { temperature: 0 }) }) });
    if (!response.ok) return intent;
    const data = await response.json() as any;
    const raw = String(data?.choices?.[0]?.message?.content ?? "");
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const kind = ["client", "provider", "none"].includes(json.kind) ? json.kind : intent.kind;
    const service = seo.services.find(s => s.slug === json.service)?.slug;
    const city = intent.city ?? cities.find(c => c.name === json.city);
    return { ...intent, kind, ...(service ? { serviceSlug: service } : {}), ...(city ? { city } : {}), source: "ai" };
  } catch {
    return intent;
  }
}

async function graph(path: string, payload: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${GRAPH}/${path}`, { method: "POST", signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${pageToken()}` }, body: JSON.stringify(payload) });
    if (response.ok) return { ok: true };
    const data = await response.json().catch(() => ({})) as { error?: { message?: string; code?: number } };
    return { ok: false, error: `${data.error?.code ?? response.status}: ${data.error?.message ?? "erro da Meta"}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "falha de rede" };
  }
}

/** Envia a resposta no canal certo. Comentário: link no privado + resposta pública curta (link público se o privado falhar). */
async function deliver(msg: Inbound, text: string): Promise<{ ok: boolean; error?: string }> {
  if (msg.platform === "whatsapp") return sendWhatsappText(msg.senderId, text);
  if (!pageToken() || !pageId()) return { ok: false, error: "META_PAGE_ACCESS_TOKEN / META_PAGE_ID não configurados" };
  if (msg.kind === "dm") return graph(`${pageId()}/messages`, { recipient: { id: msg.senderId }, messaging_type: "RESPONSE", message: { text } });
  const privately = await graph(`${pageId()}/messages`, { recipient: { comment_id: msg.externalId }, message: { text } });
  const publicText = privately.ok ? `Oi${firstName(msg.senderName)}! Te mandei o link no direct 📩` : text;
  const publicly = await graph(msg.platform === "instagram" ? `${msg.externalId}/replies` : `${msg.externalId}/comments`, { message: publicText });
  return privately.ok || publicly.ok ? { ok: true } : { ok: false, error: privately.error ?? publicly.error };
}

export async function autoReplyEnabled(): Promise<boolean> {
  return (await getInternalFlag("social.autoReply").catch(() => null)) !== "false";
}

/** Processa uma mensagem: registra, entende a intenção e responde (uma vez a cada 12 h por pessoa). */
export async function handleInbound(msg: Inbound, now = new Date()) {
  const inserted = await execute("INSERT IGNORE INTO gc_social_inbox (platform, kind, externalId, senderId, senderName, text, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')", [msg.platform, msg.kind, msg.externalId.slice(0, 120), msg.senderId.slice(0, 80), (msg.senderName ?? "").slice(0, 160) || null, msg.text.slice(0, 2000)]);
  if (!inserted.affectedRows) return; // a Meta reenviou o mesmo evento
  const id = Number(inserted.insertId);
  const content = await getSiteContent();
  const cities = seoCitiesFrom(content);
  const seo = seoCatalogFrom(serviceCatalogFrom(content));
  let intent = detectIntent(msg.text, cities, seo.services, now);
  intent = await refineWithAi(msg.text, intent, seo, cities);
  const intentJson = JSON.stringify({ ...intent, city: intent.city?.name });
  const reply = buildReply(intent, msg, seo, cities);
  if (!reply) { await execute("UPDATE gc_social_inbox SET intent = ?, status = 'ignored' WHERE id = ?", [intentJson, id]); return; }
  if (!(await autoReplyEnabled())) { await execute("UPDATE gc_social_inbox SET intent = ?, reply = ?, status = 'paused' WHERE id = ?", [intentJson, reply, id]); return; }
  const recent = await query<any[]>("SELECT 1 FROM gc_social_inbox WHERE platform = ? AND senderId = ? AND status = 'replied' AND createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? HOUR) LIMIT 1", [msg.platform, msg.senderId, REPLY_COOLDOWN_HOURS]);
  if (recent[0]) { await execute("UPDATE gc_social_inbox SET intent = ?, reply = ?, status = 'cooldown' WHERE id = ?", [intentJson, reply, id]); return; }
  const sent = await deliver(msg, reply);
  await execute("UPDATE gc_social_inbox SET intent = ?, reply = ?, status = ?, error = ? WHERE id = ?", [intentJson, reply, sent.ok ? "replied" : "error", sent.error?.slice(0, 500) ?? null, id]);
}

// ------------------------------------------------------------------ rotas

const router = Router();

/** Verificação do webhook (a Meta chama ao salvar a URL de callback). */
router.get("/webhooks/meta", (req, res) => {
  const token = process.env.META_VERIFY_TOKEN;
  if (token && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === token) { res.type("text/plain").send(String(req.query["hub.challenge"] ?? "")); return; }
  res.sendStatus(403);
});

router.post("/webhooks/meta", (req: Request & { rawBody?: Buffer }, res) => {
  if (!validMetaSignature(req.rawBody, req.get("x-hub-signature-256") ?? undefined)) { res.sendStatus(401); return; }
  // Responde na hora (a Meta exige resposta rápida) e processa em seguida.
  res.sendStatus(200);
  if (!dbConfigured()) return;
  const messages = parseMetaWebhook(req.body, { pageId: pageId(), igUserId: igUserId() });
  setImmediate(() => { void (async () => { for (const m of messages) await handleInbound(m).catch(error => console.warn("[Redes] falha ao responder:", error instanceof Error ? error.message : error)); })(); });
});

router.get("/admin/social", wrap(async (req, res) => {
  await requireStaff(req);
  const rows = await query<any[]>("SELECT id, platform, kind, senderName, text, intent, reply, status, error, createdAt FROM gc_social_inbox ORDER BY id DESC LIMIT 100");
  const stats = await query<any[]>("SELECT status, COUNT(*) total FROM gc_social_inbox WHERE createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY) GROUP BY status");
  res.json({ ...socialStatus(), autoReply: await autoReplyEnabled(), stats: Object.fromEntries(stats.map(s => [s.status, Number(s.total)])), inbox: rows.map(r => ({ ...r, createdAt: new Date(r.createdAt).toISOString() })) });
}));

router.put("/admin/social/settings", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireStaff(req);
  const input = body(req, z.object({ autoReply: z.boolean() }));
  await setInternalFlag("social.autoReply", String(input.autoReply));
  await audit(ctx.user.id, "social.settings", input);
  res.json({ autoReply: input.autoReply });
}));

/** Simulador no painel: mostra o que o robô responderia (não envia nada). */
router.post("/admin/social/preview", wrap(async (req, res) => {
  assertOrigin(req);
  await requireStaff(req);
  const input = body(req, z.object({ text: z.string().trim().min(2).max(1000), platform: z.enum(["instagram", "facebook", "whatsapp"]).default("instagram") }));
  const content = await getSiteContent();
  const cities = seoCitiesFrom(content);
  const seo = seoCatalogFrom(serviceCatalogFrom(content));
  const intent = await refineWithAi(input.text, detectIntent(input.text, cities, seo.services), seo, cities);
  res.json({ intent: { ...intent, city: intent.city?.name }, reply: buildReply(intent, { platform: input.platform, kind: "dm" }, seo, cities) });
}));

router.use(errorHandler);

export function registerSocialRoutes(app: Express) {
  app.use("/api/gastro", router);
}
