// Engajamento: notificações (sino do painel e configurações), link de acesso automático,
// métricas de marketing (visitas, buscas, origem dos cadastros) com pontos críticos e sugestões,
// valor da assinatura e benefícios extras pagos pelos profissionais.
import { Router, type Express, type Request } from "express";
import { z } from "zod";
import { HttpError } from "@shared/_core/errors";
import { CHANNEL_LABELS, isChannel, isMedium, MEDIUM_LABELS, type Channel, type Medium } from "@shared/marketing";
import { paymentDescription, paymentReference, subscriberCode } from "@shared/payments";
import { assertOrigin, body, clientIp, errorHandler, limit, parse, wrap } from "./http";
import { dbConfigured, execute, query } from "./db";
import { createGcSession, gcCookieOptions, isOwner, requireAuth, type AuthContext } from "./auth";
import { consumeMagicLink, notifySettingsStatus, rememberOrigin, saveNotifySettings, sendWhatsapp, whatsappConfigured } from "./notify";
import { sendMail } from "./password";
import { getSiteContent } from "./content";
import { copilotProvider, resolveCopilotEndpoint } from "./routes";
import { priceFor, saveBasePrice, subscriptionBasePrice, webhookUrl } from "./subscriptions";
import { createPixPayment, mpConfigured } from "./mercadopago";

const router = Router();
const idSchema = z.coerce.number().int().positive();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TZ = "America/Sao_Paulo";

router.use((req, _res, next) => { rememberOrigin(req); next(); });

// ------------------------------------------------------------------ link de acesso (WhatsApp → site já logado)

router.get("/l/:token", wrap(async (req, res) => {
  const fallback = "/conta";
  if (!dbConfigured()) { res.redirect(302, fallback); return; }
  limit(`magic:${clientIp(req)}`, 30, 15 * 60_000);
  const found = await consumeMagicLink(String(req.params.token));
  if (!found) { res.redirect(302, `${fallback}?link=expirado`); return; }
  const token = await createGcSession(found.userId);
  res.cookie("gc_session", token, gcCookieOptions(req));
  res.redirect(302, found.path);
}));

router.use((req, _res, next) => { if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertOrigin(req); next(); });

function requireDb() {
  if (!dbConfigured()) throw new HttpError(503, "Banco de dados não configurado (DATABASE_URL)");
}
async function adminCtx(req: Request): Promise<AuthContext> {
  requireDb();
  const context = await requireAuth(req);
  if (!(await isOwner(context))) throw new HttpError(403, "Acesso reservado à administração");
  return context;
}
async function audit(actorId: number, action: string, details: unknown, targetId?: number) {
  await execute("INSERT INTO gastro_audit_logs (action, details, actorId, targetId) VALUES (?, ?, ?, ?)", [action, JSON.stringify(details).slice(0, 60000), actorId, targetId ?? null]);
}
const mapNotification = (row: any) => ({ id: Number(row.id), type: row.type, title: row.title, body: row.body ?? "", link: row.link ?? "", read: Boolean(row.readAt), createdAt: new Date(row.createdAt).toISOString() });

// ------------------------------------------------------------------ sino de notificações

router.get("/notifications", wrap(async (req, res) => {
  requireDb();
  const context = await requireAuth(req);
  const rows = await query<any[]>("SELECT * FROM gc_notifications WHERE audience = 'user' AND userId = ? ORDER BY id DESC LIMIT 50", [context.user.id]);
  res.json({ notifications: rows.map(mapNotification), unread: rows.filter(r => !r.readAt).length });
}));

router.post("/notifications/read", wrap(async (req, res) => {
  requireDb();
  const context = await requireAuth(req);
  await execute("UPDATE gc_notifications SET readAt = CURRENT_TIMESTAMP WHERE audience = 'user' AND userId = ? AND readAt IS NULL", [context.user.id]);
  res.json({ ok: true });
}));

router.get("/admin/notifications", wrap(async (req, res) => {
  await adminCtx(req);
  const rows = await query<any[]>("SELECT * FROM gc_notifications WHERE audience = 'admin' ORDER BY id DESC LIMIT 200");
  const unread = await query<any[]>("SELECT COUNT(*) total FROM gc_notifications WHERE audience = 'admin' AND readAt IS NULL");
  res.json({ notifications: rows.map(mapNotification), unread: Number(unread[0]?.total ?? 0) });
}));

router.post("/admin/notifications/read", wrap(async (req, res) => {
  await adminCtx(req);
  await execute("UPDATE gc_notifications SET readAt = CURRENT_TIMESTAMP WHERE audience = 'admin' AND readAt IS NULL");
  res.json({ ok: true });
}));

router.get("/admin/notifications/settings", wrap(async (req, res) => {
  await adminCtx(req);
  res.json(notifySettingsStatus());
}));

router.put("/admin/notifications/settings", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const input = body(req, z.object({
    waToken: z.string().trim().max(600).optional(), waPhoneNumberId: z.string().trim().regex(/^\d{0,30}$/, "ID do número: só números").optional(),
    waTemplate: z.string().trim().regex(/^[a-z0-9_]{0,120}$/, "Nome do modelo: letras minúsculas, números e _").optional(), waLang: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, "Idioma inválido (ex.: pt_BR)").optional(),
    adminEmails: z.string().trim().max(400).optional(), adminEmailOn: z.boolean().optional(), adminWhatsappOn: z.boolean().optional(),
  }).strict());
  const { adminEmailOn, adminWhatsappOn, ...text } = input;
  await saveNotifySettings({ ...text, ...(adminEmailOn !== undefined ? { adminEmailOn: String(adminEmailOn) } : {}), ...(adminWhatsappOn !== undefined ? { adminWhatsappOn: String(adminWhatsappOn) } : {}) });
  await audit(context.user.id, "admin.notify_settings", { ...input, waToken: input.waToken !== undefined ? "alterado" : undefined });
  res.json(notifySettingsStatus());
}));

router.post("/admin/notifications/test", wrap(async (req, res) => {
  const context = await adminCtx(req);
  limit(`notify-test:${context.user.id}`, 10, HOUR);
  const content = await getSiteContent();
  const status = notifySettingsStatus();
  const whatsapp = whatsappConfigured() ? await sendWhatsapp(content["contact.whatsapp"] ?? "", "Teste do GastroConecta", "Se você recebeu esta mensagem, os avisos por WhatsApp estão funcionando.", `${status.origin}/admin/painel`) : false;
  const email = context.user.email ? await sendMail(context.user.email, "[GastroConecta] Teste de notificação", "<p>Os avisos por e-mail estão funcionando.</p>") : false;
  res.json({ whatsapp, email });
}));

// ------------------------------------------------------------------ rastreio (público, sem dados pessoais)

const trackSchema = z.object({ visitorId: z.string().regex(/^[\w-]{8,40}$/), source: z.string().max(40), medium: z.string().max(40), campaign: z.string().max(120).optional(), referrer: z.string().max(200).optional(), path: z.string().max(200).optional() });
router.post("/track/visit", wrap(async (req, res) => {
  res.json({ ok: true });
  if (!dbConfigured()) return;
  try { limit(`track:${clientIp(req)}`, 60, HOUR); } catch { return; }
  const parsed = trackSchema.safeParse(req.body);
  if (!parsed.success) return;
  const v = parsed.data;
  let referrerHost = "";
  try { referrerHost = v.referrer ? new URL(v.referrer).hostname : ""; } catch { referrerHost = ""; }
  await execute("INSERT INTO gc_visits (visitorId, source, medium, campaign, referrer, path) VALUES (?, ?, ?, ?, ?, ?)", [v.visitorId, isChannel(v.source) ? v.source : "outros", isMedium(v.medium) ? v.medium : "organico", v.campaign ?? null, referrerHost.slice(0, 200) || null, (v.path ?? "/").split("?")[0].slice(0, 200)]).catch(() => undefined);
}));

router.post("/track/search", wrap(async (req, res) => {
  res.json({ ok: true });
  if (!dbConfigured()) return;
  try { limit(`search:${clientIp(req)}`, 120, HOUR); } catch { return; }
  const parsed = z.object({ term: z.string().trim().max(120).optional(), category: z.string().trim().max(80).optional(), city: z.string().trim().max(120).optional() }).safeParse(req.body);
  if (!parsed.success) return;
  const { term, category, city } = parsed.data;
  if (!term && !category && !city) return;
  await execute("INSERT INTO gc_searches (term, category, city) VALUES (?, ?, ?)", [term?.toLowerCase() || null, category || null, city || null]).catch(() => undefined);
}));

// ------------------------------------------------------------------ marketing: crescimento, pontos críticos e sugestões

const local = (value: unknown) => {
  const d = new Date(value as string);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" }).formatToParts(d).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday) };
};
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const cityKey = (city: unknown) => String(city ?? "").split(/[-,/]/)[0].trim().toLowerCase();
const top = <T,>(map: Map<T, number>, n: number) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

export async function marketingReport(days: number) {
  const since = new Date(Date.now() - days * DAY);
  const prevSince = new Date(Date.now() - 2 * days * DAY);
  const [visits, users, events, proposals, payments, searches, providers, pendingApprovals, staleEvents] = await Promise.all([
    query<any[]>("SELECT visitorId, source, medium, campaign, createdAt FROM gc_visits WHERE createdAt >= ? ORDER BY id DESC LIMIT 100000", [prevSince]),
    query<any[]>("SELECT u.id, u.createdAt, p.accountType, p.signupSource, p.signupMedium, p.signupCampaign, p.referredBy FROM users u JOIN account_profiles p ON p.userId = u.id WHERE u.role <> 'admin' AND u.createdAt >= ?", [prevSince]),
    query<any[]>("SELECT id, createdAt, city, category, details, status FROM gastro_events WHERE createdAt >= ?", [prevSince]),
    query<any[]>("SELECT createdAt, status FROM gastro_proposals WHERE createdAt >= ?", [since]),
    query<any[]>("SELECT amountCents, approvedAt, purpose FROM gc_subscription_payments WHERE status = 'approved' AND approvedAt >= ? AND amountCents > 0", [since]),
    query<any[]>("SELECT term, category, city FROM gc_searches WHERE createdAt >= ? LIMIT 50000", [since]),
    query<any[]>("SELECT p.city FROM account_profiles p WHERE p.accountType = 'provider' AND p.status = 'active'"),
    query<any[]>("SELECT COUNT(*) total FROM account_profiles p JOIN gc_profile_details d ON d.userId = p.userId AND d.completedAt IS NOT NULL WHERE p.accountType = 'provider' AND p.status = 'pending'"),
    query<any[]>("SELECT COUNT(*) total FROM gastro_events e WHERE e.status = 'open' AND e.createdAt < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 DAY) AND NOT EXISTS (SELECT 1 FROM gastro_proposals p WHERE p.eventId = e.id)"),
  ]);
  const inWindow = (row: any, field = "createdAt") => new Date(row[field]) >= since;
  const cur = { visits: visits.filter(r => inWindow(r)), users: users.filter(r => inWindow(r)), events: events.filter(r => inWindow(r)) };
  const prev = { visits: visits.length - cur.visits.length, users: users.length - cur.users.length, events: events.length - cur.events.length };

  // Série diária
  const daysList: string[] = [];
  for (let i = days - 1; i >= 0; i--) daysList.push(local(new Date(Date.now() - i * DAY)).day);
  const series = new Map(daysList.map(d => [d, { day: d, visits: 0, clients: 0, providers: 0, requests: 0, proposals: 0, revenueCents: 0 }]));
  for (const r of cur.visits) { const s = series.get(local(r.createdAt).day); if (s) s.visits++; }
  for (const r of cur.users) { const s = series.get(local(r.createdAt).day); if (s) r.accountType === "provider" ? s.providers++ : s.clients++; }
  for (const r of cur.events) { const s = series.get(local(r.createdAt).day); if (s) s.requests++; }
  for (const r of proposals) { const s = series.get(local(r.createdAt).day); if (s) s.proposals++; }
  for (const r of payments) { const s = series.get(local(r.approvedAt).day); if (s) s.revenueCents += Number(r.amountCents); }

  // Origem: visitas e cadastros por canal e tipo (pago/orgânico/indicação)
  const sourceKey = (source: unknown, medium: unknown) => `${isChannel(source) ? source : "direto"}|${isMedium(medium) ? medium : "direto"}`;
  const sources = new Map<string, { channel: Channel; medium: Medium; visits: number; visitors: Set<string>; clients: number; providers: number }>();
  const bucket = (key: string) => {
    if (!sources.has(key)) { const [channel, medium] = key.split("|") as [Channel, Medium]; sources.set(key, { channel, medium, visits: 0, visitors: new Set(), clients: 0, providers: 0 }); }
    return sources.get(key)!;
  };
  for (const r of cur.visits) { const b = bucket(sourceKey(r.source, r.medium)); b.visits++; b.visitors.add(r.visitorId); }
  for (const r of cur.users) { const b = bucket(sourceKey(r.signupSource, r.signupMedium)); r.accountType === "provider" ? b.providers++ : b.clients++; }
  const sourceRows = [...sources.values()].map(b => ({ channel: b.channel, channelLabel: CHANNEL_LABELS[b.channel], medium: b.medium, mediumLabel: MEDIUM_LABELS[b.medium], visits: b.visits, visitors: b.visitors.size, clients: b.clients, providers: b.providers, conversion: b.visitors.size ? Math.round(((b.clients + b.providers) / b.visitors.size) * 1000) / 10 : 0 })).sort((a, b) => b.visits + (b.clients + b.providers) * 20 - (a.visits + (a.clients + a.providers) * 20));
  const campaigns = new Map<string, number>();
  for (const r of cur.visits) if (r.campaign) campaigns.set(r.campaign, (campaigns.get(r.campaign) ?? 0) + 1);
  const referrals = cur.users.filter(r => r.referredBy).length;

  // Horários e dias
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, visits: 0, requests: 0 }));
  const weekdays = WEEKDAYS.map((name, index) => ({ index, name, visits: 0, requests: 0 }));
  for (const r of cur.visits) { const l = local(r.createdAt); hours[l.hour].visits++; if (l.weekday >= 0) weekdays[l.weekday].visits++; }
  for (const r of cur.events) { const l = local(r.createdAt); hours[l.hour].requests++; if (l.weekday >= 0) weekdays[l.weekday].requests++; }

  // O que as pessoas procuram
  const terms = new Map<string, number>(), categories = new Map<string, number>(), searchedCities = new Map<string, number>();
  for (const s of searches) {
    if (s.term) terms.set(s.term, (terms.get(s.term) ?? 0) + 1);
    if (s.category) categories.set(s.category, (categories.get(s.category) ?? 0) + 1);
    if (s.city) searchedCities.set(cityKey(s.city), (searchedCities.get(cityKey(s.city)) ?? 0) + 1);
  }
  const requested = new Map<string, number>();
  for (const e of cur.events) { let d: any = {}; try { d = JSON.parse(e.details ?? "{}"); } catch { d = {}; } const name = d.serviceLabel || d.serviceCategoryName || e.category; requested.set(name, (requested.get(name) ?? 0) + 1); }

  // Oferta x demanda por cidade
  const supply = new Map<string, number>();
  for (const p of providers) { const k = cityKey(p.city); if (k) supply.set(k, (supply.get(k) ?? 0) + 1); }
  const demand = new Map<string, number>();
  for (const e of cur.events) { const k = cityKey(e.city); if (k) demand.set(k, (demand.get(k) ?? 0) + 1); }
  for (const [k, n] of searchedCities) demand.set(k, (demand.get(k) ?? 0) + n * 0.25);
  const cities = top(demand, 12).map(([city, n]) => ({ city, demand: Math.round(n), providers: supply.get(city) ?? 0 }));

  // Totais
  const visitors = new Set(cur.visits.map(r => r.visitorId)).size;
  const signups = cur.users.length;
  const totals = {
    visits: cur.visits.length, visitors, clients: cur.users.filter(r => r.accountType !== "provider").length, providers: cur.users.filter(r => r.accountType === "provider").length,
    requests: cur.events.length, proposals: proposals.length, closed: cur.events.filter(e => e.status === "booked" || e.status === "completed").length,
    revenueCents: payments.reduce((s, p) => s + Number(p.amountCents), 0), signupConversion: visitors ? Math.round((signups / visitors) * 1000) / 10 : 0, referrals,
    growth: { visits: pct(cur.visits.length, prev.visits), signups: pct(signups, prev.users), requests: pct(cur.events.length, prev.events) },
  };

  // Pontos críticos e sugestões automáticas
  const critical: Array<{ level: "alto" | "medio"; title: string; detail: string }> = [];
  const suggestions: Array<{ area: string; title: string; detail: string }> = [];
  const pending = Number(pendingApprovals[0]?.total ?? 0);
  const stale = Number(staleEvents[0]?.total ?? 0);
  if (pending) critical.push({ level: "alto", title: `${pending} profissional(is) esperando aprovação`, detail: "Cadastros completos parados: aprove em até 24h para não perder fornecedores." });
  if (stale) critical.push({ level: "alto", title: `${stale} pedido(s) sem nenhuma proposta há mais de 2 dias`, detail: "Cliente sem resposta desiste. Chame profissionais da categoria pelo WhatsApp ou recrute novos na cidade do pedido." });
  for (const c of cities.filter(c => c.demand >= 2 && c.providers === 0).slice(0, 3)) critical.push({ level: "alto", title: `Procura em ${titleCase(c.city)} sem profissionais`, detail: `${c.demand} pedido(s)/busca(s) e nenhum profissional ativo na cidade. Faça uma campanha para atrair fornecedores lá.` });
  if (visitors >= 50 && totals.signupConversion < 2) critical.push({ level: "medio", title: `Conversão baixa: ${totals.signupConversion}% dos visitantes se cadastram`, detail: "Reforce a chamada “Peça seu orçamento grátis” na página inicial e nas promoções; revise as páginas de entrada dos anúncios." });
  if (totals.growth.signups !== null && totals.growth.signups <= -20) critical.push({ level: "medio", title: `Cadastros caíram ${Math.abs(totals.growth.signups)}% em relação ao período anterior`, detail: "Veja qual canal perdeu força na tabela de origens e reative as publicações ou o anúncio." });
  if (totals.growth.requests !== null && totals.growth.requests <= -20) critical.push({ level: "medio", title: `Pedidos de orçamento caíram ${Math.abs(totals.growth.requests)}%`, detail: "Lance uma promoção da temporada e divulgue os fornecedores participantes." });
  const channelTotals = new Map<Channel, number>();
  for (const s of sourceRows) channelTotals.set(s.channel, (channelTotals.get(s.channel) ?? 0) + s.visits);
  const totalVisits = cur.visits.length || 1;
  const [mainChannel, mainVisits] = top(channelTotals, 1)[0] ?? ["direto", 0];
  if (cur.visits.length >= 50 && mainVisits / totalVisits > 0.7 && mainChannel !== "direto") critical.push({ level: "medio", title: `Dependência de um canal: ${Math.round((mainVisits / totalVisits) * 100)}% das visitas vêm de ${CHANNEL_LABELS[mainChannel]}`, detail: "Distribua o investimento: teste outro canal (orgânico ou patrocinado) para não depender de um só." });

  const bestHours = [...hours].sort((a, b) => (b.visits + b.requests * 10) - (a.visits + a.requests * 10)).filter(h => h.visits + h.requests > 0).slice(0, 3).map(h => `${String(h.hour).padStart(2, "0")}h`);
  const bestDay = [...weekdays].sort((a, b) => (b.visits + b.requests * 10) - (a.visits + a.requests * 10))[0];
  if (bestHours.length) suggestions.push({ area: "Orgânico", title: `Publique perto das ${bestHours.join(", ")}${bestDay && bestDay.visits + bestDay.requests > 0 ? ` (melhor dia: ${bestDay.name})` : ""}`, detail: "São os horários com mais visitas e pedidos. Poste Reels/Stories dos profissionais e das promoções logo antes desses horários." });
  else suggestions.push({ area: "Orgânico", title: "Comece a medir: use os links com etiqueta (UTM) abaixo", detail: "Coloque o link marcado na bio do Instagram, nas postagens e nos anúncios para saber de onde vem cada cliente." });
  const topTerms = top(terms, 5).map(([t]) => t);
  const topReq = top(requested, 3).map(([t]) => t);
  if (topTerms.length || topReq.length) suggestions.push({ area: "Google (patrocinado)", title: `Palavras-chave para anunciar: ${[...topReq, ...topTerms].slice(0, 6).join(", ")}`, detail: "Crie um grupo de anúncios no Google Ads com esses termos + o nome da cidade (ex.: “chef para jantar em Campinas”) apontando para /orcamento." });
  const bestSource = sourceRows.filter(s => s.visitors >= 10).sort((a, b) => b.conversion - a.conversion)[0];
  if (bestSource) suggestions.push({ area: "Investimento", title: `Melhor conversão: ${bestSource.channelLabel} (${bestSource.mediumLabel.toLowerCase()}) com ${bestSource.conversion}%`, detail: "Coloque mais verba ou mais publicações neste canal; ele traz cadastros com menos visitas." });
  const fb = channelTotals.get("facebook") ?? 0, ig = channelTotals.get("instagram") ?? 0;
  if (ig + fb === 0) suggestions.push({ area: "Meta (Facebook/Instagram)", title: "Ainda não há visitas vindas do Instagram/Facebook", detail: "Publique fotos dos trabalhos dos profissionais (com permissão) e faça um impulsionamento local de baixo valor com o link marcado." });
  const shortCity = cities.find(c => c.providers === 0 && c.demand >= 1);
  if (shortCity) suggestions.push({ area: "Fornecedores", title: `Recrute profissionais em ${titleCase(shortCity.city)}`, detail: "Anúncio no Instagram/Facebook para chefs, garçons e diaristas da cidade: “Receba pedidos sem comissão”, apontando para /para-profissionais." });
  suggestions.push({ area: "Indicação", title: referrals ? `${referrals} cadastro(s) vieram de indicação — continue incentivando` : "Ative a divulgação pelos próprios usuários", detail: "Cada profissional e cliente tem um link de divulgação no painel. Incentive os fornecedores a postar o próprio perfil; um bônus para quem mais indicar acelera o boca a boca." });
  if (totals.requests && totals.proposals / Math.max(1, totals.requests) < 1) suggestions.push({ area: "Fornecedores", title: "Poucos profissionais respondendo aos pedidos", detail: "Os avisos por WhatsApp aos profissionais aumentam a resposta; confirme as chaves em Notificações e lembre os fornecedores de olhar o radar." });

  return {
    days, totals, series: [...series.values()], sources: sourceRows, campaigns: top(campaigns, 8).map(([name, count]) => ({ name, count })),
    hours, weekdays, terms: top(terms, 12).map(([term, count]) => ({ term, count })), categories: top(categories, 8).map(([name, count]) => ({ name, count })),
    requested: top(requested, 8).map(([name, count]) => ({ name, count })), cities, critical, suggestions,
  };
}
function pct(current: number, previous: number): number | null { return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null; }
const titleCase = (text: string) => text.replace(/\b\p{L}/gu, c => c.toUpperCase());

router.get("/admin/marketing", wrap(async (req, res) => {
  await adminCtx(req);
  const days = parse(z.coerce.number().int().refine(v => [7, 30, 90].includes(v)).default(30), req.query.dias ?? 30);
  res.json(await marketingReport(days));
}));

/** Plano de marketing gerado pela IA a partir dos números reais (inteligência autônoma). */
router.post("/admin/marketing/ai", wrap(async (req, res) => {
  const context = await adminCtx(req);
  limit(`marketing-ai:${context.user.id}`, 10, HOUR, "Muitos pedidos à IA; aguarde um pouco");
  const { base, key, model } = copilotProvider();
  if (!base || !key) throw new HttpError(503, "IA não configurada no servidor (OPENAI_API_KEY). As sugestões automáticas acima continuam funcionando.");
  const report = await marketingReport(30);
  const summary = { totals: report.totals, sources: report.sources.slice(0, 10), bestHours: report.hours.filter(h => h.visits + h.requests > 0).sort((a, b) => b.visits - a.visits).slice(0, 5), weekdays: report.weekdays, terms: report.terms, requested: report.requested, cities: report.cities, critical: report.critical };
  const system = "Você é o estrategista de marketing do GastroConecta, plataforma que conecta clientes (grátis) a chefs, garçons, barmans, limpeza e jardinagem (profissionais pagam assinatura fixa, sem comissão). Responda em português do Brasil, em tópicos curtos e práticos. Use somente os números recebidos; não invente dados. Entregue: 1) diagnóstico em 3 linhas; 2) plano orgânico da semana (Instagram/Facebook/Google Meu Negócio) com dias e horários; 3) plano patrocinado (Google Ads e Meta Ads) com público, palavras-chave, verba inicial sugerida e página de destino; 4) ações para atrair fornecedores; 5) ações para clientes e fornecedores divulgarem a plataforma; 6) 3 métricas para acompanhar.";
  const response = await fetch(resolveCopilotEndpoint(base), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(45_000), body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: `Dados dos últimos 30 dias: ${JSON.stringify(summary)}` }], ...(model.startsWith("gpt-5") ? {} : { temperature: 0.4 }) }) }).catch(() => null);
  if (!response?.ok) throw new HttpError(503, "A IA não respondeu agora. Tente de novo em instantes.");
  const data = await response.json().catch(() => null) as any;
  const plan = data?.choices?.[0]?.message?.content;
  if (typeof plan !== "string" || !plan.trim()) throw new HttpError(503, "A IA retornou uma resposta vazia.");
  res.json({ plan: plan.trim().slice(0, 12000) });
}));

// ------------------------------------------------------------------ valor da assinatura (igual para todos) e cortesias

router.get("/admin/payments/pricing", wrap(async (req, res) => {
  await adminCtx(req);
  const special = await query<any[]>("SELECT u.id, u.name, u.email, p.discountPercent, p.subscriptionFree FROM users u JOIN account_profiles p ON p.userId = u.id WHERE p.accountType = 'provider' AND p.status <> 'deleted' ORDER BY u.name ASC LIMIT 2000");
  res.json({
    priceCents: subscriptionBasePrice(),
    providers: special.map(row => ({ id: Number(row.id), name: row.name ?? "", email: row.email ?? "", code: subscriberCode(Number(row.id)), discountPercent: Number(row.discountPercent ?? 0), free: Boolean(row.subscriptionFree) })),
  });
}));

router.put("/admin/payments/pricing", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const input = body(req, z.object({ priceCents: z.number().int().min(100, "Valor mínimo R$ 1,00").max(10_000_000) }));
  await saveBasePrice(input.priceCents);
  await audit(context.user.id, "admin.subscription_price", input);
  res.json({ priceCents: subscriptionBasePrice() });
}));

router.patch("/admin/users/:id/subscription-pricing", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const input = body(req, z.object({ free: z.boolean().optional(), discountPercent: z.number().int().min(0).max(100).optional() }).strict());
  const target = await query<any[]>("SELECT userId FROM account_profiles WHERE userId = ? AND accountType = 'provider' LIMIT 1", [id]);
  if (!target[0]) throw new HttpError(404, "Profissional não encontrado");
  if (input.free !== undefined) await execute("UPDATE account_profiles SET subscriptionFree = ? WHERE userId = ?", [input.free, id]);
  if (input.discountPercent !== undefined) await execute("UPDATE account_profiles SET discountPercent = ? WHERE userId = ?", [input.discountPercent, id]);
  await audit(context.user.id, "admin.subscription_pricing", input, id);
  res.json(await priceFor(id));
}));

// ------------------------------------------------------------------ benefícios extras pagos (só profissionais)

const productSchema = z.object({
  title: z.string().trim().min(3).max(120), description: z.string().trim().max(1000).default(""), priceCents: z.number().int().min(100).max(10_000_000),
  days: z.number().int().min(1).max(365), effect: z.enum(["featured", "none"]), active: z.boolean().default(true), sortOrder: z.number().int().min(0).max(999).default(0),
});
const mapProduct = (row: any) => ({ id: Number(row.id), title: row.title, description: row.description ?? "", priceCents: Number(row.priceCents), days: Number(row.days), effect: row.effect, active: Boolean(row.active), sortOrder: Number(row.sortOrder ?? 0) });

router.get("/admin/benefit-products", wrap(async (req, res) => {
  await adminCtx(req);
  res.json({ products: (await query<any[]>("SELECT * FROM gc_benefit_products ORDER BY sortOrder ASC, id ASC")).map(mapProduct) });
}));
router.post("/admin/benefit-products", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const p = body(req, productSchema);
  const result = await execute("INSERT INTO gc_benefit_products (title, description, priceCents, days, effect, active, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)", [p.title, p.description || null, p.priceCents, p.days, p.effect, p.active, p.sortOrder]);
  await audit(context.user.id, "admin.benefit_product_create", { id: Number(result.insertId), title: p.title });
  res.status(201).json({ id: Number(result.insertId) });
}));
router.patch("/admin/benefit-products/:id", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const p = body(req, productSchema);
  await execute("UPDATE gc_benefit_products SET title = ?, description = ?, priceCents = ?, days = ?, effect = ?, active = ?, sortOrder = ? WHERE id = ?", [p.title, p.description || null, p.priceCents, p.days, p.effect, p.active, p.sortOrder, id]);
  await audit(context.user.id, "admin.benefit_product_update", { id, title: p.title });
  res.json({ ok: true });
}));
router.delete("/admin/benefit-products/:id", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  await execute("DELETE FROM gc_benefit_products WHERE id = ?", [id]);
  await audit(context.user.id, "admin.benefit_product_delete", { id });
  res.json({ ok: true });
}));

router.get("/provider/benefits", wrap(async (req, res) => {
  requireDb();
  const context = await requireAuth(req);
  if (context.profile.accountType !== "provider") throw new HttpError(403, "Área exclusiva de profissionais");
  const [products, pending] = await Promise.all([
    query<any[]>("SELECT * FROM gc_benefit_products WHERE active = 1 ORDER BY sortOrder ASC, id ASC"),
    query<any[]>("SELECT benefitId, qrCode, qrCodeBase64, ticketUrl, expiresAt FROM gc_subscription_payments WHERE userId = ? AND purpose = 'benefit' AND status = 'pending' AND expiresAt > CURRENT_TIMESTAMP", [context.user.id]),
  ]);
  res.json({
    paymentsConfigured: mpConfigured(),
    products: products.map(row => { const pix = pending.find(p => Number(p.benefitId) === Number(row.id)); return { ...mapProduct(row), pendingPix: pix ? { qrCode: pix.qrCode ?? "", qrCodeBase64: pix.qrCodeBase64 ?? "", ticketUrl: pix.ticketUrl ?? "", expiresAt: pix.expiresAt ? new Date(pix.expiresAt).toISOString() : null } : null }; }),
  });
}));

router.post("/provider/benefits/:id/buy", wrap(async (req, res) => {
  requireDb();
  const context = await requireAuth(req);
  if (context.profile.accountType !== "provider") throw new HttpError(403, "Benefícios extras são exclusivos de profissionais");
  if (context.profile.status !== "active") throw new HttpError(403, "Seu cadastro precisa estar aprovado.");
  const me = context.user.id;
  const id = parse(idSchema, req.params.id);
  limit(`benefit-buy:${me}`, 10, HOUR);
  const rows = await query<any[]>("SELECT * FROM gc_benefit_products WHERE id = ? AND active = 1 LIMIT 1", [id]);
  if (!rows[0]) throw new HttpError(404, "Benefício indisponível");
  const product = mapProduct(rows[0]);
  const pending = await query<any[]>("SELECT id FROM gc_subscription_payments WHERE userId = ? AND purpose = 'benefit' AND benefitId = ? AND status = 'pending' AND expiresAt > CURRENT_TIMESTAMP LIMIT 1", [me, id]);
  if (pending[0]) { res.json({ pending: true }); return; }
  const expiresAt = new Date(Date.now() + 24 * HOUR);
  const result = await execute("INSERT INTO gc_subscription_payments (userId, method, status, amountCents, expiresAt, purpose, benefitId) VALUES (?, 'pix_benefit', 'pending', ?, ?, 'benefit', ?)", [me, product.priceCents, expiresAt, id]);
  const rowId = Number(result.insertId);
  const reference = paymentReference("BENEFICIO", me, rowId);
  await execute("UPDATE gc_subscription_payments SET reference = ? WHERE id = ?", [reference, rowId]);
  try {
    const payment = await createPixPayment({ amountCents: product.priceCents, description: paymentDescription("BENEFICIO", me, context.user.name ?? "", `“${product.title}”`), payerEmail: context.user.email ?? "", externalReference: reference, expiresAt, notificationUrl: webhookUrl(req), metadata: { assinante_id: me, codigo_assinante: subscriberCode(me), tipo: "beneficio" } });
    const data = payment.point_of_interaction?.transaction_data ?? {};
    await execute("UPDATE gc_subscription_payments SET mpPaymentId = ?, qrCode = ?, qrCodeBase64 = ?, ticketUrl = ? WHERE id = ?", [String(payment.id), data.qr_code ?? null, data.qr_code_base64 ?? null, (data.ticket_url ?? "").slice(0, 500) || null, rowId]);
  } catch (error) {
    await execute("DELETE FROM gc_subscription_payments WHERE id = ?", [rowId]);
    throw error;
  }
  res.status(201).json({ pending: true });
}));

router.use(errorHandler);

export function registerEngageRoutes(app: Express) {
  app.use("/api/gastro", router);
}
