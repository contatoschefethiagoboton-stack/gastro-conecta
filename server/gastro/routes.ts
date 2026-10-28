import { Router, type Express, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../_core/env";
import { HttpError } from "@shared/_core/errors";
import { execute, query, withTransaction } from "./db";
import { loadProfessionals } from "./catalog";
import {
  AccountType,
  AuthContext,
  clearGcSession,
  createGcSession,
  createLocalUser,
  ensureProfile,
  gcCookieOptions,
  getProfile,
  getUserByEmail,
  isOwner,
  passwordIsStrong,
  publicUser,
  requireAuth,
  resolveAuth,
  setGcSession,
  verifyPassword,
} from "./auth";
import { calculateIntentScore, DAILY_MINIMUMS_CENTS, eventFeeForGross, feeForDaily, isoDate } from "./rules";

const router = Router();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const copilotAttempts = new Map<string, { count: number; resetAt: number }>();
const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(10).max(200);
const accountTypeSchema = z.enum(["client", "provider", "freelancer"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= new Date().toISOString().slice(0, 10);
}, "A data deve ser válida e não pode estar no passado");
const roleSchema = z.enum(["Cozinheiro", "Ajudante", "Garçom", "Barman"]);
const idSchema = z.coerce.number().int().positive();

function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => handler(req, res).catch(next);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, result.error.issues.map(issue => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; "));
  return result.data;
}

function body<T>(req: Request, schema: z.ZodType<T>): T {
  return parse(schema, req.body);
}

function assertOrigin(req: Request) {
  const origin = req.headers.origin;
  // Browser mutations must carry an exact same-host Origin. An explicitly marked
  // CLI request may omit it; an arbitrary missing Origin is never trusted.
  if (!origin) {
    if (req.headers["x-gastro-cli"] === "1") return;
    throw new HttpError(403, "Origem não permitida");
  }
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") throw new HttpError(403, "Origem não permitida");
    const requestHost = req.get("host")?.trim().toLowerCase();
    const forwarded = req.headers["x-forwarded-host"];
    const trustedForwardedHost = typeof forwarded === "string" && !forwarded.includes(",") ? forwarded.trim().toLowerCase() : "";
    const allowedHosts = [requestHost, trustedForwardedHost].filter((host): host is string => Boolean(host));
    if (!allowedHosts.includes(originUrl.host.toLowerCase())) throw new HttpError(403, "Origem não permitida");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, "Origem não permitida");
  }
}

function rateLimit(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return;
  }
  if (current.count >= 8) throw new HttpError(429, "Muitas tentativas; tente novamente mais tarde");
  current.count += 1;
}

function requestKey(req: Request, email?: string) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `${ip}:${email?.toLowerCase() ?? ""}`;
}

function copilotRateLimit(req: Request) {
  const key = `copilot:${req.ip || req.socket.remoteAddress || "unknown"}`;
  const now = Date.now();
  const current = copilotAttempts.get(key);
  if (!current || current.resetAt <= now) {
    copilotAttempts.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  if (current.count >= 12) throw new HttpError(429, "Copilot temporariamente limitado; tente novamente mais tarde");
  current.count += 1;
}

async function auth(req: Request): Promise<AuthContext> {
  return requireAuth(req);
}

async function admin(req: Request): Promise<AuthContext> {
  const context = await auth(req);
  if (!(await isOwner(context))) throw new HttpError(403, "Acesso reservado à administração");
  return context;
}

async function audit(actorId: number, action: string, details: unknown, targetId?: number) {
  await execute("INSERT INTO gastro_audit_logs (action, details, actorId, targetId) VALUES (?, ?, ?, ?)", [action, JSON.stringify(details), actorId, targetId ?? null]);
}

function mapUser(row: any) {
  return {
    id: Number(row.id),
    name: row.name ?? "",
    email: row.email ?? "",
    accountType: row.accountType,
    role: row.role === "admin" ? "admin" : "user",
    status: row.status,
    city: row.city ?? undefined,
    bio: row.bio ?? undefined,
    vip: Boolean(row.vip),
    discountPercent: Number(row.discountPercent ?? 0),
    featured: Boolean(row.featured),
    ...(row.profileCompletedAt !== undefined ? { profileComplete: Boolean(row.profileCompletedAt) } : {}),
    ...(row.createdAt ? { createdAt: new Date(row.createdAt).toISOString() } : {}),
  };
}

function mapEvent(row: any, exposeAddress = true) {
  return {
    id: Number(row.id), clientId: Number(row.clientId), ...(row.providerId ? { providerId: Number(row.providerId) } : {}),
    title: row.title, type: row.type, date: isoDate(row.eventDate) ?? undefined, city: row.city,
    ...(exposeAddress && row.location ? { location: row.location } : {}),
    guests: Number(row.guests), budgetCents: Number(row.budgetCents), description: row.description ?? undefined,
    score: Number(row.score), status: row.status, createdAt: new Date(row.createdAt).toISOString(),
  };
}

function mapProposal(row: any) {
  return { id: Number(row.id), eventId: Number(row.eventId), providerId: Number(row.providerId), amountCents: Number(row.amountCents), message: row.message, status: row.status, ...(row.providerName ? { providerName: row.providerName } : {}), ...(row.eventTitle ? { eventTitle: row.eventTitle } : {}) };
}

function mapJob(row: any) {
  return { id: Number(row.id), title: row.title, role: row.role, date: row.jobDate, city: row.city, hours: Number(row.hours), dailyCents: Number(row.dailyCents), description: row.description, status: row.status, providerId: Number(row.providerId), ...(row.eventId != null ? { eventId: Number(row.eventId) } : {}) };
}

async function eventParticipantIds(eventId: number): Promise<number[]> {
  const rows = await query<any[]>(`SELECT clientId AS userId FROM gastro_events WHERE id = ?
    UNION SELECT providerId AS userId FROM gastro_events WHERE id = ? AND providerId IS NOT NULL
    UNION SELECT a.userId FROM gastro_jobs j INNER JOIN gastro_applications a ON a.jobId = j.id AND a.status = 'accepted' WHERE j.eventId = ?`, [eventId, eventId, eventId]);
  return [...new Set(rows.map(row => Number(row.userId)).filter(Number.isFinite))];
}

async function pendingReviews(userId: number, overdueOnly = false) {
  const overdueClause = overdueOnly ? " AND e.completedAt < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)" : "";
  const events = await query<any[]>(`SELECT DISTINCT e.id, e.title FROM gastro_events e
    LEFT JOIN gastro_jobs j ON j.eventId = e.id
    LEFT JOIN gastro_applications a ON a.jobId = j.id AND a.status = 'accepted'
    WHERE e.status = 'completed' AND e.completedAt IS NOT NULL${overdueClause}
      AND (e.clientId = ? OR e.providerId = ? OR a.userId = ?)`, [userId, userId, userId]);
  const pending: Array<{ eventId: number; title: string; targets: Array<{ id: number; name: string }> }> = [];
  for (const event of events) {
    const participants = await eventParticipantIds(Number(event.id));
    if (!participants.includes(userId)) continue;
    const targets: Array<{ id: number; name: string }> = [];
    for (const targetId of participants.filter(id => id !== userId)) {
      const found = await query<any[]>("SELECT u.id, COALESCE(u.name, '') name FROM users u WHERE u.id = ? LIMIT 1", [targetId]);
      const already = await query<any[]>("SELECT id FROM gastro_reviews WHERE eventId = ? AND reviewerId = ? AND targetId = ? LIMIT 1", [event.id, userId, targetId]);
      if (found[0] && !already[0]) targets.push({ id: targetId, name: found[0].name });
    }
    if (targets.length) pending.push({ eventId: Number(event.id), title: event.title, targets });
  }
  return pending;
}

async function assertNoReviewGuard(userId: number) {
  if ((await pendingReviews(userId, true)).length) throw new HttpError(423, "Avaliação de vínculo pendente há mais de 24 horas");
}

async function eventForUser(eventId: number, userId: number) {
  const rows = await query<any[]>("SELECT * FROM gastro_events WHERE id = ? AND (clientId = ? OR providerId = ? OR EXISTS (SELECT 1 FROM gastro_jobs j INNER JOIN gastro_applications a ON a.jobId = j.id WHERE j.eventId = gastro_events.id AND a.userId = ? AND a.status = 'accepted')) LIMIT 1", [eventId, userId, userId, userId]);
  return rows[0] ?? null;
}

async function canUseContract(contract: any, userId: number): Promise<boolean> {
  if (contract.kind === "A") return Number(contract.createdByUserId) === userId && !contract.eventId && !contract.jobId;
  if (contract.kind === "B" && contract.eventId) {
    const rows = await query<any[]>("SELECT id FROM gastro_events WHERE id = ? AND (clientId = ? OR providerId = ?) LIMIT 1", [contract.eventId, userId, userId]);
    return Boolean(rows[0]);
  }
  if (contract.kind === "C" && contract.jobId) {
    const rows = await query<any[]>("SELECT j.id FROM gastro_jobs j LEFT JOIN gastro_applications a ON a.jobId = j.id AND a.userId = ? AND a.status = 'accepted' WHERE j.id = ? AND (j.providerId = ? OR a.userId = ?) LIMIT 1", [userId, contract.jobId, userId, userId]);
    return Boolean(rows[0]);
  }
  return false;
}

function pdfEscape(text: string) {
  return text.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function makePdf(title: string, lines: string[]) {
  const safeLines = [title, "Minuta gerada pelo GastroConecta - requer revisão jurídica.", ...lines].slice(0, 70);
  const stream = ["BT", "/F1 14 Tf", "50 780 Td", ...safeLines.flatMap((line, index) => [`(${pdfEscape(line.slice(0, 115))}) Tj`, index < safeLines.length - 1 ? "0 -18 Td" : ""]), "ET"].join("\n");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf, "ascii")); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

function centsLabel(value: unknown) {
  const cents = Number(value);
  return Number.isFinite(cents) ? `R$ ${(cents / 100).toFixed(2).replace(".", ",")}` : "não informado";
}

function contractDocumentLines(kind: string, content: Record<string, unknown>): string[] {
  if (kind === "A") return [
    "Objeto: termos da plataforma e do prestador.",
    `Termos da plataforma: ${String(content.platformTerms ?? "")}`,
    `Termos do prestador: ${String(content.providerTerms ?? "")}`,
    `Uso da plataforma: ${String(content.platformTermsOfUse ?? "")}`,
    `Aviso: ${String(content.legalNotice ?? "")}`,
  ];
  if (kind === "B") return [
    `Cliente: ${String(content.clientName ?? "")}`,
    `Fornecedor: ${String(content.providerName ?? "")}`,
    `Data: ${String(content.eventDate ?? "")}`,
    `Local: ${String(content.location ?? "")} (${String(content.city ?? "")})`,
    `Menu/serviço: ${String(content.menu ?? "")}`,
    `Detalhes do menu: ${String(content.menuDetails ?? "")}`,
    `Valor da proposta: ${centsLabel(content.proposalValueCents)} (${String(content.proposalValueSource ?? "")})`,
    `Aviso: ${String(content.legalNotice ?? "")}`,
  ];
  return [
    `Fornecedor: ${String(content.providerName ?? "")}`,
    `Freelancer: ${String(content.freelancerName ?? "")}`,
    `Vaga: ${String(content.jobTitle ?? "")} - ${String(content.role ?? "")}`,
    `Data/local: ${String(content.date ?? "")} - ${String(content.city ?? "")}`,
    `Carga horária: ${String(content.hours ?? "")} horas`,
    `Diária bruta do freelancer: ${centsLabel(content.freelancerGrossCents)}`,
    `Taxa do contratante: ${centsLabel(content.clientFeeCents)}`,
    `Taxa: ${String(content.feeNotice ?? "")}`,
    `Aviso: ${String(content.legalNotice ?? "")}`,
  ];
}

const registerSchema = z.object({ name: z.string().trim().min(2).max(160), email: emailSchema, password: passwordSchema, accountType: accountTypeSchema, city: z.string().trim().min(2).max(160) });
const loginSchema = z.object({ email: emailSchema, password: passwordSchema });
const profileSchema = z.object({ name: z.string().trim().min(2).max(160).optional(), city: z.string().trim().min(2).max(160).optional(), bio: z.string().max(5000).optional(), specialty: z.string().max(160).optional() }).strict();
const eventSchema = z.object({ title: z.string().trim().min(2).max(180), type: z.string().trim().min(2).max(100), date: dateSchema.optional(), city: z.string().trim().min(2).max(160), location: z.string().trim().max(240).optional(), guests: z.number().int().min(1).max(100000), budgetCents: z.number().int().min(0).max(2_000_000_000), description: z.string().max(5000).optional(), stage: z.enum(["ready", "comparing", "research"]), professionalId: z.string().max(160).optional() });
const proposalSchema = z.object({ eventId: idSchema, amountCents: z.number().int().positive().max(2_000_000_000), message: z.string().trim().min(2).max(5000) });
const jobSchema = z.object({ title: z.string().trim().min(2).max(180), role: roleSchema, date: dateSchema, city: z.string().trim().min(2).max(160), hours: z.number().int().min(1).max(24), dailyCents: z.number().int().positive().max(2_000_000), description: z.string().trim().min(2).max(5000), eventId: idSchema.optional() });
const subscriptionSchema = z.object({ planId: z.enum(["quinzenal", "mensal"]) });
const reviewSchema = z.object({ eventId: idSchema, targetId: idSchema, rating: z.number().int().min(1).max(5), feedback: z.string().trim().min(2).max(2000) });
const contractSchema = z.object({ kind: z.enum(["A", "B", "C"]), eventId: idSchema.optional(), jobId: idSchema.optional() })
  .refine(value => value.kind === "A" ? !value.eventId && !value.jobId : value.kind === "B" ? Boolean(value.eventId) && !value.jobId : Boolean(value.jobId) && !value.eventId, "Combinação de tipo e vínculo inválida");

function assertActiveProvider(context: AuthContext) {
  if (context.profile.accountType !== "provider") throw new HttpError(403, "Somente fornecedores realizam esta operação");
  if (context.profile.status !== "active") throw new HttpError(403, "Fornecedor pendente: aguarde a ativação para realizar transações");
}

router.use((req, _res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertOrigin(req);
  next();
});

router.get("/me", wrap(async (req, res) => {
  const context = await resolveAuth(req);
  if (!context) { res.json({ user: null }); return; }
  let profileComplete = context.profile.accountType === "client" || context.user.role === "admin";
  if (!profileComplete) {
    const rows = await query<any[]>("SELECT completedAt FROM gc_profile_details WHERE userId = ? LIMIT 1", [context.user.id]);
    profileComplete = Boolean(rows[0]?.completedAt);
  }
  res.json({ user: { ...publicUser(context), specialty: context.profile.specialty ?? undefined, profileComplete } });
}));

router.post("/register", wrap(async (req, res) => {
  assertOrigin(req);
  const input = body(req, registerSchema);
  rateLimit(requestKey(req, input.email));
  if (!passwordIsStrong(input.password)) throw new HttpError(400, "A senha deve ter 10 caracteres, maiúscula, minúscula, número e caractere especial");
  const created = await createLocalUser(input);
  const token = await createGcSession(created.user.id);
  res.cookie("gc_session", token, gcCookieOptions(req));
  const context = { user: created.user, profile: created.profile, source: "gastro" as const };
  res.status(201).json({ user: publicUser(context) });
}));

router.post("/login", wrap(async (req, res) => {
  assertOrigin(req);
  const input = body(req, loginSchema);
  rateLimit(requestKey(req, input.email));
  const found = await getUserByEmail(input.email);
  if (!found || !(await verifyPassword(input.password, found.profile.passwordHash))) throw new HttpError(401, "Credenciais inválidas");
  if (["blocked", "deleted", "suspended"].includes(found.profile.status)) throw new HttpError(403, "Conta indisponível");
  const token = await createGcSession(found.user.id);
  res.cookie("gc_session", token, gcCookieOptions(req));
  const context = { ...found, source: "gastro" as const };
  res.json({ user: publicUser(context) });
}));

router.post("/logout", wrap(async (req, res) => {
  assertOrigin(req);
  await clearGcSession(req, res);
  res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(req), maxAge: 0 });
  res.json({ ok: true });
}));

router.patch("/profile", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  const input = body(req, profileSchema);
  const fields: string[] = [], values: unknown[] = [];
  for (const key of ["name", "city", "bio", "specialty"] as const) if (input[key] !== undefined) { fields.push(`${key} = ?`); values.push(input[key]); }
  if (!fields.length) throw new HttpError(400, "Nenhuma alteração informada");
  await withTransaction(async connection => {
    if (input.name !== undefined) { await connection.execute("UPDATE users SET name = ? WHERE id = ?", [input.name, context.user.id]); }
    const profileFields = fields.filter(field => !field.startsWith("name ="));
    const profileValues = values.filter((_value, index) => fields[index] !== "name = ?");
    if (profileFields.length) await connection.execute(`UPDATE account_profiles SET ${profileFields.join(", ")} WHERE userId = ?`, [...profileValues, context.user.id]);
  });
  const rows = await query<any[]>("SELECT u.*, p.userId, p.accountType, p.status, p.city, p.bio, p.specialty, p.vip, p.discountPercent, p.featured FROM users u JOIN account_profiles p ON p.userId = u.id WHERE u.id = ?", [context.user.id]);
  res.json({ user: mapUser(rows[0]) });
}));

router.get("/professionals", wrap(async (_req, res) => {
  res.json({ professionals: await loadProfessionals() });
}));

router.get("/events", wrap(async (req, res) => {
  const context = await auth(req);
  const canRadar = context.profile.accountType === "provider" && context.profile.status === "active";
  const rows = canRadar
    ? await query<any[]>("SELECT * FROM gastro_events WHERE clientId = ? OR providerId = ? OR (status = 'open' AND providerId IS NULL AND (preferredProviderId IS NULL OR preferredProviderId = ?)) ORDER BY createdAt DESC", [context.user.id, context.user.id, context.user.id])
    : await query<any[]>("SELECT * FROM gastro_events WHERE clientId = ? OR providerId = ? ORDER BY createdAt DESC", [context.user.id, context.user.id]);
  res.json({ events: rows.map(row => mapEvent(row, Number(row.clientId) === context.user.id || Number(row.providerId) === context.user.id)) });
}));

router.post("/events", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  await assertNoReviewGuard(context.user.id);
  if (context.profile.accountType !== "client") throw new HttpError(403, "Somente clientes criam eventos");
  const input = body(req, eventSchema);
  let preferredProviderId: number | null = null;
  if (input.professionalId) {
    const userMatch = /^user-(\d+)$/.exec(input.professionalId);
    if (userMatch) {
      preferredProviderId = Number(userMatch[1]);
      const provider = await query<any[]>("SELECT p.userId FROM account_profiles p WHERE p.userId = ? AND p.accountType = 'provider' AND p.status = 'active' LIMIT 1", [preferredProviderId]);
      if (!provider[0]) throw new HttpError(400, "O profissional selecionado não está disponível");
    } else if (!input.professionalId.startsWith("demo-")) {
      throw new HttpError(400, "Profissional selecionado inválido");
    }
  }
  const score = calculateIntentScore(input);
  const result = await execute("INSERT INTO gastro_events (clientId, preferredProviderId, title, type, eventDate, city, location, guests, budgetCents, description, stage, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [context.user.id, preferredProviderId, input.title, input.type, input.date ?? null, input.city, input.location ?? null, input.guests, input.budgetCents, input.description ?? null, input.stage, score]);
  const rows = await query<any[]>("SELECT * FROM gastro_events WHERE id = ?", [result.insertId]);
  res.status(201).json({ event: mapEvent(rows[0]) });
}));

// Operational transition used by the dashboard before the 24h review window.
// It never creates a payment or wallet entry.
router.patch("/events/:id/complete", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  await assertNoReviewGuard(context.user.id);
  const eventId = parse(idSchema, req.params.id);
  await withTransaction(async connection => {
    const [rows] = await connection.execute<any[]>("SELECT * FROM gastro_events WHERE id = ? AND (clientId = ? OR providerId = ?) LIMIT 1 FOR UPDATE", [eventId, context.user.id, context.user.id]);
    const event = rows[0];
    if (!event) throw new HttpError(404, "Evento não encontrado");
    if (event.status !== "booked") throw new HttpError(409, "Somente eventos reservados podem ser concluídos");
    const eventDate = isoDate(event.eventDate);
    const today = new Date().toISOString().slice(0, 10);
    if (!eventDate) throw new HttpError(409, "O evento precisa ter uma data para ser concluído");
    if (eventDate > today) throw new HttpError(409, "O evento ainda não ocorreu");
    await connection.execute("UPDATE gastro_events SET status = 'completed', completedAt = CURRENT_TIMESTAMP WHERE id = ?", [eventId]);
  });
  const rows = await query<any[]>("SELECT * FROM gastro_events WHERE id = ?", [eventId]);
  res.json({ event: mapEvent(rows[0]) });
}));

router.get("/proposals", wrap(async (req, res) => {
  const context = await auth(req);
  const rows = await query<any[]>("SELECT p.*, u.name providerName, e.title eventTitle FROM gastro_proposals p JOIN users u ON u.id = p.providerId JOIN gastro_events e ON e.id = p.eventId WHERE p.providerId = ? OR e.clientId = ? ORDER BY p.createdAt DESC", [context.user.id, context.user.id]);
  res.json({ proposals: rows.map(mapProposal) });
}));

router.post("/proposals", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  assertActiveProvider(context);
  await assertNoReviewGuard(context.user.id);
  const input = body(req, proposalSchema);
  const event = await query<any[]>("SELECT * FROM gastro_events WHERE id = ? AND status = 'open' AND (preferredProviderId IS NULL OR preferredProviderId = ?) LIMIT 1", [input.eventId, context.user.id]);
  if (!event[0]) throw new HttpError(404, "Evento não disponível");
  const existing = await query<any[]>("SELECT id FROM gastro_proposals WHERE eventId = ? AND providerId = ? AND status IN ('pending','accepted') LIMIT 1", [input.eventId, context.user.id]);
  if (existing[0]) throw new HttpError(409, "Já existe uma proposta para este evento");
  const result = await execute("INSERT INTO gastro_proposals (eventId, providerId, amountCents, message) VALUES (?, ?, ?, ?)", [input.eventId, context.user.id, input.amountCents, input.message]);
  const rows = await query<any[]>("SELECT p.*, u.name providerName, e.title eventTitle FROM gastro_proposals p JOIN users u ON u.id = p.providerId JOIN gastro_events e ON e.id = p.eventId WHERE p.id = ?", [result.insertId]);
  res.status(201).json({ proposal: mapProposal(rows[0]) });
}));

router.post("/proposals/:id/accept", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  await assertNoReviewGuard(context.user.id);
  const proposalId = parse(idSchema, req.params.id);
  await withTransaction(async connection => {
    const [proposals] = await connection.execute<any[]>("SELECT p.*, e.clientId, e.status eventStatus FROM gastro_proposals p JOIN gastro_events e ON e.id = p.eventId WHERE p.id = ? LIMIT 1 FOR UPDATE", [proposalId]);
    const proposal = proposals[0];
    if (!proposal || Number(proposal.clientId) !== context.user.id) throw new HttpError(404, "Proposta não encontrada");
    if (proposal.eventStatus !== "open" || proposal.status !== "pending") throw new HttpError(409, "Proposta não pode ser aceita");
    await connection.execute("UPDATE gastro_events SET providerId = ?, status = 'booked' WHERE id = ? AND status = 'open'", [proposal.providerId, proposal.eventId]);
    await connection.execute("UPDATE gastro_proposals SET status = CASE WHEN id = ? THEN 'accepted' ELSE 'rejected' END WHERE eventId = ? AND status = 'pending'", [proposalId, proposal.eventId]);
  });
  res.json({ ok: true });
}));

router.get("/jobs", wrap(async (req, res) => {
  const context = await resolveAuth(req);
  const canSeeOwnJobs = Boolean(context && context.profile.accountType === "provider" && !["suspended", "blocked", "deleted"].includes(context.profile.status));
  const rows = canSeeOwnJobs
    ? await query<any[]>("SELECT * FROM gastro_jobs WHERE status = 'open' OR providerId = ? ORDER BY createdAt DESC", [context!.user.id])
    : await query<any[]>("SELECT * FROM gastro_jobs WHERE status = 'open' ORDER BY createdAt DESC");
  res.json({ jobs: rows.map(mapJob) });
}));

router.post("/jobs", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  assertActiveProvider(context);
  await assertNoReviewGuard(context.user.id);
  const input = body(req, jobSchema);
  if (input.dailyCents < DAILY_MINIMUMS_CENTS[input.role]) throw new HttpError(400, `A diária mínima para ${input.role} é ${DAILY_MINIMUMS_CENTS[input.role]} centavos`);
  if (input.eventId) {
    const event = await query<any[]>("SELECT id FROM gastro_events WHERE id = ? AND providerId = ? AND status <> 'cancelled' LIMIT 1", [input.eventId, context.user.id]);
    if (!event[0]) throw new HttpError(400, "O evento vinculado precisa estar reservado para este fornecedor");
  }
  const result = await execute("INSERT INTO gastro_jobs (providerId, eventId, title, role, jobDate, city, hours, dailyCents, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [context.user.id, input.eventId ?? null, input.title, input.role, input.date, input.city, input.hours, input.dailyCents, input.description]);
  const rows = await query<any[]>("SELECT * FROM gastro_jobs WHERE id = ?", [result.insertId]);
  res.status(201).json({ job: mapJob(rows[0]) });
}));

router.post("/jobs/:id/apply", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  await assertNoReviewGuard(context.user.id);
  if (context.profile.accountType !== "freelancer") throw new HttpError(403, "Somente freelancers se candidatam");
  if (context.profile.status !== "active") throw new HttpError(403, "Seu cadastro de freelancer ainda está em análise. Complete o cadastro e aguarde a aprovação.");
  const jobId = parse(idSchema, req.params.id);
  const job = await query<any[]>("SELECT id FROM gastro_jobs WHERE id = ? AND status = 'open' LIMIT 1", [jobId]);
  if (!job[0]) throw new HttpError(404, "Vaga não disponível");
  try { await execute("INSERT INTO gastro_applications (jobId, userId) VALUES (?, ?)", [jobId, context.user.id]); } catch (error) { if (!String(error).includes("Duplicate")) throw error; throw new HttpError(409, "Candidatura já registrada"); }
  res.json({ ok: true });
}));

router.post("/applications/:id/accept", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  assertActiveProvider(context);
  await assertNoReviewGuard(context.user.id);
  const applicationId = parse(idSchema, req.params.id);
  await withTransaction(async connection => {
    const [rows] = await connection.execute<any[]>("SELECT a.*, j.providerId, j.status jobStatus FROM gastro_applications a INNER JOIN gastro_jobs j ON j.id = a.jobId WHERE a.id = ? LIMIT 1 FOR UPDATE", [applicationId]);
    const application = rows[0];
    if (!application || Number(application.providerId) !== context.user.id) throw new HttpError(404, "Candidatura não encontrada");
    if (application.status !== "pending" || application.jobStatus !== "open") throw new HttpError(409, "Candidatura não pode ser aceita");
    await connection.execute("UPDATE gastro_applications SET status = CASE WHEN id = ? THEN 'accepted' ELSE 'rejected' END WHERE jobId = ? AND status = 'pending'", [applicationId, application.jobId]);
    await connection.execute("UPDATE gastro_jobs SET status = 'booked' WHERE id = ? AND status = 'open'", [application.jobId]);
  });
  res.json({ ok: true });
}));

router.patch("/jobs/:id/complete", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  await assertNoReviewGuard(context.user.id);
  const jobId = parse(idSchema, req.params.id);
  await withTransaction(async connection => {
    const [rows] = await connection.execute<any[]>("SELECT j.*, a.userId acceptedUserId FROM gastro_jobs j LEFT JOIN gastro_applications a ON a.jobId = j.id AND a.status = 'accepted' WHERE j.id = ? AND (j.providerId = ? OR a.userId = ?) LIMIT 1 FOR UPDATE", [jobId, context.user.id, context.user.id]);
    const job = rows[0];
    if (!job) throw new HttpError(404, "Vaga não encontrada");
    if (job.status !== "booked") throw new HttpError(409, "Somente vagas reservadas podem ser concluídas");
    const jobDate = isoDate(job.jobDate);
    if (!jobDate || jobDate > new Date().toISOString().slice(0, 10)) throw new HttpError(409, "A diária ainda não ocorreu");
    await connection.execute("UPDATE gastro_jobs SET status = 'completed' WHERE id = ?", [jobId]);
  });
  const rows = await query<any[]>("SELECT * FROM gastro_jobs WHERE id = ?", [jobId]);
  res.json({ job: mapJob(rows[0]) });
}));

router.get("/applications", wrap(async (req, res) => {
  const context = await auth(req);
  const rows = await query<any[]>("SELECT a.*, j.title jobTitle, j.dailyCents, j.providerId, u.name freelancerName, d.details freelancerDetails FROM gastro_applications a JOIN gastro_jobs j ON j.id = a.jobId JOIN users u ON u.id = a.userId LEFT JOIN gc_profile_details d ON d.userId = a.userId WHERE a.userId = ? OR j.providerId = ? ORDER BY a.createdAt DESC", [context.user.id, context.user.id]);
  res.json({ applications: rows.map(row => {
    const isHiring = Number(row.providerId) === context.user.id;
    let extra: Record<string, unknown> = {};
    if (isHiring && row.freelancerDetails) {
      try {
        const d = JSON.parse(row.freelancerDetails);
        extra = {
          freelancer: { roles: Array.isArray(d.roles) ? d.roles : [], experience: typeof d.experience === "string" ? d.experience.slice(0, 600) : "", city: d.city ?? "", ...(d.resumeMediaId ? { resumeUrl: `/api/gastro/media/${Number(d.resumeMediaId)}` } : {}), ...(d.avatarMediaId ? { avatarUrl: `/api/gastro/media/${Number(d.avatarMediaId)}` } : {}) },
          // Dados de pagamento só para o contratante, depois de aceitar a candidatura.
          ...(row.status === "accepted" ? { payout: { holderName: d.bank?.holderName ?? "", bankName: d.bank?.bankName ?? "", agency: d.bank?.agency ?? "", account: d.bank?.account ?? "", accountType: d.bank?.accountType ?? "", pixKeyType: d.bank?.pixKeyType ?? "", pixKey: d.bank?.pixKey ?? "", phone: d.phone ?? "" } } : {}),
        };
      } catch { /* cadastro inválido não derruba a lista */ }
    }
    return { id: Number(row.id), jobId: Number(row.jobId), userId: Number(row.userId), freelancerName: row.freelancerName ?? "", status: row.status, ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}), ...(row.dailyCents != null ? { dailyCents: Number(row.dailyCents) } : {}), ...extra };
  }) });
}));

router.get("/wallet", wrap(async (req, res) => {
  const context = await auth(req);
  const rows = await query<any[]>("SELECT * FROM gastro_wallet_transactions WHERE userId = ? ORDER BY createdAt DESC", [context.user.id]);
  const transactions = rows.map(row => ({ id: Number(row.id), type: row.type, description: row.description, grossCents: Number(row.grossCents), feeCents: Number(row.feeCents), netCents: Number(row.netCents), status: row.status, createdAt: new Date(row.createdAt).toISOString() }));
  const availableCents = transactions.filter(row => row.status === "completed").reduce((sum, row) => sum + (row.type === "credit" ? row.netCents : -row.netCents), 0);
  const pendingCents = transactions.filter(row => row.status === "pending").reduce((sum, row) => sum + (row.type === "credit" ? row.netCents : -row.netCents), 0);
  res.json({ transactions, availableCents, pendingCents });
}));

router.get("/subscriptions", wrap(async (req, res) => {
  const context = await auth(req);
  const rows = await query<any[]>("SELECT * FROM gastro_subscriptions WHERE userId = ? ORDER BY createdAt DESC LIMIT 1", [context.user.id]);
  res.json({ plans: [{ id: "quinzenal", name: "Plano quinzenal", days: 15, priceCents: 0 }, { id: "mensal", name: "Plano mensal", days: 30, priceCents: 0 }], subscription: rows[0] ? { id: Number(rows[0].id), planId: rows[0].planId, status: rows[0].status, priceCents: Number(rows[0].priceCents), days: Number(rows[0].days), createdAt: new Date(rows[0].createdAt).toISOString() } : null });
}));

router.post("/subscriptions", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  const input = body(req, subscriptionSchema);
  const days = input.planId === "mensal" ? 30 : 15;
  const result = await execute("INSERT INTO gastro_subscriptions (userId, planId, status, priceCents, days) VALUES (?, ?, 'pending_payment', 0, ?)", [context.user.id, input.planId, days]);
  const rows = await query<any[]>("SELECT * FROM gastro_subscriptions WHERE id = ?", [result.insertId]);
  res.status(201).json({ subscription: { id: Number(rows[0].id), planId: rows[0].planId, status: rows[0].status, priceCents: Number(rows[0].priceCents), days: Number(rows[0].days), createdAt: new Date(rows[0].createdAt).toISOString() } });
}));

router.get("/reviews", wrap(async (req, res) => {
  const context = await auth(req);
  const pending = await pendingReviews(context.user.id);
  const rows = await query<any[]>("SELECT * FROM gastro_reviews WHERE reviewerId = ? OR targetId = ? ORDER BY createdAt DESC", [context.user.id, context.user.id]);
  res.json({ pending, reviews: rows.map(row => ({ id: Number(row.id), eventId: Number(row.eventId), reviewerId: Number(row.reviewerId), targetId: Number(row.targetId), rating: Number(row.rating), feedback: row.feedback, createdAt: new Date(row.createdAt).toISOString() })) });
}));

router.post("/reviews", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  const input = body(req, reviewSchema);
  const event = await eventForUser(input.eventId, context.user.id);
  if (!event || event.status !== "completed") throw new HttpError(403, "Avaliação disponível somente para participantes de eventos concluídos");
  const participants = await eventParticipantIds(input.eventId);
  if (!participants.includes(context.user.id) || !participants.includes(input.targetId) || input.targetId === context.user.id) throw new HttpError(403, "Vínculo de avaliação inválido");
  const duplicate = await query<any[]>("SELECT id FROM gastro_reviews WHERE eventId = ? AND reviewerId = ? AND targetId = ? LIMIT 1", [input.eventId, context.user.id, input.targetId]);
  if (duplicate[0]) throw new HttpError(409, "Avaliação já registrada");
  await execute("INSERT INTO gastro_reviews (eventId, reviewerId, targetId, rating, feedback) VALUES (?, ?, ?, ?, ?)", [input.eventId, context.user.id, input.targetId, input.rating, input.feedback]);
  res.status(201).json({ ok: true });
}));

router.get("/contracts", wrap(async (req, res) => {
  const context = await auth(req);
  const rows = await query<any[]>("SELECT * FROM gastro_contracts ORDER BY createdAt DESC");
  const visible = [];
  for (const row of rows) if (await canUseContract(row, context.user.id)) visible.push({ id: Number(row.id), kind: row.kind, title: row.title, status: row.status, createdAt: new Date(row.createdAt).toISOString() });
  res.json({ contracts: visible });
}));

router.post("/contracts", wrap(async (req, res) => {
  assertOrigin(req);
  const context = await auth(req);
  const input = body(req, contractSchema);
  if (input.kind !== "A") await assertNoReviewGuard(context.user.id);
  let title = "";
  let payload: Record<string, unknown> = {};
  let eventId: number | null = null;
  let jobId: number | null = null;

  if (input.kind === "A") {
    if (!(await isOwner(context))) throw new HttpError(403, "A minuta A é reservada ao proprietário da plataforma");
    title = "Minuta A - termos da plataforma e prestador";
    payload = {
      documentType: "Termos da plataforma e do prestador",
      platformTerms: "A GastroConecta facilita a conexão entre clientes e prestadores; não é parte da execução do serviço nem confirma pagamentos.",
      providerTerms: "O prestador responde pela veracidade do perfil, proposta, disponibilidade, execução e obrigações operacionais assumidas com o cliente.",
      platformTermsOfUse: "Uso sujeito às regras da plataforma, proteção de dados aplicável e revisão das partes antes da assinatura.",
      legalNotice: "Minuta operacional sem garantia de validade jurídica; revisar com profissional habilitado.",
    };
  } else if (input.kind === "B" && input.eventId) {
    const eventRows = await query<any[]>("SELECT e.* FROM gastro_events e WHERE e.id = ? AND e.status = 'booked' AND (e.clientId = ? OR e.providerId = ?) LIMIT 1", [input.eventId, context.user.id, context.user.id]);
    const event = eventRows[0];
    if (!event || !event.providerId) throw new HttpError(403, "Vínculo de evento não autorizado");
    const names = await query<any[]>("SELECT id, COALESCE(name, '') name FROM users WHERE id IN (?, ?)", [event.clientId, event.providerId]);
    const nameById = new Map(names.map(row => [Number(row.id), String(row.name)]));
    const accepted = await query<any[]>("SELECT amountCents FROM gastro_proposals WHERE eventId = ? AND providerId = ? AND status = 'accepted' LIMIT 1", [event.id, event.providerId]);
    title = "Minuta B - cliente e fornecedor";
    eventId = Number(event.id);
    payload = {
      documentType: "Prestação de serviço gastronômico",
      clientName: nameById.get(Number(event.clientId)) ?? "Cliente",
      providerName: nameById.get(Number(event.providerId)) ?? "Fornecedor",
      eventDate: event.eventDate ?? "Data a confirmar",
      location: event.location ?? event.city,
      city: event.city,
      menu: event.type,
      menuDetails: event.description ?? "A definir entre as partes",
      proposalValueCents: accepted[0] ? Number(accepted[0].amountCents) : Number(event.budgetCents),
      proposalValueSource: accepted[0] ? "proposta aceita" : "orçamento informado no evento; confirmar antes da assinatura",
      legalNotice: "Minuta operacional sem garantia de validade jurídica; revisar com profissional habilitado.",
    };
  } else if (input.kind === "C" && input.jobId) {
    const rows = await query<any[]>("SELECT j.*, a.userId freelancerId, fu.name freelancerName, pu.name providerName FROM gastro_jobs j INNER JOIN gastro_applications a ON a.jobId = j.id AND a.status = 'accepted' INNER JOIN users fu ON fu.id = a.userId INNER JOIN users pu ON pu.id = j.providerId WHERE j.id = ? AND (j.providerId = ? OR a.userId = ?) LIMIT 1", [input.jobId, context.user.id, context.user.id]);
    const job = rows[0];
    if (!job) throw new HttpError(403, "A minuta C exige uma candidatura aceita e um participante da vaga");
    const dailyCents = Number(job.dailyCents);
    title = "Minuta C - fornecedor e freelancer";
    jobId = Number(job.id);
    payload = {
      documentType: "Prestação de serviço freelance",
      providerName: job.providerName ?? "Fornecedor",
      freelancerName: job.freelancerName ?? "Freelancer",
      role: job.role,
      jobTitle: job.title,
      date: job.jobDate,
      city: job.city,
      hours: Number(job.hours),
      dailyCents,
      clientFeeCents: feeForDaily(dailyCents),
      freelancerGrossCents: dailyCents,
      feeNotice: "A taxa de 10% é cobrada do contratante; não é descontada da diária bruta do freelancer.",
      legalNotice: "Minuta operacional sem garantia de validade jurídica; revisar com profissional habilitado.",
    };
  }

  const result = await execute("INSERT INTO gastro_contracts (kind, eventId, jobId, createdByUserId, title, payload) VALUES (?, ?, ?, ?, ?, ?)", [input.kind, eventId, jobId, context.user.id, title, JSON.stringify(payload)]);
  const rows = await query<any[]>("SELECT * FROM gastro_contracts WHERE id = ?", [result.insertId]);
  res.status(201).json({ contract: { id: Number(rows[0].id), kind: rows[0].kind, title: rows[0].title, status: rows[0].status, createdAt: new Date(rows[0].createdAt).toISOString() } });
}));

router.get("/contracts/:id/pdf", wrap(async (req, res) => {
  const context = await auth(req);
  const contractId = parse(idSchema, req.params.id);
  const rows = await query<any[]>("SELECT * FROM gastro_contracts WHERE id = ? LIMIT 1", [contractId]);
  if (!rows[0] || !(await canUseContract(rows[0], context.user.id))) throw new HttpError(404, "Contrato não encontrado");
  const contract = rows[0];
  const content = JSON.parse(contract.payload) as Record<string, unknown>;
  const pdf = makePdf(contract.title, contractDocumentLines(String(contract.kind), content));
  res.type("application/pdf").set("Content-Disposition", `inline; filename=gastro-contrato-${contract.id}.pdf`).send(pdf);
}));

router.get("/report/pdf", wrap(async (req, res) => {
  const context = await admin(req);
  const [users, events, proposals, wallet] = await Promise.all([
    query<any[]>("SELECT COUNT(*) count FROM users").then(rows => Number(rows[0].count)),
    query<any[]>("SELECT COUNT(*) count FROM gastro_events").then(rows => Number(rows[0].count)),
    query<any[]>("SELECT COUNT(*) count FROM gastro_proposals WHERE status = 'pending'").then(rows => Number(rows[0].count)),
    query<any[]>("SELECT COALESCE(SUM(feeCents), 0) revenue FROM gastro_wallet_transactions WHERE status = 'completed'").then(rows => Number(rows[0].revenue)),
  ]);
  await audit(context.user.id, "admin.report_pdf", { users, events, proposals, wallet });
  const pdf = makePdf("Relatório auditável GastroConecta", [`Usuários: ${users}`, `Eventos: ${events}`, `Propostas pendentes: ${proposals}`, `Comissões reconhecidas: ${wallet} centavos`, "Pagamentos só são reconhecidos quando um gateway homologado inserir transação concluída."]);
  res.type("application/pdf").set("Content-Disposition", "inline; filename=gastro-relatorio.pdf").send(pdf);
}));

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
  const endpoint = resolveCopilotEndpoint(base);
  const catalogContext = catalog.slice(0, 30).map(item => ({ id: item.id, name: item.name, type: item.type, category: item.category, city: item.city, description: item.description, price: item.price, tags: item.tags, featured: item.featured, demo: item.demo }));
  const system = `Você é o Copilot do GastroConecta. Perfil atual: ${accountType}. Recomende profissionais somente a partir do catálogo real abaixo, sem expor e-mails, segredos ou IDs internos; id público user-* pode ser usado somente para referência de seleção. Oriente o usuário a escolher o tipo de perfil correto (cliente, fornecedor ou freelancer) e explique que profissionais demo, quando aparecerem, são ilustrativos e não contratáveis. Seja claro sobre propostas, vagas, taxa do contratante e boas práticas operacionais para freelancers. Não invente pagamentos, verificação de identidade, avaliações, credenciais, notas, disponibilidade, emissão fiscal ou garantias jurídicas. Minutas são operacionais e requerem revisão jurídica. Catálogo real: ${JSON.stringify(catalogContext)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: controller.signal, body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...history], ...(model.startsWith("gpt-5") ? {} : { temperature: 0.2 }) }) });
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
  assertOrigin(req);
  const context = await auth(req);
  copilotRateLimit(req);
  const input = body(req, z.object({ message: z.string().trim().min(1).max(4000) }));
  const previous = await query<any[]>("SELECT role, content FROM gastro_messages WHERE userId = ? ORDER BY createdAt DESC, id DESC LIMIT 20", [context.user.id]);
  const history = [...previous.reverse().map(row => ({ role: row.role as "user" | "assistant", content: row.content })), { role: "user" as const, content: input.message }];
  const catalog = await loadProfessionals();
  // Persist only after a successful provider response, atomically, so a timeout
  // or provider error never leaves a duplicate user message in the conversation.
  const reply = await callCopilot(history, context.profile.accountType, catalog);
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
    { id: "payments", name: "Pagamentos", status: "pending", description: "Gateway, split, escrow e homologação ainda não configurados." },
    { id: "identity", name: "Biometria", status: "pending", description: "Nenhuma biometria é coletada sem fornecedor e consentimento." },
    { id: "meta", name: "Meta", status: "pending", description: "Integração Meta ainda não configurada; nenhuma conta ou evento é presumido." },
    { id: "google", name: "Google", status: "pending", description: "Integração Google ainda não configurada; nenhuma conta ou agenda é presumida." },
    { id: "nf", name: "Nota fiscal", status: "pending", description: "Emissão fiscal não está integrada e não é inventada pelo GastroConecta." },
    { id: "copilot", name: "Copilot IA", status: aiConfigured ? "configured" : "pending", description: aiConfigured ? `Endpoint configurado; modelo: ${provider.model}.` : "Defina OPENAI_API_KEY no Render para ativar o Copilot." },
  ], paymentsLive: false });
}));

router.post("/checkout", wrap(async (_req, _res) => { throw new HttpError(503, "Checkout indisponível: gateway de pagamentos não configurado ou homologado"); }));

router.get("/admin/users", wrap(async (req, res) => {
  await admin(req);
  const rows = await query<any[]>("SELECT u.*, p.accountType, p.status, p.city, p.bio, p.vip, p.discountPercent, p.featured, d.completedAt profileCompletedAt FROM users u JOIN account_profiles p ON p.userId = u.id LEFT JOIN gc_profile_details d ON d.userId = u.id ORDER BY u.createdAt DESC");
  res.json({ users: rows.map(mapUser) });
}));

const adminUserSchema = z.object({ name: z.string().trim().min(2).max(160).optional(), status: z.enum(["active", "pending", "suspended", "blocked", "deleted"]).optional(), vip: z.boolean().optional(), discountPercent: z.number().int().min(0).max(100).optional(), featured: z.boolean().optional() }).strict();
router.patch("/admin/users/:id", wrap(async (req, res) => {
  const context = await admin(req);
  const targetId = parse(idSchema, req.params.id);
  const input = body(req, adminUserSchema);
  if (targetId === context.user.id && input.status !== undefined && input.status !== "active") throw new HttpError(400, "O proprietário não pode deixar a própria conta inativa");
  const target = await query<any[]>("SELECT u.id, u.openId, p.accountType, d.completedAt FROM users u JOIN account_profiles p ON p.userId = u.id LEFT JOIN gc_profile_details d ON d.userId = u.id WHERE u.id = ? LIMIT 1", [targetId]);
  if (!target[0]) throw new HttpError(404, "Usuário não encontrado");
  // Parceiros e freelancers só podem ser aprovados com o cadastro completo (documentos, fotos e dados).
  if (input.status === "active" && target[0].accountType !== "client" && !target[0].completedAt) throw new HttpError(400, "Este cadastro ainda está incompleto. A aprovação fica liberada quando o usuário enviar todos os dados obrigatórios.");
  await withTransaction(async connection => {
    if (input.name !== undefined) await connection.execute("UPDATE users SET name = ? WHERE id = ?", [input.name, targetId]);
    const profileKeys = ["status", "vip", "discountPercent", "featured"] as const;
    const updates: string[] = [], values: unknown[] = [];
    for (const key of profileKeys) if (input[key] !== undefined) { updates.push(`${key} = ?`); values.push(input[key]); }
    if (updates.length) await connection.execute(`UPDATE account_profiles SET ${updates.join(", ")} WHERE userId = ?`, [...values, targetId]);
  });
  await audit(context.user.id, "admin.user_update", input, targetId);
  res.json({ ok: true });
}));

router.get("/admin/overview", wrap(async (req, res) => {
  await admin(req);
  const [users, events, pending, revenue] = await Promise.all([
    query<any[]>("SELECT COUNT(*) count FROM users").then(rows => Number(rows[0].count)),
    query<any[]>("SELECT COUNT(*) count FROM gastro_events").then(rows => Number(rows[0].count)),
    query<any[]>("SELECT COUNT(*) count FROM account_profiles WHERE status = 'pending'").then(rows => Number(rows[0].count)),
    query<any[]>("SELECT COALESCE(SUM(feeCents), 0) value FROM gastro_wallet_transactions WHERE status = 'completed'").then(rows => Number(rows[0].value)),
  ]);
  res.json({ users, events, pending, revenueCents: revenue });
}));

router.get("/admin/audit", wrap(async (req, res) => {
  await admin(req);
  const rows = await query<any[]>("SELECT id, action, details, createdAt, actorId FROM gastro_audit_logs ORDER BY createdAt DESC LIMIT 500");
  res.json({ logs: rows.map(row => ({ id: Number(row.id), action: row.action, details: row.details, createdAt: new Date(row.createdAt).toISOString(), actorId: Number(row.actorId) })) });
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

router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof HttpError ? error.message : "Erro interno";
  if (!(error instanceof HttpError)) console.error("[Gastro] request failed", error instanceof Error ? error.message : "unknown error");
  res.status(status).json({ error: message });
});

export function registerGastroRoutes(app: Express) {
  app.use("/api/gastro", router);
}
