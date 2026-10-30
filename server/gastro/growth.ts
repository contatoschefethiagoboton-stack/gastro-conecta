// Níveis do profissional (BAIXO / MÉDIO / ALTO), promoções com fornecedores e pagamentos no Mercado Pago.
//  - Nível: calculado pelas avaliações (regras editáveis no painel); o admin pode fixar o nível.
//  - Promoções: o fornecedor nível ALTO paga o adicional definido pelo admin (Pix) e aparece para
//    os clientes que clicam na promoção. VIP (só o admin vê) entra sem pagar e sem precisar do nível.
//  - Pagamentos: chaves do Mercado Pago cadastradas no painel e lista do que entrou pelo site,
//    com a referência que aparece no extrato do Mercado Pago.
import { Router, type Express, type Request } from "express";
import { z } from "zod";
import { HttpError } from "@shared/_core/errors";
import { isLevel, LEVEL_LABELS, levelFromRatings, levelRulesFrom, nextLevelHint, type ProviderLevel } from "@shared/levels";
import { isPromotionActive, promotionWindowEnd, type Promotion } from "@shared/promotions";
import { normalizeDescriptor, PAYMENT_KIND_LABELS, paymentDescription, paymentReference, subscriberCode } from "@shared/payments";
import { assertOrigin, body, errorHandler, limit, parse, wrap } from "./http";
import { dbConfigured, execute, query } from "./db";
import { isOwner, requireAuth, type AuthContext } from "./auth";
import { getSiteContent } from "./content";
import { loadProfessionals } from "./catalog";
import { createPixPayment, mpConfigured, mpSettingsStatus, saveMpSettings, testAccessToken } from "./mercadopago";
import { assertSubscriptionActive, publicOrigin, syncMpPayment, webhookUrl } from "./subscriptions";

const router = Router();
const idSchema = z.coerce.number().int().positive();
const HOUR = 60 * 60 * 1000;

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
async function providerCtx(req: Request): Promise<AuthContext> {
  requireDb();
  const context = await requireAuth(req);
  if (context.profile.accountType !== "provider") throw new HttpError(403, "Área exclusiva de profissionais");
  return context;
}
async function audit(actorId: number, action: string, details: unknown, targetId?: number) {
  await execute("INSERT INTO gastro_audit_logs (action, details, actorId, targetId) VALUES (?, ?, ?, ?)", [action, JSON.stringify(details).slice(0, 60000), actorId, targetId ?? null]);
}

const promoFromRow = (row: any): Promotion => ({
  id: Number(row.id), active: Boolean(row.active), start: row.startMd, end: row.endMd, badge: row.badge, title: row.title, text: row.text, cta: row.ctaLabel,
  whatsappMessage: row.whatsappMessage, eventType: row.eventType ?? undefined, imageUrl: row.imageUrl ?? undefined, sortOrder: Number(row.sortOrder ?? 0), providerFeeCents: Number(row.providerFeeCents ?? 0),
});

// ------------------------------------------------------------------ nível do profissional

export type LevelInfo = { level: ProviderLevel; label: string; automatic: ProviderLevel; override: ProviderLevel | null; average: number; count: number; hint: string };

export async function providerLevel(userId: number): Promise<LevelInfo> {
  const [content, ratings, profile] = await Promise.all([
    getSiteContent(),
    query<any[]>("SELECT AVG(rating) average, COUNT(*) total FROM gastro_reviews WHERE targetId = ?", [userId]),
    query<any[]>("SELECT levelOverride FROM account_profiles WHERE userId = ? LIMIT 1", [userId]),
  ]);
  const rules = levelRulesFrom(content);
  const average = Math.round(Number(ratings[0]?.average ?? 0) * 10) / 10;
  const count = Number(ratings[0]?.total ?? 0);
  const automatic = levelFromRatings(average, count, rules);
  const override = isLevel(profile[0]?.levelOverride) ? profile[0].levelOverride as ProviderLevel : null;
  const level = override ?? automatic;
  return { level, label: LEVEL_LABELS[level], automatic, override, average, count, hint: override ? "" : nextLevelHint(level, average, count, rules) };
}

async function isPromoVip(userId: number) {
  const rows = await query<any[]>("SELECT promoVip FROM account_profiles WHERE userId = ? LIMIT 1", [userId]);
  return Boolean(rows[0]?.promoVip);
}

// ------------------------------------------------------------------ público: fornecedores de uma promoção

router.get("/promotions/:id/providers", wrap(async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.set("Cache-Control", "no-store");
  if (!dbConfigured()) { res.json({ professionals: [] }); return; }
  const rows = await query<any[]>("SELECT userId FROM gc_promotion_participants WHERE promotionId = ? AND status = 'active' AND (validUntil IS NULL OR validUntil > CURRENT_TIMESTAMP)", [id]);
  const ids = new Set(rows.map(row => `user-${Number(row.userId)}`));
  // Só quem está visível no catálogo (aprovado, cadastro completo e assinatura em dia).
  const professionals = (await loadProfessionals()).filter(p => !p.demo && ids.has(p.id));
  res.json({ professionals });
}));

// ------------------------------------------------------------------ painel do profissional

router.get("/provider/growth", wrap(async (req, res) => {
  const context = await providerCtx(req);
  const me = context.user.id;
  const [level, vip, content, promos, participations, pending] = await Promise.all([
    providerLevel(me), isPromoVip(me), getSiteContent(),
    query<any[]>("SELECT * FROM gc_promotions WHERE active = 1 ORDER BY sortOrder ASC, id ASC"),
    query<any[]>("SELECT promotionId, validUntil FROM gc_promotion_participants WHERE userId = ? AND status = 'active' AND (validUntil IS NULL OR validUntil > CURRENT_TIMESTAMP)", [me]),
    query<any[]>("SELECT id, promotionId, qrCode, qrCodeBase64, ticketUrl, expiresAt, amountCents FROM gc_subscription_payments WHERE userId = ? AND purpose = 'promotion' AND status = 'pending' AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP) ORDER BY id DESC", [me]),
  ]);
  const joined = new Map(participations.map(row => [Number(row.promotionId), row.validUntil ? new Date(row.validUntil).toISOString() : null]));
  // VIP não aparece para o profissional: ele só vê que pode participar sem custo.
  const eligible = vip || level.level === "alto";
  const lines = (key: string) => String(content[key] ?? "").split("\n").map(line => line.trim()).filter(Boolean);
  res.json({
    level: { ...level, override: undefined, automatic: undefined },
    messages: { baixo: content["level.baixoText"], medio: content["level.medioText"], alto: content["level.altoText"] },
    benefits: { baixo: [], medio: lines("level.medioBenefits"), alto: lines("level.altoBenefits") },
    eligible,
    paymentsConfigured: mpConfigured(),
    promotions: promos.map(promoFromRow).filter(p => isPromotionActive(p)).map(p => {
      const pix = pending.find(row => Number(row.promotionId) === Number(p.id));
      return {
        id: Number(p.id), title: p.title, badge: p.badge, text: p.text, imageUrl: p.imageUrl, start: p.start, end: p.end,
        feeCents: vip ? 0 : p.providerFeeCents ?? 0,
        joined: joined.has(Number(p.id)), validUntil: joined.get(Number(p.id)) ?? null,
        pendingPix: pix ? { qrCode: pix.qrCode ?? "", qrCodeBase64: pix.qrCodeBase64 ?? "", ticketUrl: pix.ticketUrl ?? "", expiresAt: pix.expiresAt ? new Date(pix.expiresAt).toISOString() : null } : null,
      };
    }),
  });
}));

router.post("/provider/promotions/:id/join", wrap(async (req, res) => {
  const context = await providerCtx(req);
  const me = context.user.id;
  const id = parse(idSchema, req.params.id);
  limit(`promo-join:${me}`, 10, HOUR, "Muitas tentativas; aguarde um pouco");
  if (context.profile.status !== "active") throw new HttpError(403, "Seu cadastro precisa estar aprovado para participar das promoções.");
  await assertSubscriptionActive(me);
  const rows = await query<any[]>("SELECT * FROM gc_promotions WHERE id = ? AND active = 1 LIMIT 1", [id]);
  const promo = rows[0] ? promoFromRow(rows[0]) : null;
  if (!promo || !isPromotionActive(promo)) throw new HttpError(404, "Promoção fora do ar");
  const [level, vip] = await Promise.all([providerLevel(me), isPromoVip(me)]);
  if (!vip && level.level !== "alto") throw new HttpError(403, "As promoções são um benefício do nível ALTO. Continue recebendo boas avaliações para subir de nível.");
  const already = await query<any[]>("SELECT 1 FROM gc_promotion_participants WHERE promotionId = ? AND userId = ? AND status = 'active' AND (validUntil IS NULL OR validUntil > CURRENT_TIMESTAMP) LIMIT 1", [id, me]);
  if (already[0]) throw new HttpError(409, "Você já está participando desta promoção");
  const validUntil = promotionWindowEnd(promo);
  const fee = vip ? 0 : promo.providerFeeCents ?? 0;
  if (fee <= 0) {
    await execute("INSERT INTO gc_promotion_participants (promotionId, userId, status, source, validUntil) VALUES (?, ?, 'active', ?, ?) ON DUPLICATE KEY UPDATE status = 'active', source = VALUES(source), validUntil = VALUES(validUntil)", [id, me, vip ? "vip" : "free", validUntil]);
    await audit(me, "promotion.joined", { promotionId: id, source: vip ? "vip" : "free" }, me);
    res.status(201).json({ joined: true });
    return;
  }
  // Adicional pago via Pix, com referência GASTROCONECTA-PROMOCAO-U<id>-P<nº> para achar no extrato.
  const pending = await query<any[]>("SELECT id FROM gc_subscription_payments WHERE userId = ? AND purpose = 'promotion' AND promotionId = ? AND status = 'pending' AND expiresAt > CURRENT_TIMESTAMP LIMIT 1", [me, id]);
  if (pending[0]) { res.json({ joined: false, pending: true }); return; }
  const expiresAt = new Date(Date.now() + 24 * HOUR);
  const result = await execute("INSERT INTO gc_subscription_payments (userId, method, status, amountCents, expiresAt, purpose, promotionId) VALUES (?, 'pix_promo', 'pending', ?, ?, 'promotion', ?)", [me, fee, expiresAt, id]);
  const rowId = Number(result.insertId);
  const reference = paymentReference("PROMOCAO", me, rowId);
  await execute("UPDATE gc_subscription_payments SET reference = ? WHERE id = ?", [reference, rowId]);
  try {
    const payment = await createPixPayment({ amountCents: fee, description: paymentDescription("PROMOCAO", me, context.user.name ?? "", `“${promo.title}”`), payerEmail: context.user.email ?? "", externalReference: reference, expiresAt, notificationUrl: webhookUrl(req), metadata: { assinante_id: me, codigo_assinante: subscriberCode(me), tipo: "promocao" } });
    const data = payment.point_of_interaction?.transaction_data ?? {};
    await execute("UPDATE gc_subscription_payments SET mpPaymentId = ?, qrCode = ?, qrCodeBase64 = ?, ticketUrl = ? WHERE id = ?", [String(payment.id), data.qr_code ?? null, data.qr_code_base64 ?? null, (data.ticket_url ?? "").slice(0, 500) || null, rowId]);
  } catch (error) {
    await execute("DELETE FROM gc_subscription_payments WHERE id = ?", [rowId]);
    throw error;
  }
  res.status(201).json({ joined: false, pending: true });
}));

router.post("/provider/promotions/refresh", wrap(async (req, res) => {
  const context = await providerCtx(req);
  limit(`promo-refresh:${context.user.id}`, 30, HOUR);
  const rows = await query<any[]>("SELECT mpPaymentId FROM gc_subscription_payments WHERE userId = ? AND purpose = 'promotion' AND status = 'pending' AND mpPaymentId IS NOT NULL ORDER BY id DESC LIMIT 5", [context.user.id]);
  for (const row of rows) await syncMpPayment(row.mpPaymentId);
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ admin: nível e VIP de um profissional

router.get("/admin/users/:id/growth", wrap(async (req, res) => {
  await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const [level, vip, joined] = await Promise.all([
    providerLevel(id), isPromoVip(id),
    query<any[]>("SELECT pp.promotionId, pp.source, pp.validUntil, p.title FROM gc_promotion_participants pp JOIN gc_promotions p ON p.id = pp.promotionId WHERE pp.userId = ? AND pp.status = 'active' AND (pp.validUntil IS NULL OR pp.validUntil > CURRENT_TIMESTAMP)", [id]),
  ]);
  res.json({ level, promoVip: vip, subscriberCode: subscriberCode(id), promotions: joined.map(row => ({ id: Number(row.promotionId), title: row.title, source: row.source, validUntil: row.validUntil ? new Date(row.validUntil).toISOString() : null })) });
}));

router.patch("/admin/users/:id/growth", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const input = body(req, z.object({ promoVip: z.boolean().optional(), levelOverride: z.enum(["auto", "baixo", "medio", "alto"]).optional() }).strict());
  const target = await query<any[]>("SELECT userId FROM account_profiles WHERE userId = ? AND accountType = 'provider' LIMIT 1", [id]);
  if (!target[0]) throw new HttpError(404, "Profissional não encontrado");
  if (input.promoVip !== undefined) await execute("UPDATE account_profiles SET promoVip = ? WHERE userId = ?", [input.promoVip, id]);
  if (input.levelOverride !== undefined) await execute("UPDATE account_profiles SET levelOverride = ? WHERE userId = ?", [input.levelOverride === "auto" ? null : input.levelOverride, id]);
  await audit(context.user.id, "admin.provider_growth", input, id);
  res.json({ level: await providerLevel(id), promoVip: await isPromoVip(id) });
}));

// ------------------------------------------------------------------ admin: fornecedores das promoções

router.get("/admin/promotions/:id/participants", wrap(async (req, res) => {
  await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const rows = await query<any[]>(`SELECT pp.userId, pp.source, pp.validUntil, pp.createdAt, u.name, u.email FROM gc_promotion_participants pp JOIN users u ON u.id = pp.userId
    WHERE pp.promotionId = ? AND pp.status = 'active' AND (pp.validUntil IS NULL OR pp.validUntil > CURRENT_TIMESTAMP) ORDER BY pp.createdAt DESC`, [id]);
  const providers = await query<any[]>("SELECT u.id, u.name, u.email, p.promoVip FROM users u JOIN account_profiles p ON p.userId = u.id WHERE p.accountType = 'provider' AND p.status = 'active' ORDER BY u.name ASC LIMIT 2000");
  res.json({
    participants: rows.map(row => ({ userId: Number(row.userId), name: row.name ?? "", email: row.email ?? "", source: row.source, validUntil: row.validUntil ? new Date(row.validUntil).toISOString() : null, code: subscriberCode(Number(row.userId)) })),
    providers: providers.map(row => ({ id: Number(row.id), name: row.name ?? "", email: row.email ?? "", promoVip: Boolean(row.promoVip) })),
  });
}));

router.post("/admin/promotions/:id/participants", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const input = body(req, z.object({ userId: idSchema }));
  const rows = await query<any[]>("SELECT * FROM gc_promotions WHERE id = ? LIMIT 1", [id]);
  if (!rows[0]) throw new HttpError(404, "Promoção não encontrada");
  const target = await query<any[]>("SELECT userId FROM account_profiles WHERE userId = ? AND accountType = 'provider' LIMIT 1", [input.userId]);
  if (!target[0]) throw new HttpError(404, "Profissional não encontrado");
  const promo = promoFromRow(rows[0]);
  const until = promotionWindowEnd({ ...promo, active: true });
  await execute("INSERT INTO gc_promotion_participants (promotionId, userId, status, source, validUntil) VALUES (?, ?, 'active', 'admin', ?) ON DUPLICATE KEY UPDATE status = 'active', source = 'admin', validUntil = VALUES(validUntil)", [id, input.userId, until]);
  await audit(context.user.id, "admin.promotion_participant_add", { promotionId: id }, input.userId);
  res.status(201).json({ ok: true });
}));

router.delete("/admin/promotions/:id/participants/:userId", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const id = parse(idSchema, req.params.id);
  const userId = parse(idSchema, req.params.userId);
  await execute("UPDATE gc_promotion_participants SET status = 'removed' WHERE promotionId = ? AND userId = ?", [id, userId]);
  await audit(context.user.id, "admin.promotion_participant_remove", { promotionId: id }, userId);
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ admin: Mercado Pago

router.get("/admin/payments/settings", wrap(async (req, res) => {
  await adminCtx(req);
  res.json({ ...mpSettingsStatus(), webhookUrl: `${publicOrigin(req)}/api/gastro/webhooks/mercadopago` });
}));

router.put("/admin/payments/settings", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const input = body(req, z.object({
    accessToken: z.string().trim().max(300).optional(),
    webhookSecret: z.string().trim().max(300).optional(),
    descriptor: z.string().trim().max(60).optional(),
  }).strict());
  if (input.accessToken && !/^(APP_USR|TEST)-[\w-]{20,}$/.test(input.accessToken)) throw new HttpError(400, "Access Token inválido: copie o “Access Token” de produção (começa com APP_USR-) em Mercado Pago → Suas integrações → Credenciais.");
  if (input.accessToken) {
    try { await testAccessToken(input.accessToken); } catch { throw new HttpError(400, "O Mercado Pago não aceitou esse Access Token. Confira se copiou a chave inteira."); }
  }
  await saveMpSettings({ ...input, ...(input.descriptor !== undefined ? { descriptor: normalizeDescriptor(input.descriptor) } : {}) });
  await audit(context.user.id, "admin.payments_settings", { accessToken: input.accessToken !== undefined ? (input.accessToken ? "alterado" : "removido") : undefined, webhookSecret: input.webhookSecret !== undefined ? (input.webhookSecret ? "alterado" : "removido") : undefined, descriptor: input.descriptor });
  res.json({ ...mpSettingsStatus(), webhookUrl: `${publicOrigin(req)}/api/gastro/webhooks/mercadopago` });
}));

router.post("/admin/payments/test", wrap(async (req, res) => {
  await adminCtx(req);
  if (!mpConfigured()) throw new HttpError(400, "Cadastre o Access Token primeiro.");
  const account = await testAccessToken();
  res.json({ ok: true, account: { id: account.id, nickname: account.nickname ?? "", email: account.email ?? "" } });
}));

router.get("/admin/payments", wrap(async (req, res) => {
  await adminCtx(req);
  const rows = await query<any[]>(`SELECT sp.*, u.name, u.email, pr.title promotionTitle FROM gc_subscription_payments sp JOIN users u ON u.id = sp.userId
    LEFT JOIN gc_promotions pr ON pr.id = sp.promotionId ORDER BY sp.id DESC LIMIT 1000`);
  res.json({
    payments: rows.map(row => {
      const kind = row.purpose === "promotion" ? "PROMOCAO" : row.method === "pix_auto" ? "ASSINATURA-AUTO" : "ASSINATURA";
      return {
        id: Number(row.id), userId: Number(row.userId), code: subscriberCode(Number(row.userId)), name: row.name ?? "", email: row.email ?? "",
        kind: row.method === "admin_grant" ? "Cortesia do admin" : `${PAYMENT_KIND_LABELS[kind as keyof typeof PAYMENT_KIND_LABELS]}${row.promotionTitle ? ` — ${row.promotionTitle}` : ""}`,
        status: row.status, amountCents: Number(row.amountCents), mpPaymentId: row.mpPaymentId ?? "", reference: row.reference ?? "",
        createdAt: new Date(row.createdAt).toISOString(), approvedAt: row.approvedAt ? new Date(row.approvedAt).toISOString() : null,
      };
    }),
  });
}));

router.use(errorHandler);

export function registerGrowthRoutes(app: Express) {
  app.use("/api/gastro", router);
}
