// Assinatura mensal obrigatória do profissional, cobrada via Pix pelo Mercado Pago.
//  - 5 dias antes do vencimento: cobrança automática (Pix recorrente autorizado no Mercado Pago).
//  - Falhou (ou não há autorização): Pix manual liberado no painel.
//  - Venceu sem pagamento: perfil oculto do catálogo e propostas bloqueadas
//    (o profissional continua entrando e vendo o radar).
import { Router, type Express, type Request } from "express";
import { z } from "zod";
import { HttpError } from "@shared/_core/errors";
import { nextPeriodEnd, PHASE_LABELS, renewalAttemptAt, subscriptionPhase, subscriptionVisible, type SubscriptionPhase } from "@shared/subscription";
import { assertOrigin, body, errorHandler, limit, parse, wrap } from "./http";
import { dbConfigured, execute, query, withTransaction } from "./db";
import { dbState } from "./bootstrap";
import { isOwner, requireAuth, type AuthContext } from "./auth";
import { SUBSCRIPTION_PRICE_CENTS } from "./rules";
import { cancelPreapproval, createPixPayment, createPreapproval, getAuthorizedPayment, getPayment, getPreapproval, mpConfigured, verifyWebhookSignature } from "./mercadopago";

const router = Router();
const HOUR = 60 * 60 * 1000;
const AUTO_GRACE_MS = 48 * HOUR;

type SubRow = { userId: number; priceCents: number; periodEnd: Date | null; autoFailed: number | boolean; autoAttemptedFor: Date | null; mpPreapprovalId: string | null; mpPreapprovalStatus: string | null; lastPaidAt: Date | null };

const asDate = (value: unknown) => (value ? new Date(value as string) : null);

export async function getSubscription(userId: number): Promise<SubRow | null> {
  const rows = await query<any[]>("SELECT * FROM gc_provider_subscriptions WHERE userId = ? LIMIT 1", [userId]);
  if (!rows[0]) return null;
  return { ...rows[0], periodEnd: asDate(rows[0].periodEnd), autoAttemptedFor: asDate(rows[0].autoAttemptedFor), lastPaidAt: asDate(rows[0].lastPaidAt) };
}

export async function phaseFor(userId: number, now = new Date()): Promise<SubscriptionPhase> {
  const sub = await getSubscription(userId);
  return subscriptionPhase({ periodEnd: sub?.periodEnd ?? null, autoFailed: Boolean(sub?.autoFailed) }, now);
}

/** Bloqueia ações comerciais do profissional com assinatura vencida/inativa. */
export async function assertSubscriptionActive(userId: number) {
  const phase = await phaseFor(userId);
  if (!subscriptionVisible(phase)) throw new HttpError(402, "Sua assinatura não está ativa. Renove via Pix no painel (Assinatura) para voltar a enviar propostas e aparecer no catálogo.");
}

/** SQL usado no catálogo: profissionais com assinatura vigente. */
export const VISIBLE_SUBSCRIPTION_SQL = "EXISTS (SELECT 1 FROM gc_provider_subscriptions s WHERE s.userId = u.id AND s.periodEnd > CURRENT_TIMESTAMP)";

async function ensureRow(userId: number) {
  await execute("INSERT INTO gc_provider_subscriptions (userId, priceCents) VALUES (?, ?) ON DUPLICATE KEY UPDATE userId = userId", [userId, SUBSCRIPTION_PRICE_CENTS]);
}

async function audit(actorId: number, action: string, details: unknown, targetId?: number) {
  await execute("INSERT INTO gastro_audit_logs (action, details, actorId, targetId) VALUES (?, ?, ?, ?)", [action, JSON.stringify(details).slice(0, 60000), actorId, targetId ?? null]);
}

/** Pagamento aprovado: estende o vencimento em 1 mês (idempotente por pagamento). */
export async function applyApprovedPayment(paymentRowId: number) {
  await withTransaction(async connection => {
    const [payments] = await connection.execute<any[]>("SELECT * FROM gc_subscription_payments WHERE id = ? LIMIT 1 FOR UPDATE", [paymentRowId]);
    const payment = payments[0];
    if (!payment || payment.status === "approved") return;
    await connection.execute("INSERT INTO gc_provider_subscriptions (userId, priceCents) VALUES (?, ?) ON DUPLICATE KEY UPDATE userId = userId", [payment.userId, SUBSCRIPTION_PRICE_CENTS]);
    const [subs] = await connection.execute<any[]>("SELECT periodEnd FROM gc_provider_subscriptions WHERE userId = ? FOR UPDATE", [payment.userId]);
    const end = nextPeriodEnd(asDate(subs[0]?.periodEnd));
    await connection.execute("UPDATE gc_subscription_payments SET status = 'approved', approvedAt = CURRENT_TIMESTAMP WHERE id = ?", [paymentRowId]);
    await connection.execute("UPDATE gc_provider_subscriptions SET periodEnd = ?, autoFailed = 0, autoAttemptedFor = NULL, lastPaidAt = CURRENT_TIMESTAMP WHERE userId = ?", [end, payment.userId]);
    // Pagamentos Pix manuais pendentes do mesmo ciclo deixam de valer.
    await connection.execute("UPDATE gc_subscription_payments SET status = 'cancelled' WHERE userId = ? AND status = 'pending' AND id <> ?", [payment.userId, paymentRowId]);
  });
  const rows = await query<any[]>("SELECT userId, method, amountCents FROM gc_subscription_payments WHERE id = ?", [paymentRowId]);
  if (rows[0]) await audit(Number(rows[0].userId), "subscription.paid", { paymentId: paymentRowId, method: rows[0].method, amountCents: Number(rows[0].amountCents) }, Number(rows[0].userId));
}

const MP_FINAL_FAIL = new Set(["rejected", "cancelled", "refunded", "charged_back", "expired"]);

/** Relê o pagamento no Mercado Pago e aplica o resultado (webhook ou consulta). */
export async function syncMpPayment(mpPaymentId: string | number) {
  const payment = await getPayment(mpPaymentId);
  let rows = await query<any[]>("SELECT * FROM gc_subscription_payments WHERE mpPaymentId = ? LIMIT 1", [String(payment.id)]);
  if (!rows[0]) {
    // Cobrança gerada pelo Pix recorrente: external_reference "gcsub-auto:<userId>".
    const match = /^gcsub(?:-auto)?:(\d+)/.exec(payment.external_reference ?? "");
    if (!match) return;
    const userId = Number(match[1]);
    await execute("INSERT INTO gc_subscription_payments (userId, method, status, amountCents, mpPaymentId) VALUES (?, 'pix_auto', 'pending', ?, ?)", [userId, Math.round(Number(payment.transaction_amount ?? 0) * 100), String(payment.id)]);
    rows = await query<any[]>("SELECT * FROM gc_subscription_payments WHERE mpPaymentId = ? LIMIT 1", [String(payment.id)]);
  }
  const row = rows[0];
  if (!row) return;
  if (payment.status === "approved") {
    if (Math.round(Number(payment.transaction_amount ?? 0) * 100) < Number(row.amountCents)) { console.warn("[Assinatura] valor pago menor que o devido; ignorado", payment.id); return; }
    await applyApprovedPayment(Number(row.id));
  } else if (MP_FINAL_FAIL.has(payment.status) && row.status === "pending") {
    await execute("UPDATE gc_subscription_payments SET status = ? WHERE id = ?", [payment.status === "expired" ? "expired" : "rejected", row.id]);
    if (row.method === "pix_auto") await execute("UPDATE gc_provider_subscriptions SET autoFailed = 1 WHERE userId = ?", [row.userId]);
  }
}

/** Rotina periódica: agenda/avalia a renovação automática e libera o Pix manual. */
export async function runBillingCycle(now = new Date()) {
  if (!dbConfigured() || !dbState.ready) return;
  const windowEnd = new Date(now.getTime() + 5 * 24 * HOUR);
  const due = await query<any[]>("SELECT * FROM gc_provider_subscriptions WHERE periodEnd IS NOT NULL AND periodEnd > ? AND periodEnd <= ?", [now, windowEnd]);
  for (const raw of due) {
    const periodEnd = new Date(raw.periodEnd);
    const attempted = raw.autoAttemptedFor ? new Date(raw.autoAttemptedFor).getTime() === periodEnd.getTime() : false;
    let authorized = raw.mpPreapprovalStatus === "authorized" && Boolean(raw.mpPreapprovalId);
    if (!attempted) {
      if (raw.mpPreapprovalId && mpConfigured()) {
        try { const pre = await getPreapproval(raw.mpPreapprovalId); authorized = pre.status === "authorized"; await execute("UPDATE gc_provider_subscriptions SET mpPreapprovalStatus = ? WHERE userId = ?", [pre.status, raw.userId]); } catch { /* tenta de novo no próximo ciclo */ }
      }
      // Sem Pix recorrente autorizado não há como cobrar sozinho: libera o Pix manual imediatamente.
      await execute("UPDATE gc_provider_subscriptions SET autoAttemptedFor = ?, autoFailed = ? WHERE userId = ?", [periodEnd, authorized ? 0 : 1, raw.userId]);
      await audit(Number(raw.userId), "subscription.auto_renewal_attempt", { periodEnd: periodEnd.toISOString(), automatic: authorized }, Number(raw.userId));
      continue;
    }
    // Cobrança automática não compensou em 48h: considera falha e abre o Pix manual.
    if (!raw.autoFailed && now.getTime() - renewalAttemptAt(periodEnd).getTime() >= AUTO_GRACE_MS) {
      await execute("UPDATE gc_provider_subscriptions SET autoFailed = 1 WHERE userId = ?", [raw.userId]);
    }
  }
  if (mpConfigured()) {
    const pending = await query<any[]>("SELECT mpPaymentId FROM gc_subscription_payments WHERE status = 'pending' AND mpPaymentId IS NOT NULL AND createdAt > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 DAY) LIMIT 50");
    for (const row of pending) { try { await syncMpPayment(row.mpPaymentId); } catch { /* próxima rodada */ } }
    await execute("UPDATE gc_subscription_payments SET status = 'expired' WHERE status = 'pending' AND expiresAt IS NOT NULL AND expiresAt < CURRENT_TIMESTAMP");
  }
}

let timer: NodeJS.Timeout | null = null;
export function startBillingScheduler() {
  if (timer) return;
  const tick = () => { runBillingCycle().catch(error => console.error("[Assinatura] falha na rotina de cobrança:", error instanceof Error ? error.message : error)); };
  setTimeout(tick, 30_000).unref();
  timer = setInterval(tick, HOUR);
  timer.unref();
}

function publicOrigin(req: Request) {
  const configured = process.env.GASTRO_PUBLIC_ORIGIN;
  if (configured && /^https:\/\//.test(configured)) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}
const webhookUrl = (req: Request) => {
  const origin = publicOrigin(req);
  return /^https:\/\//.test(origin) ? `${origin}/api/gastro/webhooks/mercadopago` : undefined;
};

async function providerCtx(req: Request): Promise<AuthContext> {
  if (!dbConfigured()) throw new HttpError(503, "Banco de dados não configurado");
  const context = await requireAuth(req);
  if (context.profile.accountType !== "provider") throw new HttpError(403, "A assinatura é exclusiva de profissionais");
  return context;
}

function mapPayment(row: any) {
  return { id: Number(row.id), method: row.method, status: row.status, amountCents: Number(row.amountCents), createdAt: new Date(row.createdAt).toISOString(), ...(row.approvedAt ? { approvedAt: new Date(row.approvedAt).toISOString() } : {}) };
}

export async function subscriptionSummary(userId: number) {
  const sub = await getSubscription(userId);
  const phase = subscriptionPhase({ periodEnd: sub?.periodEnd ?? null, autoFailed: Boolean(sub?.autoFailed) });
  const pendingRows = await query<any[]>("SELECT * FROM gc_subscription_payments WHERE userId = ? AND method = 'pix_manual' AND status = 'pending' AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP) ORDER BY id DESC LIMIT 1", [userId]);
  const history = await query<any[]>("SELECT * FROM gc_subscription_payments WHERE userId = ? ORDER BY id DESC LIMIT 24", [userId]);
  const pending = pendingRows[0];
  return {
    priceCents: SUBSCRIPTION_PRICE_CENTS,
    phase,
    label: PHASE_LABELS[phase],
    visible: subscriptionVisible(phase),
    periodEnd: sub?.periodEnd?.toISOString() ?? null,
    autoRenew: { authorized: sub?.mpPreapprovalStatus === "authorized", status: sub?.mpPreapprovalStatus ?? null },
    manualPixAvailable: phase === "inactive" || phase === "manual" || phase === "blocked",
    pendingPix: pending ? { id: Number(pending.id), qrCode: pending.qrCode ?? "", qrCodeBase64: pending.qrCodeBase64 ?? "", ticketUrl: pending.ticketUrl ?? "", expiresAt: pending.expiresAt ? new Date(pending.expiresAt).toISOString() : null } : null,
    history: history.map(mapPayment),
    paymentsConfigured: mpConfigured(),
  };
}

// ------------------------------------------------------------------ webhook (sem checagem de Origin)

router.post("/webhooks/mercadopago", wrap(async (req, res) => {
  const type = String(req.query.type ?? req.query.topic ?? req.body?.type ?? req.body?.topic ?? "");
  const dataId = String(req.query["data.id"] ?? req.body?.data?.id ?? req.query.id ?? "");
  if (process.env.MP_WEBHOOK_SECRET && !verifyWebhookSignature({ signature: req.get("x-signature") ?? undefined, requestId: req.get("x-request-id") ?? undefined, dataId })) {
    throw new HttpError(401, "Assinatura do webhook inválida");
  }
  res.status(200).json({ ok: true });
  if (!dataId || !mpConfigured() || !dbState.ready) return;
  try {
    if (type === "payment") await syncMpPayment(dataId);
    else if (type === "subscription_authorized_payment") {
      const authorized = await getAuthorizedPayment(dataId);
      if (authorized.payment?.id) await syncMpPayment(authorized.payment.id);
      else if (MP_FINAL_FAIL.has(authorized.status) || authorized.status === "recycling") await execute("UPDATE gc_provider_subscriptions SET autoFailed = 1 WHERE mpPreapprovalId = ?", [authorized.preapproval_id]);
    } else if (type === "subscription_preapproval" || type === "preapproval") {
      const pre = await getPreapproval(dataId);
      await execute("UPDATE gc_provider_subscriptions SET mpPreapprovalStatus = ? WHERE mpPreapprovalId = ?", [pre.status, pre.id]);
    }
  } catch (error) {
    console.error("[MercadoPago] webhook não processado:", error instanceof Error ? error.message : error);
  }
}));

// ------------------------------------------------------------------ painel do profissional

router.use((req, _res, next) => { if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertOrigin(req); next(); });

router.get("/subscription", wrap(async (req, res) => {
  const context = await providerCtx(req);
  res.json(await subscriptionSummary(context.user.id));
}));

router.post("/subscription/pix", wrap(async (req, res) => {
  const context = await providerCtx(req);
  limit(`sub-pix:${context.user.id}`, 6, HOUR, "Muitas tentativas de gerar Pix; aguarde um pouco");
  const summary = await subscriptionSummary(context.user.id);
  if (!summary.manualPixAvailable) throw new HttpError(409, "Sua assinatura está em dia. O Pix manual é liberado se a cobrança automática falhar ou a assinatura vencer.");
  if (summary.pendingPix?.qrCode) { res.json(summary); return; }
  await ensureRow(context.user.id);
  const expiresAt = new Date(Date.now() + 24 * HOUR);
  const result = await execute("INSERT INTO gc_subscription_payments (userId, method, status, amountCents, expiresAt) VALUES (?, 'pix_manual', 'pending', ?, ?)", [context.user.id, SUBSCRIPTION_PRICE_CENTS, expiresAt]);
  const rowId = Number(result.insertId);
  try {
    const payment = await createPixPayment({ amountCents: SUBSCRIPTION_PRICE_CENTS, description: "Assinatura mensal GastroConecta", payerEmail: context.user.email ?? "", externalReference: `gcsub:${context.user.id}:${rowId}`, expiresAt, notificationUrl: webhookUrl(req) });
    const data = payment.point_of_interaction?.transaction_data ?? {};
    await execute("UPDATE gc_subscription_payments SET mpPaymentId = ?, qrCode = ?, qrCodeBase64 = ?, ticketUrl = ? WHERE id = ?", [String(payment.id), data.qr_code ?? null, data.qr_code_base64 ?? null, (data.ticket_url ?? "").slice(0, 500) || null, rowId]);
  } catch (error) {
    await execute("DELETE FROM gc_subscription_payments WHERE id = ?", [rowId]);
    throw error;
  }
  res.status(201).json(await subscriptionSummary(context.user.id));
}));

router.post("/subscription/pix/refresh", wrap(async (req, res) => {
  const context = await providerCtx(req);
  limit(`sub-refresh:${context.user.id}`, 30, HOUR);
  const rows = await query<any[]>("SELECT mpPaymentId FROM gc_subscription_payments WHERE userId = ? AND status = 'pending' AND mpPaymentId IS NOT NULL ORDER BY id DESC LIMIT 3", [context.user.id]);
  for (const row of rows) await syncMpPayment(row.mpPaymentId);
  res.json(await subscriptionSummary(context.user.id));
}));

router.post("/subscription/auto", wrap(async (req, res) => {
  const context = await providerCtx(req);
  limit(`sub-auto:${context.user.id}`, 5, HOUR);
  await ensureRow(context.user.id);
  const sub = await getSubscription(context.user.id);
  const attemptAt = sub?.periodEnd ? renewalAttemptAt(sub.periodEnd) : null;
  const startDate = attemptAt && attemptAt.getTime() > Date.now() + 60_000 ? attemptAt : new Date(Date.now() + 5 * 60_000);
  const pre = await createPreapproval({ amountCents: SUBSCRIPTION_PRICE_CENTS, reason: "Assinatura mensal GastroConecta (Pix automático)", payerEmail: context.user.email ?? "", externalReference: `gcsub-auto:${context.user.id}`, startDate, backUrl: `${publicOrigin(req)}/painel`, notificationUrl: webhookUrl(req) });
  await execute("UPDATE gc_provider_subscriptions SET mpPreapprovalId = ?, mpPreapprovalStatus = ? WHERE userId = ?", [pre.id, pre.status, context.user.id]);
  await audit(context.user.id, "subscription.auto_requested", { preapprovalId: pre.id }, context.user.id);
  res.status(201).json({ initPoint: pre.init_point ?? "" });
}));

router.delete("/subscription/auto", wrap(async (req, res) => {
  const context = await providerCtx(req);
  const sub = await getSubscription(context.user.id);
  if (sub?.mpPreapprovalId) { try { await cancelPreapproval(sub.mpPreapprovalId); } catch { /* registra o cancelamento local mesmo assim */ } }
  await execute("UPDATE gc_provider_subscriptions SET mpPreapprovalId = NULL, mpPreapprovalStatus = 'cancelled' WHERE userId = ?", [context.user.id]);
  await audit(context.user.id, "subscription.auto_cancelled", {}, context.user.id);
  res.json(await subscriptionSummary(context.user.id));
}));

// ------------------------------------------------------------------ administração

async function adminCtx(req: Request) {
  const context = await requireAuth(req);
  if (!(await isOwner(context))) throw new HttpError(403, "Acesso reservado à administração");
  return context;
}

router.get("/admin/subscriptions", wrap(async (req, res) => {
  await adminCtx(req);
  const rows = await query<any[]>("SELECT u.id, u.name, u.email, p.status accountStatus, s.periodEnd, s.autoFailed, s.mpPreapprovalStatus, s.lastPaidAt FROM users u JOIN account_profiles p ON p.userId = u.id LEFT JOIN gc_provider_subscriptions s ON s.userId = u.id WHERE p.accountType = 'provider' AND p.status <> 'deleted' ORDER BY s.periodEnd IS NULL, s.periodEnd ASC LIMIT 1000");
  res.json({
    priceCents: SUBSCRIPTION_PRICE_CENTS,
    paymentsConfigured: mpConfigured(),
    subscriptions: rows.map(row => {
      const phase = subscriptionPhase({ periodEnd: asDate(row.periodEnd), autoFailed: Boolean(row.autoFailed) });
      return { userId: Number(row.id), name: row.name ?? "", email: row.email ?? "", accountStatus: row.accountStatus, phase, label: PHASE_LABELS[phase], periodEnd: row.periodEnd ? new Date(row.periodEnd).toISOString() : null, autoRenew: row.mpPreapprovalStatus ?? null, lastPaidAt: row.lastPaidAt ? new Date(row.lastPaidAt).toISOString() : null };
    }),
  });
}));

router.post("/admin/subscriptions/:userId/grant", wrap(async (req, res) => {
  const context = await adminCtx(req);
  const userId = parse(z.coerce.number().int().positive(), req.params.userId);
  const input = body(req, z.object({ months: z.number().int().min(1).max(24), note: z.string().trim().max(300).default("") }));
  const target = await query<any[]>("SELECT userId FROM account_profiles WHERE userId = ? AND accountType = 'provider' LIMIT 1", [userId]);
  if (!target[0]) throw new HttpError(404, "Profissional não encontrado");
  await ensureRow(userId);
  const sub = await getSubscription(userId);
  let end = sub?.periodEnd ?? null;
  for (let i = 0; i < input.months; i++) end = nextPeriodEnd(end);
  await execute("UPDATE gc_provider_subscriptions SET periodEnd = ?, autoFailed = 0, autoAttemptedFor = NULL WHERE userId = ?", [end, userId]);
  await execute("INSERT INTO gc_subscription_payments (userId, method, status, amountCents, approvedAt) VALUES (?, 'admin_grant', 'approved', 0, CURRENT_TIMESTAMP)", [userId]);
  await audit(context.user.id, "admin.subscription_grant", { months: input.months, note: input.note, periodEnd: end?.toISOString() }, userId);
  res.json({ ok: true, periodEnd: end?.toISOString() ?? null });
}));

router.use(errorHandler);

export function registerSubscriptionRoutes(app: Express) {
  app.use("/api/gastro", router);
}
