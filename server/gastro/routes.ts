import { Router, type Express, type Request } from "express";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { HttpError } from "@shared/_core/errors";
import { findCategory, findService, serviceMatchesRequest, type RequestCategory } from "@shared/services";
import { platformEstimateCents } from "@shared/copilot";
import { conversionRate } from "@shared/copilot";
import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../_core/env";
import { execute, query, withTransaction } from "./db";
import { loadProfessionals } from "./catalog";
import { getServiceCatalog } from "./content";
import { assertOrigin, body, clientIp, errorHandler, limit, parse, wrap } from "./http";
import { clearGcSession, createGcSession, createLocalUser, gcCookieOptions, getUserByEmail, isOwner, passwordIsStrong, publicUser, requireAuth, resolveAuth, verifyPassword, type AccountType, type AuthContext } from "./auth";
import { calculateIntentScore, isoDate } from "./rules";
import { assertSubscriptionActive, phaseFor, subscriptionSummary } from "./subscriptions";
import { clientContractDataComplete, loadDetails, providerDetailsComplete, waLink } from "./profiles";
import { buildContractPayload, contractPdf, legacyContractPdf, type ContractPayload } from "./contracts";
import { buildPdf } from "./pdf";
import { mpConfigured } from "./mercadopago";
import { mailConfigured } from "./password";

const router = Router();
const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(10).max(200);
const accountTypeSchema = z.enum(["client", "provider"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= new Date().toISOString().slice(0, 10);
}, "A data deve ser válida e não pode estar no passado");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (HH:MM)");
const idSchema = z.coerce.number().int().positive();
const categorySchema = z.enum(["event", "mealPrep", "cleaning", "gardening"]);
const scopeSchema = z.enum(["labor", "full"]);

router.use((req, _res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertOrigin(req);
  next();
});

const auth = (req: Request) => requireAuth(req);

async function admin(req: Request): Promise<AuthContext> {
  const context = await auth(req);
  if (!(await isOwner(context))) throw new HttpError(403, "Acesso reservado à administração");
  return context;
}

async function audit(actorId: number, action: string, details: unknown, targetId?: number) {
  await execute("INSERT INTO gastro_audit_logs (action, details, actorId, targetId) VALUES (?, ?, ?, ?)", [action, JSON.stringify(details).slice(0, 60000), actorId, targetId ?? null]);
}

const json = (value: unknown) => { if (!value) return {}; try { return JSON.parse(String(value)); } catch { return {}; } };

function mapUser(row: any) {
  return {
    id: Number(row.id), name: row.name ?? "", email: row.email ?? "", accountType: row.accountType, role: row.role === "admin" ? "admin" : "user", status: row.status,
    city: row.city ?? undefined, bio: row.bio ?? undefined, vip: Boolean(row.vip), discountPercent: Number(row.discountPercent ?? 0), featured: Boolean(row.featured),
    ...(row.profileCompletedAt !== undefined ? { profileComplete: Boolean(row.profileCompletedAt) } : {}),
    ...(row.createdAt ? { createdAt: new Date(row.createdAt).toISOString() } : {}),
  };
}

function mapEvent(row: any, exposeAddress = true) {
  return {
    id: Number(row.id), clientId: Number(row.clientId), ...(row.providerId ? { providerId: Number(row.providerId) } : {}),
    title: row.title, type: row.type, category: (row.category ?? "event") as RequestCategory, date: isoDate(row.eventDate) ?? undefined, time: row.eventTime ?? undefined,
    city: row.city, ...(exposeAddress && row.location ? { location: row.location } : {}),
    guests: Number(row.guests), budgetCents: Number(row.budgetCents), description: row.description ?? undefined, scope: row.scope ?? undefined, details: json(row.details),
    score: Number(row.score), status: row.status, createdAt: new Date(row.createdAt).toISOString(),
  };
}

function mapProposal(row: any) {
  return {
    id: Number(row.id), eventId: Number(row.eventId), providerId: Number(row.providerId), amountCents: Number(row.amountCents), costCents: Number(row.costCents ?? 0),
    message: row.message, status: row.status, scope: row.scope ?? "labor", paymentTerms: row.paymentTerms ?? "", eventTime: row.eventTime ?? undefined, breakdown: json(row.breakdown),
    createdAt: new Date(row.createdAt).toISOString(),
    ...(row.providerName ? { providerName: row.providerName } : {}), ...(row.eventTitle ? { eventTitle: row.eventTitle } : {}), ...(row.eventStatus ? { eventStatus: row.eventStatus } : {}),
  };
}

// ------------------------------------------------------------------ avaliações 360° (cliente ↔ profissional)

async function pendingReviews(userId: number, overdueOnly = false) {
  const overdueClause = overdueOnly ? " AND e.completedAt < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)" : "";
  const events = await query<any[]>(`SELECT e.id, e.title, e.clientId, e.providerId, e.completedAt FROM gastro_events e
    WHERE e.status = 'completed' AND e.completedAt IS NOT NULL AND e.providerId IS NOT NULL${overdueClause} AND (e.clientId = ? OR e.providerId = ?)`, [userId, userId]);
  const pending: Array<{ eventId: number; title: string; completedAt: string; targets: Array<{ id: number; name: string }> }> = [];
  for (const event of events) {
    const targetId = Number(event.clientId) === userId ? Number(event.providerId) : Number(event.clientId);
    const already = await query<any[]>("SELECT id FROM gastro_reviews WHERE eventId = ? AND reviewerId = ? AND targetId = ? LIMIT 1", [event.id, userId, targetId]);
    if (already[0]) continue;
    const found = await query<any[]>("SELECT COALESCE(name, '') name FROM users WHERE id = ? LIMIT 1", [targetId]);
    pending.push({ eventId: Number(event.id), title: event.title, completedAt: new Date(event.completedAt).toISOString(), targets: [{ id: targetId, name: found[0]?.name ?? "" }] });
  }
  return pending;
}

/** Regra das 24h: avaliação pendente há mais de 24h bloqueia pedidos, propostas e aceites. */
async function assertNoReviewGuard(userId: number) {
  if ((await pendingReviews(userId, true)).length) throw new HttpError(423, "Você tem uma avaliação pendente há mais de 24 horas. Avalie o evento concluído (aba Avaliações) para liberar novos pedidos, propostas e aceites.");
}

async function userFlags(userId: number): Promise<string[]> {
  const rows = await query<any[]>("SELECT flag FROM gc_user_flags WHERE userId = ?", [userId]);
  return rows.map(row => String(row.flag));
}

// ------------------------------------------------------------------ conta

router.get("/me", wrap(async (req, res) => {
  const context = await resolveAuth(req);
  if (!context) { res.json({ user: null }); return; }
  const isAdmin = context.user.role === "admin";
  const { details, completedAt } = await loadDetails(context.user.id);
  const provider = context.profile.accountType === "provider";
  const profileComplete = isAdmin || !provider || providerDetailsComplete(details, completedAt);
  const [overdue, pending, flags] = await Promise.all([pendingReviews(context.user.id, true), pendingReviews(context.user.id), userFlags(context.user.id)]);
  const reviewedSomething = (await query<any[]>("SELECT id FROM gastro_reviews WHERE reviewerId = ? LIMIT 1", [context.user.id]))[0];
  res.json({ user: {
    ...publicUser(context), specialty: context.profile.specialty ?? undefined, profileComplete,
    contractDataComplete: provider ? profileComplete : clientContractDataComplete(details),
    pendingReviews: pending.length, reviewLock: overdue.length > 0,
    growthPrompt: Boolean(reviewedSomething) && !(flags.includes("google") && flags.includes("instagram")),
    growthFlags: flags,
    ...(provider && !isAdmin ? { subscriptionPhase: await phaseFor(context.user.id) } : {}),
  } });
}));

const registerSchema = z.object({ name: z.string().trim().min(2).max(160), email: emailSchema, password: passwordSchema, accountType: accountTypeSchema, city: z.string().trim().min(2).max(160), serviceId: z.string().trim().max(60).optional() });
const loginSchema = z.object({ email: emailSchema, password: passwordSchema });

router.post("/register", wrap(async (req, res) => {
  const input = body(req, registerSchema);
  limit(`login:${clientIp(req)}:${input.email.toLowerCase()}`, 8, 15 * 60_000);
  if (!passwordIsStrong(input.password)) throw new HttpError(400, "A senha deve ter 10 caracteres, maiúscula, minúscula, número e caractere especial");
  // Profissional escolhe a profissão exata já no cadastro (lista editável no painel).
  const service = input.accountType === "provider" ? findService(await getServiceCatalog(), input.serviceId) : undefined;
  if (input.accountType === "provider" && !service) throw new HttpError(400, "Escolha qual profissional você é");
  const created = await createLocalUser(input);
  if (service) {
    await execute("INSERT INTO gc_profile_details (userId, details, completedAt) VALUES (?, ?, NULL) ON DUPLICATE KEY UPDATE details = VALUES(details)", [created.user.id, JSON.stringify({ kind: "provider", services: [service.id] })]);
    await execute("UPDATE account_profiles SET specialty = ? WHERE userId = ?", [service.label.slice(0, 160), created.user.id]);
  }
  const token = await createGcSession(created.user.id);
  res.cookie("gc_session", token, gcCookieOptions(req));
  res.status(201).json({ user: publicUser({ user: created.user, profile: created.profile, source: "gastro" }) });
}));

router.post("/login", wrap(async (req, res) => {
  const input = body(req, loginSchema);
  limit(`login:${clientIp(req)}:${input.email.toLowerCase()}`, 8, 15 * 60_000);
  const found = await getUserByEmail(input.email);
  if (!found || !(await verifyPassword(input.password, found.profile.passwordHash))) throw new HttpError(401, "Credenciais inválidas");
  if (["blocked", "deleted", "suspended"].includes(found.profile.status)) throw new HttpError(403, "Conta indisponível");
  const token = await createGcSession(found.user.id);
  res.cookie("gc_session", token, gcCookieOptions(req));
  res.json({ user: publicUser({ ...found, source: "gastro" }) });
}));

router.post("/logout", wrap(async (req, res) => {
  await clearGcSession(req, res);
  res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(req), maxAge: 0 });
  res.json({ ok: true });
}));

const profileSchema = z.object({ name: z.string().trim().min(2).max(160).optional(), city: z.string().trim().min(2).max(160).optional() }).strict();
router.patch("/profile", wrap(async (req, res) => {
  const context = await auth(req);
  const input = body(req, profileSchema);
  if (input.name === undefined && input.city === undefined) throw new HttpError(400, "Nenhuma alteração informada");
  await withTransaction(async connection => {
    if (input.name !== undefined) await connection.execute("UPDATE users SET name = ? WHERE id = ?", [input.name, context.user.id]);
    if (input.city !== undefined) await connection.execute("UPDATE account_profiles SET city = ? WHERE userId = ?", [input.city, context.user.id]);
  });
  const rows = await query<any[]>("SELECT u.*, p.accountType, p.status, p.city, p.bio, p.specialty, p.vip, p.discountPercent, p.featured FROM users u JOIN account_profiles p ON p.userId = u.id WHERE u.id = ?", [context.user.id]);
  res.json({ user: mapUser(rows[0]) });
}));

router.post("/growth/ack", wrap(async (req, res) => {
  const context = await auth(req);
  const input = body(req, z.object({ flag: z.enum(["google", "instagram"]) }));
  await execute("INSERT INTO gc_user_flags (userId, flag) VALUES (?, ?) ON DUPLICATE KEY UPDATE flag = flag", [context.user.id, input.flag]);
  res.json({ flags: await userFlags(context.user.id) });
}));

router.get("/professionals", wrap(async (_req, res) => {
  res.json({ professionals: await loadProfessionals() });
}));

// ------------------------------------------------------------------ pedidos (eventos, marmitas, limpeza, jardinagem)

/** Cliente novo x antigo: já fechou algum pedido antes na plataforma? */
async function clientHistory(clientIds: number[]) {
  const unique = [...new Set(clientIds)];
  if (!unique.length) return new Map<number, number>();
  const rows = await query<any[]>(`SELECT clientId, COUNT(*) total FROM gastro_events WHERE status IN ('booked','completed') AND clientId IN (${unique.map(() => "?").join(",")}) GROUP BY clientId`, unique);
  return new Map(rows.map(row => [Number(row.clientId), Number(row.total)]));
}

async function providerServices(userId: number): Promise<string[]> {
  const { details } = await loadDetails(userId);
  return Array.isArray(details?.services) ? details.services : [];
}

router.get("/events", wrap(async (req, res) => {
  const context = await auth(req);
  const me = context.user.id;
  if (context.profile.accountType !== "provider") {
    const rows = await query<any[]>(`SELECT e.*, (SELECT COUNT(*) FROM gastro_proposals p WHERE p.eventId = e.id AND p.status = 'pending') pendingProposals, u.name providerName,
      (SELECT c.id FROM gastro_contracts c WHERE c.eventId = e.id ORDER BY c.id DESC LIMIT 1) contractId
      FROM gastro_events e LEFT JOIN users u ON u.id = e.providerId WHERE e.clientId = ? ORDER BY e.createdAt DESC`, [me]);
    const out = [];
    for (const row of rows) {
      let whatsappUrl = "";
      if (row.providerId && (row.status === "booked" || row.status === "completed")) {
        const { details } = await loadDetails(Number(row.providerId));
        whatsappUrl = waLink(details?.phone, `Olá, ${row.providerName ?? ""}! Aceitei sua proposta no GastroConecta para "${row.title}". Vamos alinhar os detalhes?`);
      }
      out.push({ ...mapEvent(row), pendingProposals: Number(row.pendingProposals ?? 0), ...(row.providerName ? { providerName: row.providerName } : {}), ...(whatsappUrl ? { whatsappUrl } : {}), ...(row.contractId ? { contractId: Number(row.contractId) } : {}) });
    }
    res.json({ events: out });
    return;
  }
  const services = await providerServices(me);
  const catalog = await getServiceCatalog();
  // Radar: pedidos abertos compatíveis, não recusados, não exclusivos de outro profissional.
  const open = await query<any[]>(`SELECT e.*, (SELECT p.status FROM gastro_proposals p WHERE p.eventId = e.id AND p.providerId = ? LIMIT 1) myProposal
    FROM gastro_events e WHERE e.status = 'open' AND e.providerId IS NULL AND (e.preferredProviderId IS NULL OR e.preferredProviderId = ?)
      AND NOT EXISTS (SELECT 1 FROM gc_event_dismissals d WHERE d.eventId = e.id AND d.userId = ?) ORDER BY e.createdAt DESC LIMIT 300`, [me, me, me]);
  const mine = await query<any[]>(`SELECT e.*, (SELECT c.id FROM gastro_contracts c WHERE c.eventId = e.id ORDER BY c.id DESC LIMIT 1) contractId FROM gastro_events e WHERE e.providerId = ? ORDER BY e.eventDate DESC, e.createdAt DESC`, [me]);
  // Fechados com outro profissional (para quem tinha enviado proposta): somem do radar com o aviso.
  const closed = await query<any[]>(`SELECT e.id, e.title, e.city, e.eventDate, u.name providerName FROM gastro_events e JOIN users u ON u.id = e.providerId
    WHERE e.status IN ('booked','completed') AND e.providerId <> ? AND EXISTS (SELECT 1 FROM gastro_proposals p WHERE p.eventId = e.id AND p.providerId = ?)
    ORDER BY e.id DESC LIMIT 30`, [me, me]);
  const history = await clientHistory([...open, ...mine].map(row => Number(row.clientId)));
  const tagClient = (row: any) => {
    const previous = (history.get(Number(row.clientId)) ?? 0) - (row.status === "booked" || row.status === "completed" ? 1 : 0);
    return previous > 0 ? { clientTag: "Cliente Antigo" as const, clientPreviousEvents: previous } : { clientTag: "Cliente Novo" as const, clientPreviousEvents: 0 };
  };
  const radar = open.filter(row => serviceMatchesRequest(services, (row.category ?? "event") as RequestCategory, catalog, json(row.details))).map(row => ({ ...mapEvent(row, false), ...tagClient(row), ...(row.myProposal ? { myProposal: row.myProposal } : {}) }));
  const own = [];
  for (const row of mine) {
    const { details } = await loadDetails(Number(row.clientId));
    const clientName = (await query<any[]>("SELECT name FROM users WHERE id = ?", [row.clientId]))[0]?.name ?? "";
    own.push({ ...mapEvent(row), ...tagClient(row), clientName, ...(row.contractId ? { contractId: Number(row.contractId) } : {}), whatsappUrl: waLink(details?.phone, `Olá, ${clientName}! Sou o profissional do GastroConecta para "${row.title}". Vamos alinhar os detalhes?`) });
  }
  res.json({ radar, events: own, closed: closed.map(row => ({ id: Number(row.id), title: row.title, city: row.city, date: isoDate(row.eventDate) ?? undefined, closedWith: row.providerName ?? "outro profissional" })) });
}));

const eventSchema = z.object({
  title: z.string().trim().min(2).max(180), type: z.string().trim().min(2).max(100), category: categorySchema.default("event"),
  date: dateSchema.optional(), time: timeSchema.optional(), city: z.string().trim().min(2).max(160), location: z.string().trim().max(240).optional(),
  guests: z.number().int().min(1).max(100000), budgetCents: z.number().int().min(0).max(2_000_000_000).default(0), description: z.string().max(5000).optional(),
  stage: z.enum(["ready", "comparing", "research"]), professionalId: z.string().max(160).optional(), scope: z.enum(["labor", "full", "either"]).optional(),
  details: z.object({
    mealPlan: z.string().max(60).optional(), mealsPerWeek: z.number().int().min(1).max(200).optional(), weeks: z.number().int().min(1).max(52).optional(),
    areaM2: z.number().int().min(1).max(1_000_000).optional(), propertyKind: z.string().max(60).optional(), withAlcohol: z.boolean().optional(), restrictions: z.string().max(500).optional(),
    serviceCategoryId: z.string().max(60).optional(), serviceId: z.string().max(60).optional(),
  }).strict().default({}),
});

router.post("/events", wrap(async (req, res) => {
  const context = await auth(req);
  if (context.profile.accountType !== "client") throw new HttpError(403, "Somente clientes publicam pedidos");
  await assertNoReviewGuard(context.user.id);
  const input = body(req, eventSchema);
  let preferredProviderId: number | null = null;
  if (input.professionalId) {
    const userMatch = /^user-(\d+)$/.exec(input.professionalId);
    if (userMatch) {
      preferredProviderId = Number(userMatch[1]);
      const provider = await query<any[]>("SELECT userId FROM account_profiles WHERE userId = ? AND accountType = 'provider' AND status = 'active' LIMIT 1", [preferredProviderId]);
      if (!provider[0] || (await phaseFor(preferredProviderId)) === "blocked") throw new HttpError(400, "O profissional selecionado não está disponível");
    } else if (!input.professionalId.startsWith("demo-")) throw new HttpError(400, "Profissional selecionado inválido");
  }
  // Categoria e profissão exata escolhidas pelo cliente; a categoria define a calculadora.
  const catalog = await getServiceCatalog();
  const wantedCategory = findCategory(catalog, input.details.serviceCategoryId);
  const wantedService = wantedCategory ? findService(catalog, input.details.serviceId) : undefined;
  const details: Record<string, unknown> = { ...input.details, serviceCategoryId: wantedCategory?.id, serviceId: wantedService?.categoryId === wantedCategory?.id ? wantedService?.id : undefined };
  if (wantedCategory) { input.category = wantedCategory.calculator; details.serviceCategoryName = wantedCategory.name; }
  if (details.serviceId && wantedService) details.serviceLabel = wantedService.label;
  // O valor é sugerido pela plataforma a partir das informações do pedido (o cliente não precisa informar).
  const suggestedCents = platformEstimateCents({ category: input.category, type: input.type, guests: input.guests, scope: input.scope, withAlcohol: input.details.withAlcohol, mealsPerWeek: input.details.mealsPerWeek, weeks: input.details.weeks, areaM2: input.details.areaM2, propertyKind: input.details.propertyKind, serviceLabel: wantedService && details.serviceId ? wantedService.label : undefined });
  details.suggestedCents = suggestedCents;
  if (!input.budgetCents) input.budgetCents = suggestedCents;
  const score = calculateIntentScore(input);
  const result = await execute("INSERT INTO gastro_events (clientId, preferredProviderId, title, type, category, eventDate, eventTime, city, location, guests, budgetCents, description, stage, score, scope, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [context.user.id, preferredProviderId, input.title, input.type, input.category, input.date ?? null, input.time ?? null, input.city, input.location ?? null, input.guests, input.budgetCents, input.description ?? null, input.stage, score, input.scope ?? null, JSON.stringify(details)]);
  const rows = await query<any[]>("SELECT * FROM gastro_events WHERE id = ?", [result.insertId]);
  res.status(201).json({ event: mapEvent(rows[0]) });
}));

router.post("/events/:id/cancel", wrap(async (req, res) => {
  const context = await auth(req);
  const eventId = parse(idSchema, req.params.id);
  const result = await execute("UPDATE gastro_events SET status = 'cancelled' WHERE id = ? AND clientId = ? AND status = 'open'", [eventId, context.user.id]);
  if (!result.affectedRows) throw new HttpError(409, "Só pedidos abertos podem ser cancelados");
  await execute("UPDATE gastro_proposals SET status = 'rejected' WHERE eventId = ? AND status = 'pending'", [eventId]);
  res.json({ ok: true });
}));

/** Profissional recusa o pedido: some do radar dele. */
router.post("/events/:id/dismiss", wrap(async (req, res) => {
  const context = await auth(req);
  if (context.profile.accountType !== "provider") throw new HttpError(403, "Somente profissionais recusam pedidos do radar");
  const eventId = parse(idSchema, req.params.id);
  await execute("INSERT INTO gc_event_dismissals (eventId, userId) VALUES (?, ?) ON DUPLICATE KEY UPDATE eventId = eventId", [eventId, context.user.id]);
  await execute("UPDATE gastro_proposals SET status = 'withdrawn' WHERE eventId = ? AND providerId = ? AND status = 'pending'", [eventId, context.user.id]);
  res.json({ ok: true });
}));

router.patch("/events/:id/complete", wrap(async (req, res) => {
  const context = await auth(req);
  const eventId = parse(idSchema, req.params.id);
  await withTransaction(async connection => {
    const [rows] = await connection.execute<any[]>("SELECT * FROM gastro_events WHERE id = ? AND (clientId = ? OR providerId = ?) LIMIT 1 FOR UPDATE", [eventId, context.user.id, context.user.id]);
    const event = rows[0];
    if (!event) throw new HttpError(404, "Pedido não encontrado");
    if (event.status !== "booked") throw new HttpError(409, "Somente pedidos fechados podem ser concluídos");
    const eventDate = isoDate(event.eventDate);
    if (!eventDate) throw new HttpError(409, "O pedido precisa ter uma data para ser concluído");
    if (eventDate > new Date().toISOString().slice(0, 10)) throw new HttpError(409, "O serviço ainda não ocorreu");
    await connection.execute("UPDATE gastro_events SET status = 'completed', completedAt = CURRENT_TIMESTAMP WHERE id = ?", [eventId]);
  });
  const rows = await query<any[]>("SELECT * FROM gastro_events WHERE id = ?", [eventId]);
  res.json({ event: mapEvent(rows[0]) });
}));

// ------------------------------------------------------------------ propostas

router.get("/proposals", wrap(async (req, res) => {
  const context = await auth(req);
  const me = context.user.id;
  const rows = await query<any[]>(`SELECT p.*, u.name providerName, e.title eventTitle, e.status eventStatus, e.providerId eventProviderId, e.clientId, cu.name clientName, wu.name winnerName
    FROM gastro_proposals p JOIN users u ON u.id = p.providerId JOIN gastro_events e ON e.id = p.eventId JOIN users cu ON cu.id = e.clientId LEFT JOIN users wu ON wu.id = e.providerId
    WHERE p.providerId = ? OR e.clientId = ? ORDER BY p.createdAt DESC`, [me, me]);
  const out = [];
  for (const row of rows) {
    const isProvider = Number(row.providerId) === me;
    const extra: Record<string, unknown> = {};
    if (isProvider && row.eventProviderId && Number(row.eventProviderId) !== me) extra.closedWith = row.winnerName ?? "outro profissional";
    if (row.status === "accepted") {
      const otherId = isProvider ? Number(row.clientId) : Number(row.providerId);
      const { details } = await loadDetails(otherId);
      extra.whatsappUrl = waLink(details?.phone, isProvider ? `Olá, ${row.clientName}! Sobre "${row.eventTitle}" no GastroConecta.` : `Olá, ${row.providerName}! Aceitei sua proposta no GastroConecta para "${row.eventTitle}".`);
    }
    if (!isProvider) {
      const rating = await query<any[]>("SELECT AVG(rating) average, COUNT(*) total FROM gastro_reviews WHERE targetId = ?", [row.providerId]);
      extra.providerRating = { average: Number(rating[0]?.average ?? 0), count: Number(rating[0]?.total ?? 0) };
      // Custo estimado é informação interna do profissional.
      row.costCents = 0; row.breakdown = null;
    }
    out.push({ ...mapProposal(row), ...(isProvider ? {} : { clientView: true }), ...extra });
  }
  res.json({ proposals: out });
}));

const proposalSchema = z.object({
  eventId: idSchema, amountCents: z.number().int().positive().max(2_000_000_000), message: z.string().trim().min(2).max(5000),
  scope: scopeSchema.default("labor"), costCents: z.number().int().min(0).max(2_000_000_000).default(0),
  paymentTerms: z.string().trim().min(5, "Informe as condições de pagamento").max(600), eventTime: timeSchema.optional(),
  breakdown: z.record(z.string(), z.unknown()).optional().refine(value => !value || JSON.stringify(value).length <= 200_000, "Detalhamento grande demais"),
});

router.post("/proposals", wrap(async (req, res) => {
  const context = await auth(req);
  if (context.profile.accountType !== "provider") throw new HttpError(403, "Somente profissionais enviam propostas");
  if (context.profile.status !== "active") throw new HttpError(403, "Seu cadastro está em análise pela administração; aguarde a aprovação para enviar propostas.");
  const { details, completedAt } = await loadDetails(context.user.id);
  if (!providerDetailsComplete(details, completedAt)) throw new HttpError(403, "Complete seu cadastro de profissional para enviar propostas.");
  await assertSubscriptionActive(context.user.id);
  await assertNoReviewGuard(context.user.id);
  const input = body(req, proposalSchema);
  const event = await query<any[]>("SELECT id FROM gastro_events WHERE id = ? AND status = 'open' AND providerId IS NULL AND (preferredProviderId IS NULL OR preferredProviderId = ?) LIMIT 1", [input.eventId, context.user.id]);
  if (!event[0]) throw new HttpError(404, "Pedido não disponível");
  const existing = await query<any[]>("SELECT id, status FROM gastro_proposals WHERE eventId = ? AND providerId = ? LIMIT 1", [input.eventId, context.user.id]);
  if (existing[0] && ["pending", "accepted"].includes(existing[0].status)) throw new HttpError(409, "Você já enviou uma proposta para este pedido");
  const values = [input.amountCents, input.message, input.scope, input.costCents, input.paymentTerms, input.eventTime ?? null, input.breakdown ? JSON.stringify(input.breakdown) : null];
  let id: number;
  if (existing[0]) { await execute("UPDATE gastro_proposals SET amountCents = ?, message = ?, scope = ?, costCents = ?, paymentTerms = ?, eventTime = ?, breakdown = ?, status = 'pending', createdAt = CURRENT_TIMESTAMP WHERE id = ?", [...values, existing[0].id]); id = Number(existing[0].id); }
  else id = Number((await execute("INSERT INTO gastro_proposals (amountCents, message, scope, costCents, paymentTerms, eventTime, breakdown, eventId, providerId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [...values, input.eventId, context.user.id])).insertId);
  await execute("DELETE FROM gc_event_dismissals WHERE eventId = ? AND userId = ?", [input.eventId, context.user.id]);
  const rows = await query<any[]>("SELECT p.*, u.name providerName, e.title eventTitle FROM gastro_proposals p JOIN users u ON u.id = p.providerId JOIN gastro_events e ON e.id = p.eventId WHERE p.id = ?", [id]);
  res.status(201).json({ proposal: mapProposal(rows[0]) });
}));

router.post("/proposals/:id/withdraw", wrap(async (req, res) => {
  const context = await auth(req);
  const id = parse(idSchema, req.params.id);
  const result = await execute("UPDATE gastro_proposals SET status = 'withdrawn' WHERE id = ? AND providerId = ? AND status = 'pending'", [id, context.user.id]);
  if (!result.affectedRows) throw new HttpError(409, "Proposta não pode ser retirada");
  res.json({ ok: true });
}));

/** Cliente recusa uma proposta para manter o painel limpo. */
router.post("/proposals/:id/decline", wrap(async (req, res) => {
  const context = await auth(req);
  const id = parse(idSchema, req.params.id);
  const result = await execute("UPDATE gastro_proposals p JOIN gastro_events e ON e.id = p.eventId SET p.status = 'rejected' WHERE p.id = ? AND e.clientId = ? AND p.status = 'pending'", [id, context.user.id]);
  if (!result.affectedRows) throw new HttpError(409, "Proposta não pode ser recusada");
  res.json({ ok: true });
}));

/** Cliente aceita ("OK"): fecha o pedido, revela o WhatsApp e gera o contrato em PDF. */
router.post("/proposals/:id/accept", wrap(async (req, res) => {
  const context = await auth(req);
  if (context.profile.accountType !== "client") throw new HttpError(403, "Somente o cliente aceita propostas");
  await assertNoReviewGuard(context.user.id);
  const proposalId = parse(idSchema, req.params.id);
  const clientData = await loadDetails(context.user.id);
  if (!clientContractDataComplete(clientData.details)) throw new HttpError(428, "Antes de aceitar, preencha seus dados para o contrato (CPF, endereço, telefone e foto do rosto) em Meus dados.");
  const acceptedAt = new Date();
  const ip = clientIp(req).slice(0, 64);
  const result = await withTransaction(async connection => {
    const [proposals] = await connection.execute<any[]>("SELECT p.* FROM gastro_proposals p WHERE p.id = ? LIMIT 1 FOR UPDATE", [proposalId]);
    const proposal = proposals[0];
    if (!proposal) throw new HttpError(404, "Proposta não encontrada");
    const [events] = await connection.execute<any[]>("SELECT * FROM gastro_events WHERE id = ? LIMIT 1 FOR UPDATE", [proposal.eventId]);
    const event = events[0];
    if (!event || Number(event.clientId) !== context.user.id) throw new HttpError(404, "Proposta não encontrada");
    if (event.status !== "open" || proposal.status !== "pending") throw new HttpError(409, "Esta proposta não pode mais ser aceita");
    if ((await phaseFor(Number(proposal.providerId))) === "blocked") throw new HttpError(409, "Este profissional está temporariamente indisponível. Escolha outra proposta.");
    await connection.execute("UPDATE gastro_events SET providerId = ?, status = 'booked', acceptedProposalId = ? WHERE id = ?", [proposal.providerId, proposalId, event.id]);
    await connection.execute("UPDATE gastro_proposals SET status = CASE WHEN id = ? THEN 'accepted' ELSE 'rejected' END WHERE eventId = ? AND status = 'pending'", [proposalId, event.id]);
    const [users] = await connection.execute<any[]>("SELECT id, name, email FROM users WHERE id IN (?, ?)", [event.clientId, proposal.providerId]);
    const byId = new Map(users.map((u: any) => [Number(u.id), u]));
    const providerData = await loadDetails(Number(proposal.providerId));
    const [inserted] = await connection.execute<any>("INSERT INTO gastro_contracts (kind, eventId, proposalId, createdByUserId, title, payload, acceptedIp) VALUES ('B', ?, ?, ?, ?, '{}', ?)", [event.id, proposalId, context.user.id, `Contrato - ${event.title}`.slice(0, 240), ip]);
    const contractId = Number(inserted.insertId);
    const payload = buildContractPayload({
      contractNumber: `GC-${String(contractId).padStart(6, "0")}`, acceptedAt, acceptedIp: ip,
      client: { userId: context.user.id, name: byId.get(Number(event.clientId))?.name ?? "", email: byId.get(Number(event.clientId))?.email ?? "", details: clientData.details },
      provider: { userId: Number(proposal.providerId), name: byId.get(Number(proposal.providerId))?.name ?? "", email: byId.get(Number(proposal.providerId))?.email ?? "", details: providerData.details },
      event, proposal,
    });
    await connection.execute("UPDATE gastro_contracts SET payload = ? WHERE id = ?", [JSON.stringify(payload), contractId]);
    return { contractId, providerName: payload.provider.name, phone: providerData.details?.phone as string | undefined, title: String(event.title) };
  });
  await audit(context.user.id, "proposal.accepted", { proposalId, contractId: result.contractId }, context.user.id);
  res.json({ ok: true, contractId: result.contractId, whatsappUrl: waLink(result.phone, `Olá! Aceitei sua proposta no GastroConecta para "${result.title}". Vamos alinhar os detalhes?`) });
}));

// ------------------------------------------------------------------ avaliações

router.get("/reviews", wrap(async (req, res) => {
  const context = await auth(req);
  const pending = await pendingReviews(context.user.id);
  const rows = await query<any[]>("SELECT r.*, ru.name reviewerName, tu.name targetName, e.title eventTitle FROM gastro_reviews r JOIN users ru ON ru.id = r.reviewerId JOIN users tu ON tu.id = r.targetId JOIN gastro_events e ON e.id = r.eventId WHERE r.reviewerId = ? OR r.targetId = ? ORDER BY r.createdAt DESC", [context.user.id, context.user.id]);
  const received = rows.filter(row => Number(row.targetId) === context.user.id);
  const average = received.length ? received.reduce((sum, row) => sum + Number(row.rating), 0) / received.length : 0;
  res.json({
    pending, overdue: (await pendingReviews(context.user.id, true)).length,
    average: Math.round(average * 10) / 10, count: received.length,
    reviews: rows.map(row => ({ id: Number(row.id), eventId: Number(row.eventId), eventTitle: row.eventTitle, reviewerId: Number(row.reviewerId), reviewerName: row.reviewerName ?? "", targetId: Number(row.targetId), targetName: row.targetName ?? "", rating: Number(row.rating), feedback: row.feedback, createdAt: new Date(row.createdAt).toISOString(), mine: Number(row.reviewerId) === context.user.id })),
  });
}));

const reviewSchema = z.object({ eventId: idSchema, targetId: idSchema, rating: z.number().int().min(1).max(5), feedback: z.string().trim().min(5, "Escreva um comentário (mínimo 5 caracteres)").max(2000) });
router.post("/reviews", wrap(async (req, res) => {
  const context = await auth(req);
  const input = body(req, reviewSchema);
  const rows = await query<any[]>("SELECT * FROM gastro_events WHERE id = ? AND status = 'completed' AND (clientId = ? OR providerId = ?) LIMIT 1", [input.eventId, context.user.id, context.user.id]);
  const event = rows[0];
  if (!event) throw new HttpError(403, "Avaliação disponível somente para participantes de serviços concluídos");
  const expected = Number(event.clientId) === context.user.id ? Number(event.providerId) : Number(event.clientId);
  if (input.targetId !== expected) throw new HttpError(403, "Vínculo de avaliação inválido");
  try { await execute("INSERT INTO gastro_reviews (eventId, reviewerId, targetId, rating, feedback) VALUES (?, ?, ?, ?, ?)", [input.eventId, context.user.id, input.targetId, input.rating, input.feedback]); }
  catch (error) { if (String(error).includes("Duplicate")) throw new HttpError(409, "Avaliação já registrada"); throw error; }
  res.status(201).json({ ok: true, growthPrompt: true });
}));

// ------------------------------------------------------------------ contratos (cliente, profissional e administração)

async function canUseContract(contract: any, context: AuthContext): Promise<boolean> {
  if (await isOwner(context)) return true;
  if (!contract.eventId) return Number(contract.createdByUserId) === context.user.id;
  const rows = await query<any[]>("SELECT id FROM gastro_events WHERE id = ? AND (clientId = ? OR providerId = ?) LIMIT 1", [contract.eventId, context.user.id, context.user.id]);
  return Boolean(rows[0]);
}

const mapContract = (row: any) => ({ id: Number(row.id), title: row.title, status: row.status, createdAt: new Date(row.createdAt).toISOString(), ...(row.eventId ? { eventId: Number(row.eventId) } : {}), ...(row.clientName ? { clientName: row.clientName, providerName: row.providerName ?? "" } : {}), ...(row.amountCents != null ? { amountCents: Number(row.amountCents) } : {}) });

router.get("/contracts", wrap(async (req, res) => {
  const context = await auth(req);
  const rows = await query<any[]>("SELECT c.*, cu.name clientName, pu.name providerName, p.amountCents FROM gastro_contracts c JOIN gastro_events e ON e.id = c.eventId JOIN users cu ON cu.id = e.clientId LEFT JOIN users pu ON pu.id = e.providerId LEFT JOIN gastro_proposals p ON p.id = c.proposalId WHERE e.clientId = ? OR e.providerId = ? ORDER BY c.createdAt DESC", [context.user.id, context.user.id]);
  res.json({ contracts: rows.map(mapContract) });
}));

router.get("/admin/contracts", wrap(async (req, res) => {
  await admin(req);
  const rows = await query<any[]>("SELECT c.*, cu.name clientName, pu.name providerName, p.amountCents FROM gastro_contracts c LEFT JOIN gastro_events e ON e.id = c.eventId LEFT JOIN users cu ON cu.id = e.clientId LEFT JOIN users pu ON pu.id = e.providerId LEFT JOIN gastro_proposals p ON p.id = c.proposalId ORDER BY c.createdAt DESC LIMIT 1000");
  res.json({ contracts: rows.map(mapContract) });
}));

router.get("/contracts/:id/pdf", wrap(async (req, res) => {
  const context = await auth(req);
  const contractId = parse(idSchema, req.params.id);
  const rows = await query<any[]>("SELECT * FROM gastro_contracts WHERE id = ? LIMIT 1", [contractId]);
  if (!rows[0] || !(await canUseContract(rows[0], context))) throw new HttpError(404, "Contrato não encontrado");
  const payload = json(rows[0].payload);
  const pdf = payload.version === 2 ? contractPdf(payload as ContractPayload) : legacyContractPdf(rows[0].title, payload);
  if (await isOwner(context)) await audit(context.user.id, "admin.contract_download", { contractId }, contractId);
  res.type("application/pdf").set({ "Content-Disposition": `attachment; filename=contrato-gastroconecta-${contractId}.pdf`, "Cache-Control": "private, no-store" }).send(pdf);
}));

// ------------------------------------------------------------------ financeiro do profissional

const EXPENSE_CATEGORIES = ["ingredientes", "insumos", "embalagens", "transporte", "equipe", "nota_fiscal", "equipamentos", "outros"] as const;
const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES), description: z.string().trim().min(2).max(240), amountCents: z.number().int().positive().max(2_000_000_000),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), eventId: idSchema.nullable().optional(), mediaId: idSchema.nullable().optional(),
});

async function providerOnly(req: Request) {
  const context = await auth(req);
  if (context.profile.accountType !== "provider") throw new HttpError(403, "Área exclusiva de profissionais");
  return context;
}

const monthKey = (value: unknown) => { const d = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 7); };

router.get("/finance", wrap(async (req, res) => {
  const context = await providerOnly(req);
  const me = context.user.id;
  const expenses = await query<any[]>("SELECT * FROM gc_provider_expenses WHERE userId = ? ORDER BY spentOn DESC, id DESC LIMIT 1000", [me]);
  const proposals = await query<any[]>("SELECT p.id, p.amountCents, p.costCents, p.status, p.createdAt, e.id eventId, e.title, e.eventDate, e.status eventStatus, e.category FROM gastro_proposals p JOIN gastro_events e ON e.id = p.eventId WHERE p.providerId = ?", [me]);
  const won = proposals.filter(p => p.status === "accepted");
  const submitted = proposals.filter(p => p.status !== "withdrawn").length;
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  const monthly = months.map(month => {
    const revenue = won.filter(p => monthKey(p.eventDate ?? p.createdAt) === month).reduce((s, p) => s + Number(p.amountCents), 0);
    const spent = expenses.filter(e => monthKey(e.spentOn) === month).reduce((s, e) => s + Number(e.amountCents), 0);
    const completed = won.filter(p => p.eventStatus === "completed" && monthKey(p.eventDate ?? p.createdAt) === month).length;
    const mealPreps = won.filter(p => p.category === "mealPrep" && monthKey(p.eventDate ?? p.createdAt) === month).length;
    return { month, revenueCents: revenue, expensesCents: spent, profitCents: revenue - spent, completed, mealPreps };
  });
  const byEvent = won.map(p => {
    const actual = expenses.filter(e => Number(e.eventId) === Number(p.eventId)).reduce((s, e) => s + Number(e.amountCents), 0);
    const cost = Math.max(actual, Number(p.costCents ?? 0));
    return { eventId: Number(p.eventId), title: p.title, date: isoDate(p.eventDate) ?? undefined, status: p.eventStatus, revenueCents: Number(p.amountCents), estimatedCostCents: Number(p.costCents ?? 0), actualExpensesCents: actual, profitCents: Number(p.amountCents) - cost, loss: Number(p.amountCents) - cost < 0 };
  });
  const totalRevenue = won.reduce((s, p) => s + Number(p.amountCents), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amountCents), 0);
  res.json({
    expenses: expenses.map(e => ({ id: Number(e.id), category: e.category, description: e.description, amountCents: Number(e.amountCents), spentOn: isoDate(e.spentOn), ...(e.eventId ? { eventId: Number(e.eventId) } : {}), ...(e.mediaId ? { fileUrl: `/api/gastro/media/${Number(e.mediaId)}` } : {}) })),
    totals: { revenueCents: totalRevenue, expensesCents: totalExpenses, profitCents: totalRevenue - totalExpenses },
    conversion: { submitted, won: won.length, rate: conversionRate(submitted, won.length) },
    completedEvents: won.filter(p => p.eventStatus === "completed").length,
    monthly, byEvent,
  });
}));

router.post("/finance/expenses", wrap(async (req, res) => {
  const context = await providerOnly(req);
  const input = body(req, expenseSchema);
  if (input.eventId) {
    const ok = await query<any[]>("SELECT id FROM gastro_events WHERE id = ? AND providerId = ? LIMIT 1", [input.eventId, context.user.id]);
    if (!ok[0]) throw new HttpError(400, "Pedido vinculado inválido");
  }
  if (input.mediaId) {
    const ok = await query<any[]>("SELECT id FROM gc_media WHERE id = ? AND ownerId = ? AND kind = 'invoice' LIMIT 1", [input.mediaId, context.user.id]);
    if (!ok[0]) throw new HttpError(400, "Arquivo da nota não encontrado");
  }
  const result = await execute("INSERT INTO gc_provider_expenses (userId, eventId, category, description, amountCents, spentOn, mediaId) VALUES (?, ?, ?, ?, ?, ?, ?)", [context.user.id, input.eventId ?? null, input.category, input.description, input.amountCents, input.spentOn, input.mediaId ?? null]);
  res.status(201).json({ id: Number(result.insertId) });
}));

router.delete("/finance/expenses/:id", wrap(async (req, res) => {
  const context = await providerOnly(req);
  const id = parse(idSchema, req.params.id);
  const result = await execute("DELETE FROM gc_provider_expenses WHERE id = ? AND userId = ?", [id, context.user.id]);
  if (!result.affectedRows) throw new HttpError(404, "Lançamento não encontrado");
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ Copilot (chat IA)

router.get("/messages", wrap(async (req, res) => {
  const context = await auth(req);
  const rows = await query<any[]>("SELECT id, role, content, createdAt FROM gastro_messages WHERE userId = ? ORDER BY createdAt ASC, id ASC", [context.user.id]);
  res.json({ messages: rows.map(row => ({ id: Number(row.id), role: row.role, content: row.content, createdAt: new Date(row.createdAt).toISOString() })) });
}));

function resolveCopilotEndpoint(base: string) {
  const normalized = base.replace(/\/+$/, "");
  if (/\/v1\/chat\/completions$/i.test(normalized)) return normalized;
  if (/\/v1$/i.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

/** Provedor de IA do Copilot: infraestrutura Manus ou chave OpenAI própria (OPENAI_API_KEY). */
export function copilotProvider() {
  const manusBase = ENV.forgeApiUrl || process.env.BUILT_IN_FORGE_API_URL;
  const manusKey = ENV.forgeApiKey || process.env.BUILT_IN_FORGE_API_KEY;
  if (manusBase && manusKey) return { base: manusBase, key: manusKey, model: process.env.COPILOT_MODEL || "gpt-5-mini" };
  const key = process.env.OPENAI_API_KEY || "";
  const base = process.env.OPENAI_API_BASE || process.env.OPENAI_BASE_URL || (key ? "https://api.openai.com" : "");
  return { base, key, model: process.env.COPILOT_MODEL || "gpt-4o-mini" };
}

async function callCopilot(history: Array<{ role: "user" | "assistant"; content: string }>, accountType: AccountType, catalog: Awaited<ReturnType<typeof loadProfessionals>>) {
  const { base, key, model } = copilotProvider();
  if (!base || !key) throw new HttpError(503, "Copilot indisponível: credencial de IA não configurada");
  const catalogContext = catalog.slice(0, 30).map(item => ({ id: item.id, name: item.name, type: item.type, category: item.category, city: item.city, topRated: item.topRated, demo: item.demo }));
  const system = `Você é o Copilot do GastroConecta. Perfil atual: ${accountType === "provider" ? "profissional" : "cliente"}. Clientes usam a plataforma de graça; profissionais (chefs, personal chefs, cozinheiros, auxiliares, barmans, garçons, limpeza e jardinagem) pagam só uma assinatura mensal fixa e recebem 100% do valor negociado, sem comissão. Ajude profissionais a calcular ingredientes, porções, brigada, custos de marmitas, limpeza e jardinagem, preço e margem; sempre lembre que os valores são estimativas editáveis. Ajude clientes a descrever pedidos e escolher profissionais do catálogo abaixo. Não exponha e-mails, documentos ou IDs internos. Portfólios demo são ilustrativos e não contratáveis. Não invente avaliações, disponibilidade ou garantias jurídicas. Catálogo: ${JSON.stringify(catalogContext)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(resolveCopilotEndpoint(base), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: controller.signal, body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...history], ...(model.startsWith("gpt-5") ? {} : { temperature: 0.2 }) }) });
    if (!response.ok) throw new HttpError(503, "Copilot indisponível no provedor de IA");
    const data = await response.json() as any;
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) throw new HttpError(503, "Copilot retornou uma resposta inválida");
    return reply.trim().slice(0, 12000);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new HttpError(504, "Copilot excedeu o tempo limite");
    throw new HttpError(503, "Copilot indisponível no provedor de IA");
  } finally {
    clearTimeout(timeout);
  }
}

router.post("/copilot", wrap(async (req, res) => {
  const context = await auth(req);
  limit(`copilot:${clientIp(req)}`, 12, 60_000, "Copilot temporariamente limitado; tente novamente mais tarde");
  const input = body(req, z.object({ message: z.string().trim().min(1).max(4000) }));
  const previous = await query<any[]>("SELECT role, content FROM gastro_messages WHERE userId = ? ORDER BY createdAt DESC, id DESC LIMIT 20", [context.user.id]);
  const history = [...previous.reverse().map(row => ({ role: row.role as "user" | "assistant", content: row.content })), { role: "user" as const, content: input.message }];
  const reply = await callCopilot(history, context.profile.accountType, await loadProfessionals());
  await withTransaction(async connection => {
    await connection.execute("INSERT INTO gastro_messages (userId, role, content) VALUES (?, 'user', ?)", [context.user.id, input.message]);
    await connection.execute("INSERT INTO gastro_messages (userId, role, content) VALUES (?, 'assistant', ?)", [context.user.id, reply]);
  });
  res.json({ reply });
}));

router.get("/integrations", wrap(async (_req, res) => {
  const provider = copilotProvider();
  const aiConfigured = Boolean(provider.base && provider.key);
  res.json({ integrations: [
    { id: "payments", name: "Mercado Pago (assinaturas via Pix)", status: mpConfigured() ? "configured" : "pending", description: mpConfigured() ? "Pix avulso e Pix recorrente ativos." : "Defina MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET para cobrar as assinaturas." },
    { id: "email", name: "E-mail (recuperação de senha)", status: mailConfigured() ? "configured" : "pending", description: mailConfigured() ? "Envio pelo Resend ativo." : "Defina RESEND_API_KEY e MAIL_FROM; sem isso, a administração gera o link de redefinição." },
    { id: "copilot", name: "Copilot IA", status: aiConfigured ? "configured" : "pending", description: aiConfigured ? `Modelo: ${provider.model}.` : "Defina OPENAI_API_KEY para ativar o chat do Copilot (as calculadoras funcionam sem IA)." },
  ] });
}));

// ------------------------------------------------------------------ administração

router.get("/admin/users", wrap(async (req, res) => {
  await admin(req);
  const rows = await query<any[]>("SELECT u.*, p.accountType, p.status, p.city, p.bio, p.vip, p.discountPercent, p.featured, d.completedAt profileCompletedAt FROM users u JOIN account_profiles p ON p.userId = u.id LEFT JOIN gc_profile_details d ON d.userId = u.id ORDER BY u.createdAt DESC");
  res.json({ users: rows.map(mapUser) });
}));

const adminUserSchema = z.object({ name: z.string().trim().min(2).max(160).optional(), status: z.enum(["active", "pending", "suspended", "blocked", "deleted"]).optional(), vip: z.boolean().optional(), discountPercent: z.number().int().min(0).max(100).optional(), featured: z.boolean().optional(), faceVerified: z.boolean().optional() }).strict();
router.patch("/admin/users/:id", wrap(async (req, res) => {
  const context = await admin(req);
  const targetId = parse(idSchema, req.params.id);
  const input = body(req, adminUserSchema);
  if (targetId === context.user.id && input.status !== undefined && input.status !== "active") throw new HttpError(400, "O proprietário não pode deixar a própria conta inativa");
  const target = await query<any[]>("SELECT u.id, p.accountType FROM users u JOIN account_profiles p ON p.userId = u.id WHERE u.id = ? LIMIT 1", [targetId]);
  if (!target[0]) throw new HttpError(404, "Usuário não encontrado");
  const { details, completedAt } = await loadDetails(targetId);
  if (input.status === "active" && target[0].accountType === "provider" && !providerDetailsComplete(details, completedAt)) throw new HttpError(400, "Este cadastro ainda está incompleto. A aprovação fica liberada quando o profissional enviar todos os dados obrigatórios (logo, foto do rosto, fotos dos serviços, documento e Pix).");
  await withTransaction(async connection => {
    if (input.name !== undefined) await connection.execute("UPDATE users SET name = ? WHERE id = ?", [input.name, targetId]);
    const updates: string[] = [], values: unknown[] = [];
    for (const key of ["status", "vip", "discountPercent", "featured"] as const) if (input[key] !== undefined) { updates.push(`${key} = ?`); values.push(input[key]); }
    if (updates.length) await connection.execute(`UPDATE account_profiles SET ${updates.join(", ")} WHERE userId = ?`, [...values, targetId]);
    if (input.faceVerified !== undefined && details) await connection.execute("UPDATE gc_profile_details SET details = ? WHERE userId = ?", [JSON.stringify({ ...details, faceVerified: input.faceVerified, faceVerifiedAt: input.faceVerified ? new Date().toISOString() : null }), targetId]);
  });
  await audit(context.user.id, "admin.user_update", input, targetId);
  res.json({ ok: true });
}));

router.get("/admin/overview", wrap(async (req, res) => {
  await admin(req);
  const [users, events, pending, activeSubs, contracts] = await Promise.all([
    query<any[]>("SELECT COUNT(*) count FROM users").then(rows => Number(rows[0].count)),
    query<any[]>("SELECT COUNT(*) count FROM gastro_events").then(rows => Number(rows[0].count)),
    query<any[]>("SELECT COUNT(*) count FROM account_profiles WHERE status = 'pending'").then(rows => Number(rows[0].count)),
    query<any[]>("SELECT COUNT(*) count FROM gc_provider_subscriptions WHERE periodEnd > CURRENT_TIMESTAMP").then(rows => Number(rows[0].count)),
    query<any[]>("SELECT COUNT(*) count FROM gastro_contracts").then(rows => Number(rows[0].count)),
  ]);
  const revenue = await query<any[]>("SELECT COALESCE(SUM(amountCents), 0) total FROM gc_subscription_payments WHERE status = 'approved' AND approvedAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)");
  res.json({ users, events, pending, activeSubscriptions: activeSubs, contracts, subscriptionRevenue30dCents: Number(revenue[0]?.total ?? 0) });
}));

router.get("/admin/audit", wrap(async (req, res) => {
  await admin(req);
  const rows = await query<any[]>("SELECT id, action, details, createdAt, actorId FROM gastro_audit_logs ORDER BY createdAt DESC LIMIT 500");
  res.json({ logs: rows.map(row => ({ id: Number(row.id), action: row.action, details: row.details, createdAt: new Date(row.createdAt).toISOString(), actorId: Number(row.actorId) })) });
}));

router.get("/report/pdf", wrap(async (req, res) => {
  const context = await admin(req);
  const count = (sql: string) => query<any[]>(sql).then(rows => Number(rows[0].count));
  const [users, providers, events, contracts, activeSubs] = await Promise.all([
    count("SELECT COUNT(*) count FROM users"), count("SELECT COUNT(*) count FROM account_profiles WHERE accountType = 'provider'"), count("SELECT COUNT(*) count FROM gastro_events"),
    count("SELECT COUNT(*) count FROM gastro_contracts"), count("SELECT COUNT(*) count FROM gc_provider_subscriptions WHERE periodEnd > CURRENT_TIMESTAMP"),
  ]);
  const logs = await query<any[]>("SELECT action, actorId, targetId, createdAt FROM gastro_audit_logs ORDER BY createdAt DESC LIMIT 200");
  await audit(context.user.id, "admin.report_pdf", { users, events, contracts });
  const pdf = buildPdf([
    { kind: "title", text: "Relatório de auditoria - GastroConecta" },
    { kind: "pair", label: "Gerado em", value: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) },
    { kind: "pair", label: "Usuários", value: String(users) }, { kind: "pair", label: "Profissionais", value: String(providers) },
    { kind: "pair", label: "Assinaturas vigentes", value: String(activeSubs) }, { kind: "pair", label: "Pedidos", value: String(events) }, { kind: "pair", label: "Contratos gerados", value: String(contracts) },
    { kind: "heading", text: "Últimas ações registradas" },
    ...logs.map(log => ({ kind: "text" as const, text: `${new Date(log.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} - ${log.action} - ator #${log.actorId}${log.targetId ? ` - alvo #${log.targetId}` : ""}` })),
  ], "GastroConecta - Auditoria");
  res.type("application/pdf").set("Content-Disposition", "attachment; filename=gastro-relatorio.pdf").send(pdf);
}));

router.get("/admin/coupons", wrap(async (req, res) => {
  await admin(req);
  const rows = await query<any[]>("SELECT id, code, discountPercent, cashbackPercent, active FROM gastro_coupons ORDER BY createdAt DESC");
  res.json({ coupons: rows.map(row => ({ id: Number(row.id), code: row.code, discountPercent: Number(row.discountPercent), cashbackPercent: Number(row.cashbackPercent), active: Boolean(row.active) })) });
}));

router.post("/admin/coupons", wrap(async (req, res) => {
  const context = await admin(req);
  const input = body(req, z.object({ code: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/), discountPercent: z.number().int().min(0).max(100), cashbackPercent: z.number().int().min(0).max(100) }));
  try { await execute("INSERT INTO gastro_coupons (code, discountPercent, cashbackPercent) VALUES (?, ?, ?)", [input.code.toUpperCase(), input.discountPercent, input.cashbackPercent]); } catch (error) { if (String(error).includes("Duplicate")) throw new HttpError(409, "Cupom já existe"); throw error; }
  await audit(context.user.id, "admin.coupon_create", { code: input.code.toUpperCase(), discountPercent: input.discountPercent, cashbackPercent: input.cashbackPercent });
  res.status(201).json({ ok: true });
}));

router.get("/subscription-summary/:userId", wrap(async (req, res) => {
  await admin(req);
  res.json(await subscriptionSummary(parse(idSchema, req.params.userId)));
}));

router.use(errorHandler);

export function registerGastroRoutes(app: Express) {
  app.use("/api/gastro", router);
}
