// Indexação rápida: avisa os buscadores quando algo novo é publicado.
// - Google Indexing API (conta de serviço do Google Cloud; cota padrão de 200 avisos/dia).
// - IndexNow (Bing, Yandex, Seznam, Naver…): grátis, só precisa de uma chave.
// Os avisos entram numa fila, são agrupados e enviados a cada minuto; tudo fica registrado.
import { createSign } from "node:crypto";
import { Router, type Express } from "express";
import { z } from "zod";
import { assertOrigin, body, errorHandler, wrap } from "./http";
import { dbConfigured, execute, query } from "./db";
import { requireStaff, audit } from "./staff";
import { getSiteContent } from "./content";
import { loadDetails } from "./profiles";
import { DEFAULT_ORIGIN, cityPath, jobCityPath, normalizeCityName, seoCatalogFrom, seoCitiesFrom, serviceCityPath, type SeoCity } from "@shared/seo";
import { serviceCatalogFrom } from "@shared/services";

type GoogleCredentials = { client_email: string; private_key: string };
type Pending = { url: string; type: "URL_UPDATED" | "URL_DELETED"; google: boolean };

const GOOGLE_DAILY_QUOTA = Math.max(1, Number(process.env.GOOGLE_INDEXING_DAILY_QUOTA ?? 200));
const INDEXNOW_ENDPOINT = process.env.INDEXNOW_ENDPOINT || "https://api.indexnow.org/indexnow";

export function siteOrigin(): string {
  const env = process.env.GASTRO_PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");
  return env && /^https:\/\//.test(env) ? env : DEFAULT_ORIGIN;
}
const absolute = (path: string) => new URL(path, siteOrigin()).href;

/** GOOGLE_INDEXING_CREDENTIALS: o JSON da conta de serviço (inteiro, ou em base64). */
export function googleCredentials(): GoogleCredentials | null {
  const raw = process.env.GOOGLE_INDEXING_CREDENTIALS?.trim();
  if (!raw) return null;
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const json = JSON.parse(text);
    if (typeof json.client_email !== "string" || typeof json.private_key !== "string") return null;
    return { client_email: json.client_email, private_key: json.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

/** INDEXNOW_KEY: 8 a 128 letras/números (você inventa). O arquivo /<chave>.txt é servido automaticamente. */
export function indexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim() ?? "";
  return /^[a-zA-Z0-9-]{8,128}$/.test(key) ? key : null;
}

export const indexingStatus = () => ({ google: Boolean(googleCredentials()), indexNow: Boolean(indexNowKey()), googleDailyQuota: GOOGLE_DAILY_QUOTA });

// ------------------------------------------------------------------ Google: token OAuth da conta de serviço (JWT RS256, sem dependências)

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");
let cachedToken: { value: string; expiresAt: number } | null = null;

export function signServiceAccountJwt(creds: GoogleCredentials, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: creds.client_email, scope: "https://www.googleapis.com/auth/indexing", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(creds.private_key))}`;
}

async function googleAccessToken(creds: GoogleCredentials): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signServiceAccountJwt(creds) }),
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(`Google OAuth: ${data.error_description ?? response.status}`);
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

async function googleSentToday(): Promise<number> {
  const rows = await query<any[]>("SELECT COUNT(*) total FROM gc_index_log WHERE engine = 'google' AND createdAt >= CURRENT_DATE");
  return Number(rows[0]?.total ?? 0);
}

async function log(url: string, engine: string, type: string, status: string, detail = "") {
  await execute("INSERT INTO gc_index_log (url, engine, type, status, detail) VALUES (?, ?, ?, ?, ?)", [url.slice(0, 500), engine, type, status.slice(0, 20), detail.slice(0, 500)]).catch(() => undefined);
}

async function sendGoogle(items: Pending[]) {
  const creds = googleCredentials();
  if (!creds || !items.length) return;
  let room = GOOGLE_DAILY_QUOTA - await googleSentToday();
  if (room <= 0) { for (const it of items) await log(it.url, "google", it.type, "skipped", "cota diária atingida"); return; }
  let token: string;
  try { token = await googleAccessToken(creds); } catch (error) { for (const it of items) await log(it.url, "google", it.type, "error", String(error instanceof Error ? error.message : error)); return; }
  for (const it of items) {
    if (room-- <= 0) { await log(it.url, "google", it.type, "skipped", "cota diária atingida"); continue; }
    try {
      const response = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ url: it.url, type: it.type }), signal: AbortSignal.timeout(15_000) });
      const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
      await log(it.url, "google", it.type, response.ok ? "ok" : "error", response.ok ? "" : data.error?.message ?? String(response.status));
    } catch (error) {
      await log(it.url, "google", it.type, "error", error instanceof Error ? error.message : "falha de rede");
    }
  }
}

async function sendIndexNow(urls: string[]) {
  const key = indexNowKey();
  if (!key || !urls.length) return;
  const host = new URL(siteOrigin()).host;
  for (let i = 0; i < urls.length; i += 10_000) {
    const batch = urls.slice(i, i + 10_000);
    try {
      const response = await fetch(INDEXNOW_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, signal: AbortSignal.timeout(20_000), body: JSON.stringify({ host, key, keyLocation: absolute(`/${key}.txt`), urlList: batch }) });
      // 200/202 = aceito. 422 = URLs não pertencem ao domínio; 403 = chave não encontrada no site.
      for (const url of batch) await log(url, "indexnow", "URL_UPDATED", response.ok ? "ok" : "error", response.ok ? "" : `HTTP ${response.status}`);
    } catch (error) {
      for (const url of batch) await log(url, "indexnow", "URL_UPDATED", "error", error instanceof Error ? error.message : "falha de rede");
    }
  }
}

// ------------------------------------------------------------------ fila

const queue = new Map<string, Pending>();
let timer: NodeJS.Timeout | null = null;

/**
 * Coloca endereços na fila de indexação. "google: false" manda só para o IndexNow
 * (útil para listas grandes, por causa da cota diária do Google).
 */
export function queueIndexing(paths: string[], options: { type?: "URL_UPDATED" | "URL_DELETED"; google?: boolean } = {}) {
  const status = indexingStatus();
  if (!dbConfigured() || (!status.google && !status.indexNow)) return;
  for (const path of paths) {
    const url = absolute(path);
    const prev = queue.get(url);
    queue.set(url, { url, type: options.type ?? "URL_UPDATED", google: (options.google ?? true) || Boolean(prev?.google) });
  }
  if (!timer) { timer = setTimeout(() => { timer = null; void flushIndexing(); }, 60_000); timer.unref(); }
}

export async function flushIndexing() {
  const items = [...queue.values()];
  queue.clear();
  if (!items.length) return;
  await sendGoogle(items.filter(i => i.google));
  await sendIndexNow(items.filter(i => i.type === "URL_UPDATED").map(i => i.url));
}

// ------------------------------------------------------------------ gatilhos

const providerCity = (details: any, cities: SeoCity[]): SeoCity | undefined => {
  const name = normalizeCityName(String(details?.city ?? ""));
  return name ? cities.find(c => normalizeCityName(c.name) === name && (!details?.state || c.uf === String(details.state).toUpperCase())) : undefined;
};

/** Profissional ficou visível (aprovado, pagou ou ganhou teste): perfil + páginas da cidade dele. */
export async function indexProvider(userId: number) {
  const content = await getSiteContent();
  const cities = seoCitiesFrom(content);
  const seo = seoCatalogFrom(serviceCatalogFrom(content));
  const { details } = await loadDetails(userId);
  const city = providerCity(details, cities);
  const services: string[] = Array.isArray(details?.services) ? details.services : [];
  const paths = [`/profissionais/user-${userId}`];
  if (city) {
    paths.push(cityPath(city));
    for (const s of seo.services) if (s.serviceIds.some(id => services.includes(id))) paths.push(serviceCityPath(s, city));
    for (const p of seo.professions) if (p.serviceIds.some(id => services.includes(id))) paths.push(jobCityPath(p, city, seo));
  }
  queueIndexing(paths);
}

/** Perfil removido (conta excluída ou saiu do catálogo de vez). */
export const unindexProvider = (userId: number) => queueIndexing([`/profissionais/user-${userId}`], { type: "URL_DELETED" });

/** Serviços novos no catálogo: página geral para o Google; páginas por cidade para todos os buscadores via IndexNow. */
export async function indexNewServices(previous: ReturnType<typeof seoCatalogFrom>, next: ReturnType<typeof seoCatalogFrom>) {
  const cities = seoCitiesFrom(await getSiteContent());
  const oldServices = new Set(previous.services.map(s => s.slug));
  const oldJobs = new Set(previous.professions.map(p => p.slug));
  for (const s of next.services.filter(x => !oldServices.has(x.slug))) {
    queueIndexing([`/servicos/${s.slug}`, ...cities.slice(0, 3).map(c => serviceCityPath(s, c))]);
    queueIndexing(cities.slice(3).map(c => serviceCityPath(s, c)), { google: false });
  }
  for (const p of next.professions.filter(x => !oldJobs.has(x.slug))) {
    queueIndexing([`/trabalhe-como/${p.slug}`]);
    queueIndexing(cities.map(c => jobCityPath(p, c, next)), { google: false });
  }
}

// ------------------------------------------------------------------ rotas

const router = Router();

export function registerIndexingRoutes(app: Express) {
  // Arquivo de verificação do IndexNow: /<INDEXNOW_KEY>.txt
  app.get(/^\/([a-zA-Z0-9-]{8,128})\.txt$/, (req, res, next) => {
    const key = indexNowKey();
    if (!key || req.params[0] !== key) return next();
    res.type("text/plain").set("Cache-Control", "public, max-age=86400").send(key);
  });
  app.use("/api/gastro", router);
}

router.get("/admin/indexing", wrap(async (req, res) => {
  await requireStaff(req);
  // Lista: Google primeiro (são poucos) e os últimos envios do IndexNow, para o Google não sumir no meio de mil linhas.
  const google = await query<any[]>("SELECT url, engine, type, status, detail, createdAt FROM gc_index_log WHERE engine = 'google' ORDER BY id DESC LIMIT 50");
  const others = await query<any[]>("SELECT url, engine, type, status, detail, createdAt FROM gc_index_log WHERE engine <> 'google' ORDER BY id DESC LIMIT 50");
  const today = await query<any[]>("SELECT status, COUNT(*) total FROM gc_index_log WHERE engine = 'google' AND createdAt >= CURRENT_DATE GROUP BY status");
  const lastError = await query<any[]>("SELECT detail FROM gc_index_log WHERE engine = 'google' AND status = 'error' AND createdAt >= CURRENT_DATE ORDER BY id DESC LIMIT 1");
  const count = (status: string) => Number(today.find(r => r.status === status)?.total ?? 0);
  res.json({ ...indexingStatus(), googleSentToday: await googleSentToday(), googleToday: { ok: count("ok"), error: count("error"), skipped: count("skipped"), lastError: lastError[0]?.detail ?? "" }, queued: queue.size, log: [...google, ...others].map(r => ({ ...r, createdAt: new Date(r.createdAt).toISOString() })) });
}));

/** Envia todas as páginas do site: IndexNow recebe tudo; o Google, as mais importantes (por causa da cota). */
router.post("/admin/indexing/submit", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireStaff(req);
  const input = body(req, z.object({ scope: z.enum(["all", "main"]).default("main") }));
  const content = await getSiteContent();
  const cities = seoCitiesFrom(content);
  const seo = seoCatalogFrom(serviceCatalogFrom(content));
  const main = ["/", "/profissionais", "/servicos", "/trabalhe-como", "/para-profissionais", ...cities.slice(0, 5).map(cityPath)];
  queueIndexing(main);
  if (input.scope === "all") {
    const { seoPaths } = await import("@shared/seo");
    queueIndexing(seoPaths(cities, seo), { google: false });
  }
  await flushIndexing();
  await audit(ctx.user.id, "indexing.submit", { scope: input.scope });
  res.json({ ok: true });
}));

router.use(errorHandler);
