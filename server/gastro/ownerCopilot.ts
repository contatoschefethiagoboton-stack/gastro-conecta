// Copilot do dono: junta os números da plataforma, aponta o que precisa de atenção,
// manda lembretes de um clique, envia o resumo diário e responde perguntas no painel.
import { Router, type Express } from "express";
import { z } from "zod";
import { assertOrigin, body, clientIp, errorHandler, limit, wrap } from "./http";
import { dbConfigured, query } from "./db";
import { audit, requireStaff } from "./staff";
import { getInternalFlag, getServiceCatalog, setInternalFlag } from "./content";
import { notifyAdmin, notifyUser } from "./notify";
import { dbState } from "./bootstrap";
import { copilotProvider, notifyMatchingProviders, resolveCopilotEndpoint } from "./routes";
import { answerOwner, BRIEF_ACTIONS, buildBrief, dailySummary, type BriefActionId, type OwnerMetrics } from "@shared/ownerBrief";

const n = (rows: any[]) => Number(rows[0]?.total ?? 0);
const people = (rows: any[]) => rows.map(r => ({ id: Number(r.id), name: String(r.name ?? "").trim() || `#${r.id}` }));
// Contas da equipe (users.role = 'admin') nunca entram nos números.
const PROVIDER = "u.role <> 'admin' AND p.accountType = 'provider'";

export async function collectOwnerMetrics(): Promise<OwnerMetrics> {
  const [newClients, newProviders, activeProviders, totalClients, openEvents, booked, revenue, revenueLast, pending, incomplete, trials, overdue, noProposal, waiting, social, google] = await Promise.all([
    query<any[]>("SELECT COUNT(*) total FROM users u JOIN account_profiles p ON p.userId = u.id WHERE u.role <> 'admin' AND p.accountType = 'client' AND u.createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)"),
    query<any[]>(`SELECT COUNT(*) total FROM users u JOIN account_profiles p ON p.userId = u.id WHERE ${PROVIDER} AND u.createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)`),
    query<any[]>(`SELECT COUNT(*) total FROM users u JOIN account_profiles p ON p.userId = u.id JOIN gc_profile_details d ON d.userId = u.id WHERE ${PROVIDER} AND p.status = 'active' AND d.completedAt IS NOT NULL`),
    query<any[]>("SELECT COUNT(*) total FROM users u JOIN account_profiles p ON p.userId = u.id WHERE u.role <> 'admin' AND p.accountType = 'client' AND p.status <> 'deleted'"),
    query<any[]>("SELECT COUNT(*) total FROM gastro_events WHERE status = 'open'"),
    query<any[]>("SELECT COUNT(*) total FROM gastro_events WHERE status IN ('booked','completed') AND providerId IS NOT NULL AND createdAt >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')"),
    query<any[]>("SELECT COALESCE(SUM(amountCents), 0) total FROM gc_subscription_payments WHERE status = 'approved' AND approvedAt >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')"),
    query<any[]>("SELECT COALESCE(SUM(amountCents), 0) total FROM gc_subscription_payments WHERE status = 'approved' AND approvedAt >= DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL 1 MONTH), '%Y-%m-01') AND approvedAt < DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')"),
    query<any[]>(`SELECT u.id, u.name FROM users u JOIN account_profiles p ON p.userId = u.id JOIN gc_profile_details d ON d.userId = u.id WHERE ${PROVIDER} AND p.status = 'pending' AND d.completedAt IS NOT NULL ORDER BY d.completedAt ASC LIMIT 50`),
    query<any[]>(`SELECT u.id, u.name FROM users u JOIN account_profiles p ON p.userId = u.id LEFT JOIN gc_profile_details d ON d.userId = u.id WHERE ${PROVIDER} AND p.status IN ('pending','active') AND d.completedAt IS NULL AND u.createdAt < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 DAY) AND u.createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 DAY) ORDER BY u.createdAt DESC LIMIT 50`),
    query<any[]>(`SELECT u.id, u.name, s.trialUntil FROM gc_provider_subscriptions s JOIN users u ON u.id = s.userId JOIN account_profiles p ON p.userId = u.id WHERE ${PROVIDER} AND p.status = 'active' AND s.trialUntil BETWEEN CURRENT_TIMESTAMP AND DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 3 DAY) AND (s.lastPaidAt IS NULL OR s.lastPaidAt < s.trialGrantedAt) ORDER BY s.trialUntil ASC LIMIT 50`),
    query<any[]>(`SELECT u.id, u.name FROM gc_provider_subscriptions s JOIN users u ON u.id = s.userId JOIN account_profiles p ON p.userId = u.id WHERE ${PROVIDER} AND p.status = 'active' AND s.periodEnd < CURRENT_TIMESTAMP AND s.periodEnd > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY) AND (s.trialUntil IS NULL OR s.trialUntil < CURRENT_TIMESTAMP) ORDER BY s.periodEnd DESC LIMIT 50`),
    query<any[]>("SELECT e.id, e.title, e.city, TIMESTAMPDIFF(HOUR, e.createdAt, CURRENT_TIMESTAMP) hours FROM gastro_events e WHERE e.status = 'open' AND e.providerId IS NULL AND e.createdAt < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR) AND e.createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY) AND (e.eventDate IS NULL OR e.eventDate >= CURRENT_DATE) AND NOT EXISTS (SELECT 1 FROM gastro_proposals pr WHERE pr.eventId = e.id) ORDER BY e.createdAt ASC LIMIT 50"),
    query<any[]>("SELECT e.id, e.title, e.clientId, COUNT(pr.id) proposals FROM gastro_events e JOIN gastro_proposals pr ON pr.eventId = e.id AND pr.status = 'pending' WHERE e.status = 'open' AND (e.eventDate IS NULL OR e.eventDate >= CURRENT_DATE) GROUP BY e.id, e.title, e.clientId HAVING MIN(pr.createdAt) < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 48 HOUR) ORDER BY MIN(pr.createdAt) ASC LIMIT 50"),
    query<any[]>("SELECT COUNT(*) total FROM gc_social_inbox WHERE status = 'error' AND createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)").catch(() => [{ total: 0 }]),
    query<any[]>("SELECT COUNT(*) total FROM gc_index_log WHERE engine = 'google' AND status = 'error' AND createdAt >= CURRENT_DATE").catch(() => [{ total: 0 }]),
  ]);
  return {
    newClients24h: n(newClients), newProviders24h: n(newProviders), activeProviders: n(activeProviders), totalClients: n(totalClients),
    openEvents: n(openEvents), bookedThisMonth: n(booked), revenueMonthCents: n(revenue), revenueLastMonthCents: n(revenueLast),
    pendingApproval: people(pending), incompleteProfiles: people(incomplete),
    trialsEnding: trials.map(r => ({ id: Number(r.id), name: String(r.name ?? ""), until: new Date(r.trialUntil).toISOString() })),
    overdue: people(overdue),
    eventsNoProposal: noProposal.map(r => ({ id: Number(r.id), title: String(r.title), city: String(r.city ?? ""), hours: Number(r.hours ?? 0) })),
    proposalsWaiting: waiting.map(r => ({ id: Number(r.id), title: String(r.title), clientId: Number(r.clientId), proposals: Number(r.proposals) })),
    socialErrors24h: n(social), googleErrorsToday: n(google),
  };
}

/** Já foi lembrado nas últimas 24 h? (evita mandar o mesmo lembrete duas vezes). */
async function remindedRecently(action: BriefActionId, targetId: number) {
  const rows = await query<any[]>("SELECT 1 FROM gastro_audit_logs WHERE action = ? AND targetId = ? AND createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR) LIMIT 1", [`brief.${action}`, targetId]);
  return Boolean(rows[0]);
}

/** Executa um lembrete de um clique. Só age sobre quem ainda está na lista daquele alerta. */
export async function runBriefAction(action: BriefActionId, ids: number[], actorId: number) {
  const m = await collectOwnerMetrics();
  const allowed = new Set<number>(
    action === "renotify-events" ? m.eventsNoProposal.map(e => e.id)
      : action === "nudge-clients" ? m.proposalsWaiting.map(e => e.id)
      : action === "nudge-trials" ? m.trialsEnding.map(p => p.id)
      : m.incompleteProfiles.map(p => p.id),
  );
  let sent = 0, skipped = 0;
  const catalog = action === "renotify-events" ? await getServiceCatalog() : null;
  for (const id of ids.filter(id => allowed.has(id)).slice(0, 50)) {
    if (await remindedRecently(action, id)) { skipped++; continue; }
    if (action === "renotify-events") {
      const event = (await query<any[]>("SELECT * FROM gastro_events WHERE id = ? LIMIT 1", [id]))[0];
      if (!event) continue;
      await notifyMatchingProviders(event, catalog!, event.preferredProviderId ? Number(event.preferredProviderId) : null);
    } else if (action === "nudge-clients") {
      const event = m.proposalsWaiting.find(e => e.id === id)!;
      await notifyUser(event.clientId, { type: "brief.proposals", title: "Suas propostas estão esperando", body: `Você recebeu ${event.proposals} proposta(s) para “${event.title}”. Compare e aceite a melhor — o contrato em PDF sai na hora.`, path: "/painel?aba=requests" });
    } else if (action === "nudge-trials") {
      await notifyUser(id, { type: "brief.trial", title: "Seu teste grátis está acabando", body: "Ative a assinatura para continuar recebendo pedidos e aparecendo no catálogo. Você fica com 100% do valor dos serviços, sem comissão.", path: "/painel?aba=subscription" });
    } else {
      await notifyUser(id, { type: "brief.profile", title: "Falta pouco para receber pedidos", body: "Complete seu cadastro no Eventos Conecta (documento, fotos dos trabalhos e Pix) para começar a receber pedidos da sua região.", path: "/painel?aba=profile" });
    }
    await audit(actorId, `brief.${action}`, { by: "copilot-do-dono" }, id);
    sent++;
  }
  return { sent, skipped };
}

// ------------------------------------------------------------------ resumo diário

const SUMMARY_HOUR = Number(process.env.OWNER_BRIEF_HOUR ?? 8); // horário de Brasília
const today = (now = new Date()) => new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const brasiliaHour = (now = new Date()) => new Date(now.getTime() - 3 * 3600_000).getUTCHours();

export async function dailyBriefEnabled() {
  return (await getInternalFlag("ownerBrief.daily").catch(() => null)) !== "false";
}

export async function sendDailyBrief(now = new Date(), force = false) {
  if (!dbConfigured() || !dbState.ready) return false;
  if (!force) {
    if (brasiliaHour(now) < SUMMARY_HOUR || !(await dailyBriefEnabled())) return false;
    if ((await getInternalFlag("ownerBrief.lastSent").catch(() => null)) === today(now)) return false;
  }
  await setInternalFlag("ownerBrief.lastSent", today(now));
  const m = await collectOwnerMetrics();
  await notifyAdmin({ type: "owner.brief", title: "Resumo do dia do Eventos Conecta", body: dailySummary(m), path: "/admin/painel?secao=copilot" });
  return true;
}

let timer: NodeJS.Timeout | null = null;
export function startOwnerBriefScheduler() {
  if (timer) return;
  const tick = () => { sendDailyBrief().catch(error => console.warn("[Copilot do dono] resumo diário falhou:", error instanceof Error ? error.message : error)); };
  setTimeout(tick, 3 * 60_000).unref();
  timer = setInterval(tick, 30 * 60_000);
  timer.unref();
}

// ------------------------------------------------------------------ chat

async function askAi(question: string, history: Array<{ role: "user" | "assistant"; content: string }>, m: OwnerMetrics): Promise<string | null> {
  const { base, key, model } = copilotProvider();
  if (!base || !key) return null;
  const system = `Você é o Copilot do dono do Eventos Conecta (marketplace de profissionais para eventos; clientes usam grátis, profissionais pagam assinatura mensal sem comissão). Responda em português, curto e direto, usando SOMENTE os números abaixo (não invente). Quando houver problema, sugira a próxima ação concreta (aprovar cadastros em "Fornecedores", lembretes em "Copilot do dono", assinaturas em "Assinaturas"). Nunca exponha e-mails ou documentos. Dados de agora (JSON): ${JSON.stringify(m)}`;
  try {
    const response = await fetch(resolveCopilotEndpoint(base), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000), body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...history.slice(-10), { role: "user", content: question }], ...(model.startsWith("gpt-5") ? {} : { temperature: 0.2 }) }) });
    if (!response.ok) return null;
    const reply = ((await response.json()) as any)?.choices?.[0]?.message?.content;
    return typeof reply === "string" && reply.trim() ? reply.trim().slice(0, 6000) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ rotas

const router = Router();

router.get("/admin/brief", wrap(async (req, res) => {
  await requireStaff(req);
  const metrics = await collectOwnerMetrics();
  res.set("Cache-Control", "no-store").json({ metrics, items: buildBrief(metrics), summary: dailySummary(metrics), daily: await dailyBriefEnabled(), lastSent: await getInternalFlag("ownerBrief.lastSent").catch(() => null), aiEnabled: Boolean(copilotProvider().key) });
}));

router.post("/admin/brief/action", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireStaff(req);
  const input = body(req, z.object({ action: z.enum(BRIEF_ACTIONS as [BriefActionId, ...BriefActionId[]]), ids: z.array(z.number().int().positive()).min(1).max(50) }));
  res.json(await runBriefAction(input.action, input.ids, ctx.user.id));
}));

router.post("/admin/brief/settings", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireStaff(req);
  const input = body(req, z.object({ daily: z.boolean() }));
  await setInternalFlag("ownerBrief.daily", input.daily ? "true" : "false");
  await audit(ctx.user.id, "brief.settings", input);
  res.json({ ok: true });
}));

router.post("/admin/brief/send", wrap(async (req, res) => {
  assertOrigin(req);
  const ctx = await requireStaff(req);
  await sendDailyBrief(new Date(), true);
  await audit(ctx.user.id, "brief.send", {});
  res.json({ ok: true });
}));

router.post("/admin/brief/chat", wrap(async (req, res) => {
  assertOrigin(req);
  await requireStaff(req);
  limit(`owner-copilot:${clientIp(req)}`, 20, 60_000, "Muitas perguntas seguidas; espere um pouco.");
  const input = body(req, z.object({ message: z.string().trim().min(1).max(1000), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).optional() }));
  const metrics = await collectOwnerMetrics();
  const ai = await askAi(input.message, input.history ?? [], metrics);
  res.json({ reply: ai ?? answerOwner(input.message, metrics), source: ai ? "ai" : "rules" });
}));

router.use(errorHandler);

export function registerOwnerCopilotRoutes(app: Express) {
  app.use("/api/gastro", router);
}
