// Rotas da versão independente (Render): conteúdo editável, arquivos no banco,
// cadastro completo de profissionais e dados de contrato do cliente, promoções, benefícios e admin.
import { Router, type Express, type Request } from "express";
import { z } from "zod";
import { HttpError } from "@shared/_core/errors";
import { contentFields, contentKeys, MAX_CONTENT_LENGTH } from "@shared/content";
import { EVENT_TYPES, isMonthDay, isPromotionActive, defaultPromotions, type Promotion } from "@shared/promotions";
import { isValidCEP, isValidCNPJ, isValidCPF, isValidHttpUrl, isValidPhoneBR, isValidPixKey, isValidUF, normalizeSocial, onlyDigits, type PixKeyType } from "@shared/validators";
import { assertOrigin, body, clientIp, errorHandler, limit, parse, wrap } from "./http";
import { dbConfigured, execute, query, withTransaction } from "./db";
import { getServiceCatalog, getSiteContent, invalidateSiteContent } from "./content";
import { assertOwnedMedia, MEDIA_KINDS, MEDIA_RULES, mediaUrl, pruneProfileMedia, saveMedia, type MediaKind } from "./media";
import { adminExists, consumeSetupCode, createOrPromoteAdmin, dbState, verifySetupCode } from "./bootstrap";
import { createGcSession, gcCookieOptions, getUserByEmail, hashPassword, isOwner, normalizeEmail, passwordIsStrong, publicUser, requireAuth, resolveAuth, verifyPassword, type AuthContext } from "./auth";
import { copilotProvider } from "./routes";
import { clientContractDataComplete, loadDetails, PROVIDER_SCHEMA_VERSION, providerDetailsComplete } from "./profiles";
import { allServices, findService, normalizeServiceCatalog } from "@shared/services";
import { normalizeDemos } from "@shared/catalog";
import { subscriptionSummary } from "./subscriptions";

const router = Router();
const idSchema = z.coerce.number().int().positive();

router.use((req, _res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertOrigin(req);
  next();
});

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

// ---------------------------------------------------------------- público

router.get("/site", wrap(async (_req, res) => {
  const content = await getSiteContent();
  let adminSetupRequired = false;
  if (dbConfigured() && dbState.ready) { try { adminSetupRequired = !(await adminExists()); } catch { /* banco indisponível */ } }
  const provider = copilotProvider();
  res.set("Cache-Control", "no-store").json({ content, aiEnabled: Boolean(provider.base && provider.key), adminSetupRequired, database: dbConfigured() ? (dbState.ready ? "ok" : "error") : "missing" });
}));

function mapPromotion(row: any): Promotion {
  return { id: Number(row.id), active: Boolean(row.active), start: row.startMd, end: row.endMd, badge: row.badge, title: row.title, text: row.text, cta: row.ctaLabel, whatsappMessage: row.whatsappMessage, eventType: row.eventType ?? undefined, imageUrl: row.imageUrl ?? undefined, sortOrder: Number(row.sortOrder ?? 0) };
}

router.get("/promotions", wrap(async (_req, res) => {
  let list: Promotion[] = defaultPromotions;
  if (dbConfigured()) {
    try { list = (await query<any[]>("SELECT * FROM gc_promotions WHERE active = 1 ORDER BY sortOrder ASC, id ASC")).map(mapPromotion); } catch { list = []; }
  }
  res.set("Cache-Control", "no-store").json({ promotions: list.filter(p => isPromotionActive(p)) });
}));

router.get("/media/:id", wrap(async (req, res) => {
  requireDb();
  const id = parse(idSchema, req.params.id);
  const rows = await query<any[]>("SELECT id, ownerId, kind, mime, filename, isPublic, data FROM gc_media WHERE id = ? LIMIT 1", [id]);
  const media = rows[0];
  if (!media) throw new HttpError(404, "Arquivo não encontrado");
  if (!media.isPublic) {
    const context = await resolveAuth(req);
    if (!context) throw new HttpError(401, "Autenticação necessária");
    const ownerId = Number(media.ownerId);
    // Arquivos privados (rosto, notas fiscais, currículos antigos): só o dono e a administração.
    const allowed = context.user.id === ownerId || (await isOwner(context));
    if (!allowed) throw new HttpError(403, "Arquivo restrito");
  }
  const data: Buffer = Buffer.isBuffer(media.data) ? media.data : Buffer.from(media.data);
  res.set({
    "Content-Type": media.mime,
    "Content-Length": String(data.length),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": media.isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
    ...(media.mime === "application/pdf" ? { "Content-Disposition": `inline; filename="${String(media.filename || `arquivo-${id}.pdf`).replace(/"/g, "")}"`, "Content-Security-Policy": "sandbox" } : {}),
  });
  res.end(data);
}));

// ---------------------------------------------------------------- arquivos

const uploadSchema = z.object({ kind: z.enum(MEDIA_KINDS as [MediaKind, ...MediaKind[]]), filename: z.string().max(200).optional(), data: z.string().min(16).max(8_000_000) });

router.post("/media", wrap(async (req, res) => {
  requireDb();
  const context = await requireAuth(req);
  limit(`upload:${context.user.id}`, 80, 60 * 60_000, "Muitos envios em pouco tempo; tente mais tarde");
  const input = body(req, uploadSchema);
  const admin = await isOwner(context);
  if (input.kind === "resume") throw new HttpError(400, "Envio de currículo não é mais utilizado");
  if (!admin && ["service", "invoice", "avatar"].includes(input.kind) && context.profile.accountType !== "provider") throw new HttpError(403, "Este envio é exclusivo de profissionais");
  const saved = await saveMedia({ ownerId: context.user.id, kind: input.kind, filename: input.filename, data: input.data, isAdmin: admin });
  if (admin && MEDIA_RULES[input.kind].adminOnly) await audit(context.user.id, "admin.media_upload", { id: saved.id, kind: input.kind, filename: input.filename ?? "" });
  res.status(201).json({ media: saved });
}));

router.delete("/media/:id", wrap(async (req, res) => {
  requireDb();
  const context = await requireAuth(req);
  const id = parse(idSchema, req.params.id);
  const admin = await isOwner(context);
  const result = admin ? await execute("DELETE FROM gc_media WHERE id = ?", [id]) : await execute("DELETE FROM gc_media WHERE id = ? AND ownerId = ?", [id, context.user.id]);
  if (!result.affectedRows) throw new HttpError(404, "Arquivo não encontrado");
  if (admin) await audit(context.user.id, "admin.media_delete", { id });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- cadastro completo

const text = (min: number, max: number, label: string) => z.string().trim().min(min, `${label}: mínimo de ${min} caracteres`).max(max, `${label}: máximo de ${max} caracteres`);
const addressShape = {
  cep: z.string().refine(isValidCEP, "CEP inválido").transform(onlyDigits),
  street: text(2, 160, "Rua"),
  number: text(1, 20, "Número"),
  complement: z.string().trim().max(80).default(""),
  district: text(2, 100, "Bairro"),
  city: text(2, 100, "Cidade"),
  state: z.string().trim().refine(isValidUF, "UF inválida").transform(value => value.toUpperCase()),
};
const phoneField = z.string().refine(isValidPhoneBR, "Telefone com DDD inválido").transform(onlyDigits);
const mediaId = z.number().int().positive();

const bankSchema = z.object({
  holderName: text(3, 160, "Titular da conta"),
  holderDocument: z.string().refine(value => isValidCPF(value) || isValidCNPJ(value), "CPF/CNPJ do titular inválido").transform(onlyDigits),
  bankName: text(2, 100, "Banco"),
  bankCode: z.string().trim().max(5).default(""),
  agency: z.string().trim().regex(/^\d{3,5}(-?[\dXx])?$/, "Agência inválida"),
  account: z.string().trim().regex(/^\d{3,15}(-?[\dXx])?$/, "Conta inválida"),
  accountType: z.enum(["corrente", "poupanca", "pagamento"]),
  pixKeyType: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]),
  pixKey: z.string().trim().min(3).max(120),
}).refine(bank => isValidPixKey(bank.pixKeyType as PixKeyType, bank.pixKey), { message: "Chave Pix inválida para o tipo escolhido", path: ["pixKey"] });

const socialShape = z.object({
  instagram: z.string().trim().max(200).default(""),
  facebook: z.string().trim().max(200).default(""),
  tiktok: z.string().trim().max(200).default(""),
  youtube: z.string().trim().max(200).default(""),
  linkedin: z.string().trim().max(200).default(""),
});

export const MIN_SERVICE_PHOTOS = 3;

/** Cadastro único do Profissional: CPF ou CNPJ (MEI/Limitada), logo, rosto, fotos e Pix obrigatórios. */
const providerSchema = z.object({
  documentType: z.enum(["cpf", "cnpj"]),
  cpf: z.string().default(""),
  cnpj: z.string().default(""),
  companyType: z.enum(["MEI", "Limitada", "SLU", "Outro"]).optional(),
  companyName: z.string().trim().max(200).default(""),
  tradeName: z.string().trim().max(160).default(""),
  fullName: text(5, 160, "Nome completo"),
  phone: phoneField,
  ...addressShape,
  services: z.array(z.string().trim().min(1).max(60)).min(1, "Escolha pelo menos um serviço").max(60),
  specialty: text(2, 160, "Especialidade"),
  bio: text(30, 3000, "Apresentação"),
  avatarMediaId: mediaId,
  faceMediaId: mediaId,
  serviceMediaIds: z.array(mediaId).min(MIN_SERVICE_PHOTOS, `Envie pelo menos ${MIN_SERVICE_PHOTOS} fotos de trabalhos anteriores`).max(20, "Máximo de 20 fotos"),
  bank: bankSchema,
  socials: socialShape.default({ instagram: "", facebook: "", tiktok: "", youtube: "", linkedin: "" }),
  website: z.string().trim().max(300).default("").refine(value => !value || isValidHttpUrl(value), "Site inválido (use https://...)"),
}).superRefine((value, ctx) => {
  if (value.documentType === "cpf" && !isValidCPF(value.cpf)) ctx.addIssue({ code: "custom", path: ["cpf"], message: "CPF inválido" });
  if (value.documentType === "cnpj") {
    if (!isValidCNPJ(value.cnpj)) ctx.addIssue({ code: "custom", path: ["cnpj"], message: "CNPJ inválido" });
    if (!value.companyType) ctx.addIssue({ code: "custom", path: ["companyType"], message: "Informe se é MEI ou Limitada" });
    if (value.companyName.trim().length < 3) ctx.addIssue({ code: "custom", path: ["companyName"], message: "Informe a razão social" });
  }
}).transform(value => ({
  ...value,
  cpf: value.documentType === "cpf" ? onlyDigits(value.cpf) : "",
  cnpj: value.documentType === "cnpj" ? onlyDigits(value.cnpj) : "",
  companyType: value.documentType === "cnpj" ? value.companyType : undefined,
  socials: {
    instagram: normalizeSocial(value.socials.instagram, "instagram"),
    facebook: normalizeSocial(value.socials.facebook, "facebook"),
    tiktok: normalizeSocial(value.socials.tiktok, "tiktok"),
    youtube: normalizeSocial(value.socials.youtube, "youtube"),
    linkedin: normalizeSocial(value.socials.linkedin, "linkedin"),
  },
}));

/** Dados do cliente para o contrato (a conta do cliente continua simples e gratuita). */
const clientSchema = z.object({
  fullName: text(5, 160, "Nome completo"),
  cpf: z.string().refine(isValidCPF, "CPF inválido").transform(onlyDigits),
  phone: phoneField,
  ...addressShape,
  faceMediaId: mediaId,
});

function withMediaUrls(details: any) {
  if (!details || typeof details !== "object") return details;
  return {
    ...details,
    ...(details.avatarMediaId ? { avatarUrl: mediaUrl(details.avatarMediaId) } : {}),
    ...(details.faceMediaId ? { faceUrl: mediaUrl(details.faceMediaId) } : {}),
    ...(details.resumeMediaId ? { resumeUrl: mediaUrl(details.resumeMediaId) } : {}),
    ...(Array.isArray(details.serviceMediaIds) ? { serviceUrls: details.serviceMediaIds.map((id: number) => ({ id, url: mediaUrl(id) })) } : {}),
  };
}

router.get("/onboarding", wrap(async (req, res) => {
  requireDb();
  const context = await requireAuth(req);
  const { details, completedAt } = await loadDetails(context.user.id);
  const complete = context.profile.accountType === "provider" ? providerDetailsComplete(details, completedAt) : clientContractDataComplete(details);
  res.json({ accountType: context.profile.accountType, status: context.profile.status, email: context.user.email ?? "", name: context.user.name ?? "", details: withMediaUrls(details), completedAt: complete ? completedAt : null, minServicePhotos: MIN_SERVICE_PHOTOS });
}));

router.put("/onboarding", wrap(async (req, res) => {
  requireDb();
  const context = await requireAuth(req);
  const type = context.profile.accountType;
  const previous = (await loadDetails(context.user.id)).details;
  let details: Record<string, any>;
  let keepMedia: number[];
  if (type === "client") {
    const input = parse(clientSchema, req.body);
    await assertOwnedMedia(context.user.id, [input.faceMediaId], "face");
    details = { ...input, kind: "client", faceVerified: previous?.faceMediaId === input.faceMediaId ? Boolean(previous?.faceVerified) : false };
    keepMedia = [input.faceMediaId];
  } else {
    const input = parse(providerSchema, req.body);
    // Só valem profissões que existem no catálogo atual (o admin pode ter excluído alguma).
    const catalog = await getServiceCatalog();
    input.services = [...new Set(input.services)].filter(id => findService(catalog, id));
    if (!input.services.length) throw new HttpError(400, "Escolha pelo menos um serviço da lista");
    await assertOwnedMedia(context.user.id, [input.avatarMediaId], "avatar");
    await assertOwnedMedia(context.user.id, [input.faceMediaId], "face");
    await assertOwnedMedia(context.user.id, input.serviceMediaIds, "service");
    details = { ...input, kind: "provider", schemaVersion: PROVIDER_SCHEMA_VERSION, faceVerified: previous?.faceMediaId === input.faceMediaId ? Boolean(previous?.faceVerified) : false };
    keepMedia = [input.avatarMediaId, input.faceMediaId, ...input.serviceMediaIds];
  }
  await withTransaction(async connection => {
    // Cadastros da versão anterior tiveram completedAt zerado na migração 0006 e voltam a valer neste envio.
    await connection.execute("INSERT INTO gc_profile_details (userId, details, completedAt) VALUES (?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE details = VALUES(details), completedAt = COALESCE(completedAt, CURRENT_TIMESTAMP)", [context.user.id, JSON.stringify(details)]);
    const place = `${details.city} - ${details.state}`.slice(0, 160);
    if (type === "provider") {
      const services = allServices(await getServiceCatalog());
      const labels = (details.services as string[]).map(id => services.find(s => s.id === id)?.label ?? id).join(", ");
      await connection.execute("UPDATE account_profiles SET city = ?, bio = ?, specialty = ? WHERE userId = ?", [place, String(details.bio), (String(details.specialty) || labels).slice(0, 160), context.user.id]);
    } else {
      await connection.execute("UPDATE account_profiles SET city = ? WHERE userId = ?", [place, context.user.id]);
    }
  });
  await pruneProfileMedia(context.user.id, keepMedia);
  await audit(context.user.id, "profile.onboarding_saved", { accountType: type }, context.user.id);
  const saved = await loadDetails(context.user.id);
  res.json({ ok: true, details: withMediaUrls(saved.details), completedAt: saved.completedAt, status: context.profile.status });
}));

router.get("/benefits", wrap(async (req, res) => {
  requireDb();
  const context = await requireAuth(req);
  const rows = await query<any[]>("SELECT * FROM gc_user_benefits WHERE userId = ? AND active = 1 AND (expiresAt IS NULL OR expiresAt >= CURRENT_DATE) ORDER BY createdAt DESC", [context.user.id]);
  res.json({ benefits: rows.map(mapBenefit) });
}));

function mapBenefit(row: any) {
  const expires = row.expiresAt ? new Date(row.expiresAt) : null;
  return { id: Number(row.id), userId: Number(row.userId), kind: row.kind, title: row.title, description: row.description ?? "", amountCents: Number(row.amountCents ?? 0), percent: Number(row.percent ?? 0), expiresAt: expires && !Number.isNaN(expires.getTime()) ? expires.toISOString().slice(0, 10) : null, active: Boolean(row.active), createdAt: new Date(row.createdAt).toISOString(), ...(row.userName !== undefined ? { userName: row.userName ?? "", userEmail: row.userEmail ?? "" } : {}) };
}

// ---------------------------------------------------------------- acesso do administrador

const strongPassword = z.string().min(10).max(200).refine(passwordIsStrong, "A senha precisa de 10+ caracteres, maiúscula, minúscula, número e símbolo");

router.get("/admin/status", wrap(async (_req, res) => {
  if (!dbConfigured()) { res.json({ database: "missing", setupRequired: false }); return; }
  if (!dbState.ready) { res.json({ database: "error", setupRequired: false, error: dbState.error }); return; }
  res.json({ database: "ok", setupRequired: !(await adminExists()) });
}));

router.post("/admin/setup", wrap(async (req, res) => {
  requireDb();
  limit(`admin-setup:${clientIp(req)}`, 6, 15 * 60_000);
  const input = body(req, z.object({ code: z.string().trim().min(6).max(20), name: text(2, 160, "Nome"), email: z.string().trim().email().max(320), password: strongPassword }));
  if (await adminExists()) throw new HttpError(409, "O administrador já foi criado. Use o login.");
  if (!verifySetupCode(input.code)) throw new HttpError(403, "Código de configuração inválido. Confira o código nos logs do Render.");
  const id = await createOrPromoteAdmin({ email: normalizeEmail(input.email), name: input.name, passwordHash: await hashPassword(input.password) });
  consumeSetupCode();
  const token = await createGcSession(id);
  res.cookie("gc_session", token, gcCookieOptions(req));
  await audit(id, "admin.setup", { email: normalizeEmail(input.email) }, id);
  res.status(201).json({ ok: true });
}));

router.post("/admin/login", wrap(async (req, res) => {
  requireDb();
  const input = body(req, z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(200) }));
  limit(`admin-login:${clientIp(req)}:${input.email.toLowerCase()}`, 6, 15 * 60_000);
  const found = await getUserByEmail(input.email);
  const valid = found ? await verifyPassword(input.password, found.profile.passwordHash) : false;
  if (!found || !valid || found.user.role !== "admin") throw new HttpError(401, "Credenciais de administração inválidas");
  const token = await createGcSession(found.user.id);
  res.cookie("gc_session", token, gcCookieOptions(req));
  await audit(found.user.id, "admin.login", { ip: clientIp(req) }, found.user.id);
  res.json({ user: publicUser({ ...found, source: "gastro" }) });
}));

router.post("/admin/password", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const input = body(req, z.object({ current: z.string().min(1).max(200), next: strongPassword }));
  if (!(await verifyPassword(input.current, context.profile.passwordHash))) throw new HttpError(400, "Senha atual incorreta");
  await execute("UPDATE account_profiles SET passwordHash = ? WHERE userId = ?", [await hashPassword(input.next), context.user.id]);
  await audit(context.user.id, "admin.password_change", {}, context.user.id);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- administração: usuários

router.get("/admin/users/:id/details", wrap(async (req, res) => {
  await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const rows = await query<any[]>("SELECT u.id, u.name, u.email, u.role, u.createdAt, u.lastSignedIn, p.accountType, p.status, p.city, p.bio, p.specialty, p.vip, p.discountPercent, p.featured FROM users u JOIN account_profiles p ON p.userId = u.id WHERE u.id = ? LIMIT 1", [id]);
  const row = rows[0];
  if (!row) throw new HttpError(404, "Usuário não encontrado");
  const { details, completedAt } = await loadDetails(id);
  const benefits = (await query<any[]>("SELECT * FROM gc_user_benefits WHERE userId = ? ORDER BY createdAt DESC", [id])).map(mapBenefit);
  res.json({
    user: { id: Number(row.id), name: row.name ?? "", email: row.email ?? "", role: row.role, accountType: row.accountType, status: row.status, city: row.city ?? "", bio: row.bio ?? "", specialty: row.specialty ?? "", vip: Boolean(row.vip), discountPercent: Number(row.discountPercent ?? 0), featured: Boolean(row.featured), createdAt: new Date(row.createdAt).toISOString() },
    details: withMediaUrls(details), completedAt, benefits,
    profileComplete: row.accountType === "provider" ? providerDetailsComplete(details, completedAt) : clientContractDataComplete(details),
    ...(row.accountType === "provider" ? { subscription: await subscriptionSummary(id) } : {}),
  });
}));

// ---------------------------------------------------------------- administração: conteúdo

router.get("/admin/content", wrap(async (req, res) => {
  await adminCtx(req);
  res.json({ fields: contentFields, values: await getSiteContent() });
}));

router.put("/admin/content", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const input = body(req, z.object({ values: z.record(z.string(), z.string().max(MAX_CONTENT_LENGTH)) }));
  const entries = Object.entries(input.values).filter(([key]) => contentKeys.has(key));
  if (!entries.length) throw new HttpError(400, "Nada para salvar");
  for (const entry of entries) {
    const [key, value] = entry;
    const field = contentFields.find(f => f.key === key)!;
    if (field.type === "services" && value) {
      try { entry[1] = JSON.stringify(normalizeServiceCatalog(JSON.parse(value))); }
      catch (error) { throw new HttpError(400, error instanceof Error && !(error instanceof SyntaxError) ? error.message : "Catálogo de serviços inválido"); }
    }
    if (field.type === "demos" && value) {
      try { entry[1] = JSON.stringify(normalizeDemos(JSON.parse(value))); }
      catch (error) { throw new HttpError(400, error instanceof Error && !(error instanceof SyntaxError) ? error.message : "Lista de portfólios inválida"); }
    }
    if (field.type === "url" && value && !isValidHttpUrl(value)) throw new HttpError(400, `${field.label}: link inválido`);
    if (field.type === "boolean" && !["true", "false"].includes(value)) throw new HttpError(400, `${field.label}: valor inválido`);
    if (field.type === "image" && value && !/^(\/api\/gastro\/media\/\d+|\/img\/[\w.-]+|https:\/\/\S+)$/.test(value)) throw new HttpError(400, `${field.label}: imagem inválida`);
    if (key === "contact.whatsapp" && value && !/^\d{12,13}$/.test(value)) throw new HttpError(400, "WhatsApp: use só números com 55 + DDD (ex.: 5519999999999)");
  }
  await withTransaction(async connection => {
    for (const [key, value] of entries) await connection.execute("INSERT INTO gc_site_content (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)", [key, value]);
  });
  invalidateSiteContent();
  await audit(context.user.id, "admin.content_update", { keys: entries.map(([key]) => key) });
  res.json({ values: await getSiteContent() });
}));

router.post("/admin/content/reset", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const input = body(req, z.object({ key: z.string().max(120) }));
  if (!contentKeys.has(input.key)) throw new HttpError(400, "Campo desconhecido");
  await execute("DELETE FROM gc_site_content WHERE `key` = ?", [input.key]);
  invalidateSiteContent();
  await audit(context.user.id, "admin.content_reset", { key: input.key });
  res.json({ values: await getSiteContent() });
}));

router.get("/admin/media", wrap(async (req, res) => {
  await adminCtx(req);
  const rows = await query<any[]>("SELECT id, kind, mime, filename, size, createdAt FROM gc_media WHERE kind IN ('site','promo') ORDER BY createdAt DESC LIMIT 300");
  res.json({ media: rows.map(row => ({ id: Number(row.id), kind: row.kind, mime: row.mime, filename: row.filename ?? "", size: Number(row.size), url: mediaUrl(Number(row.id)), createdAt: new Date(row.createdAt).toISOString() })) });
}));

// ---------------------------------------------------------------- administração: promoções

const promotionSchema = z.object({
  badge: text(2, 60, "Etiqueta"),
  title: text(3, 160, "Título"),
  text: text(10, 1000, "Texto"),
  cta: text(2, 60, "Texto do botão"),
  whatsappMessage: text(5, 600, "Mensagem do WhatsApp"),
  eventType: z.enum(EVENT_TYPES).nullable().optional(),
  imageUrl: z.string().trim().max(300).nullable().optional().refine(value => !value || /^(\/api\/gastro\/media\/\d+|https:\/\/\S+)$/.test(value), "Imagem inválida"),
  start: z.string().refine(isMonthDay, "Início inválido (MM-DD)"),
  end: z.string().refine(isMonthDay, "Fim inválido (MM-DD)"),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

router.get("/admin/promotions", wrap(async (req, res) => {
  await adminCtx(req);
  const rows = await query<any[]>("SELECT * FROM gc_promotions ORDER BY sortOrder ASC, id ASC");
  res.json({ promotions: rows.map(row => ({ ...mapPromotion(row), runningNow: isPromotionActive(mapPromotion(row)) })) });
}));

router.post("/admin/promotions", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const p = body(req, promotionSchema);
  const result = await execute("INSERT INTO gc_promotions (badge, title, text, ctaLabel, whatsappMessage, eventType, imageUrl, startMd, endMd, active, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [p.badge, p.title, p.text, p.cta, p.whatsappMessage, p.eventType ?? null, p.imageUrl || null, p.start, p.end, p.active, p.sortOrder]);
  await audit(context.user.id, "admin.promotion_create", { id: Number(result.insertId), title: p.title });
  res.status(201).json({ id: Number(result.insertId) });
}));

router.patch("/admin/promotions/:id", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const p = body(req, promotionSchema);
  const result = await execute("UPDATE gc_promotions SET badge = ?, title = ?, text = ?, ctaLabel = ?, whatsappMessage = ?, eventType = ?, imageUrl = ?, startMd = ?, endMd = ?, active = ?, sortOrder = ? WHERE id = ?", [p.badge, p.title, p.text, p.cta, p.whatsappMessage, p.eventType ?? null, p.imageUrl || null, p.start, p.end, p.active, p.sortOrder, id]);
  if (!result.affectedRows) throw new HttpError(404, "Promoção não encontrada");
  await audit(context.user.id, "admin.promotion_update", { id, title: p.title, active: p.active });
  res.json({ ok: true });
}));

router.delete("/admin/promotions/:id", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const result = await execute("DELETE FROM gc_promotions WHERE id = ?", [id]);
  if (!result.affectedRows) throw new HttpError(404, "Promoção não encontrada");
  await audit(context.user.id, "admin.promotion_delete", { id });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- administração: benefícios

const benefitSchema = z.object({
  userId: z.number().int().positive(),
  kind: z.enum(["bonus", "credit", "discount", "vip", "featured", "custom"]),
  title: text(2, 160, "Título"),
  description: z.string().trim().max(2000).default(""),
  amountCents: z.number().int().min(0).max(100_000_000).default(0),
  percent: z.number().int().min(0).max(100).default(0),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

async function syncProfileFlags(userId: number) {
  // VIP e destaque refletem benefícios ativos desse tipo (o admin também pode ligar direto no usuário).
  const rows = await query<any[]>("SELECT kind, MAX(percent) percent FROM gc_user_benefits WHERE userId = ? AND active = 1 AND (expiresAt IS NULL OR expiresAt >= CURRENT_DATE) AND kind IN ('vip','featured','discount') GROUP BY kind", [userId]);
  const kinds = new Map(rows.map(row => [row.kind as string, Number(row.percent ?? 0)]));
  if (kinds.has("vip")) await execute("UPDATE account_profiles SET vip = 1 WHERE userId = ?", [userId]);
  if (kinds.has("featured")) await execute("UPDATE account_profiles SET featured = 1 WHERE userId = ?", [userId]);
  if (kinds.has("discount")) await execute("UPDATE account_profiles SET discountPercent = GREATEST(discountPercent, ?) WHERE userId = ?", [kinds.get("discount") ?? 0, userId]);
}

router.get("/admin/benefits", wrap(async (req, res) => {
  await adminCtx(req);
  const rows = await query<any[]>("SELECT b.*, u.name userName, u.email userEmail FROM gc_user_benefits b JOIN users u ON u.id = b.userId ORDER BY b.createdAt DESC LIMIT 500");
  res.json({ benefits: rows.map(mapBenefit) });
}));

router.post("/admin/benefits", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const b = body(req, benefitSchema);
  const target = await query<any[]>("SELECT id FROM users WHERE id = ? LIMIT 1", [b.userId]);
  if (!target[0]) throw new HttpError(404, "Usuário não encontrado");
  const result = await execute("INSERT INTO gc_user_benefits (userId, kind, title, description, amountCents, percent, expiresAt, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [b.userId, b.kind, b.title, b.description, b.amountCents, b.percent, b.expiresAt ?? null, context.user.id]);
  await syncProfileFlags(b.userId);
  await audit(context.user.id, "admin.benefit_create", { id: Number(result.insertId), kind: b.kind, title: b.title, amountCents: b.amountCents, percent: b.percent }, b.userId);
  res.status(201).json({ id: Number(result.insertId) });
}));

router.patch("/admin/benefits/:id", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const input = body(req, z.object({ active: z.boolean() }));
  const rows = await query<any[]>("SELECT userId FROM gc_user_benefits WHERE id = ? LIMIT 1", [id]);
  if (!rows[0]) throw new HttpError(404, "Benefício não encontrado");
  await execute("UPDATE gc_user_benefits SET active = ? WHERE id = ?", [input.active, id]);
  await syncProfileFlags(Number(rows[0].userId));
  await audit(context.user.id, "admin.benefit_update", { id, active: input.active }, Number(rows[0].userId));
  res.json({ ok: true });
}));

router.delete("/admin/benefits/:id", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const result = await execute("DELETE FROM gc_user_benefits WHERE id = ?", [id]);
  if (!result.affectedRows) throw new HttpError(404, "Benefício não encontrado");
  await audit(context.user.id, "admin.benefit_delete", { id });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- administração: cupons (complemento)

router.patch("/admin/coupons/:id", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const input = body(req, z.object({ active: z.boolean() }));
  const result = await execute("UPDATE gastro_coupons SET active = ? WHERE id = ?", [input.active, id]);
  if (!result.affectedRows) throw new HttpError(404, "Cupom não encontrado");
  await audit(context.user.id, "admin.coupon_update", { id, active: input.active });
  res.json({ ok: true });
}));

router.delete("/admin/coupons/:id", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const result = await execute("DELETE FROM gastro_coupons WHERE id = ?", [id]);
  if (!result.affectedRows) throw new HttpError(404, "Cupom não encontrado");
  await audit(context.user.id, "admin.coupon_delete", { id });
  res.json({ ok: true });
}));

router.use(errorHandler);

export function registerExtraRoutes(app: Express) {
  app.use("/api/gastro", router);
}
