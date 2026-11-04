// Equipe da administração (dono, administradores, gerentes e operadores),
// permissões por endereço e exclusão definitiva de contas.
import { randomInt } from "node:crypto";
import { Router, type Express, type Request } from "express";
import { z } from "zod";
import { HttpError } from "@shared/_core/errors";
import {
  canManageRole, effectivePermissions, isFullAccess, normalizePermissions, permissionForRequest, STAFF_ROLE_LABELS, temporaryPassword,
  type Permission, type StaffRole,
} from "@shared/staff";
import { assertOrigin, body, clientIp, errorHandler, limit, parse, wrap } from "./http";
import { dbConfigured, execute, query, withTransaction } from "./db";
import { hashPassword, normalizeEmail, requireAuth, type AuthContext } from "./auth";

export type StaffInfo = { role: StaffRole; permissions: Permission[]; mustChangePassword: boolean };
export type StaffContext = AuthContext & { staff: StaffInfo };

const ROLES = ["owner", "admin", "manager", "operator"] as const;

export async function audit(actorId: number, action: string, details: unknown, targetId?: number | null) {
  await execute("INSERT INTO gastro_audit_logs (action, details, actorId, targetId) VALUES (?, ?, ?, ?)", [action.slice(0, 120), JSON.stringify(details ?? {}).slice(0, 60000), actorId, targetId ?? null]);
}

/** Papel e permissões de quem é da equipe (users.role = 'admin'). Contas antigas sem registro contam como administrador. */
export async function loadStaff(context: AuthContext): Promise<StaffInfo | null> {
  if (context.user.role !== "admin") return null;
  const rows = await query<any[]>("SELECT staffRole, permissions, mustChangePassword FROM gc_staff WHERE userId = ? LIMIT 1", [context.user.id]);
  const row = rows[0];
  const role: StaffRole = row && (ROLES as readonly string[]).includes(row.staffRole) ? row.staffRole : "admin";
  let saved: unknown = [];
  try { saved = row?.permissions ? JSON.parse(row.permissions) : []; } catch { saved = []; }
  return { role, permissions: effectivePermissions(role, saved), mustChangePassword: Boolean(row?.mustChangePassword) };
}

/** A conta é da equipe e tem esta permissão? */
export async function staffCan(context: AuthContext, permission: Permission): Promise<boolean> {
  return hasPermission(await loadStaff(context), permission);
}

export const hasPermission = (staff: StaffInfo | null, permission: Permission) => Boolean(staff && (isFullAccess(staff.role) || staff.permissions.includes(permission)));

/**
 * Libera a rota da administração conforme a permissão exigida pelo endereço.
 * Quem recebeu senha temporária só consegue trocar a senha até fazer isso.
 */
export async function requireStaff(req: Request, required?: Permission | "staff"): Promise<StaffContext> {
  if (!dbConfigured()) throw new HttpError(503, "Banco de dados não configurado (DATABASE_URL)");
  const context = await requireAuth(req);
  const staff = await loadStaff(context);
  if (!staff) throw new HttpError(403, "Acesso reservado à administração");
  const need = required ?? permissionForRequest(req.method, req.path);
  if (staff.mustChangePassword && need !== "staff") throw new HttpError(403, "Troque a senha temporária antes de continuar.");
  if (need === null && !isFullAccess(staff.role)) throw new HttpError(403, "Seu acesso não permite esta ação.");
  if (need && need !== "staff" && !hasPermission(staff, need)) throw new HttpError(403, "Seu acesso não permite esta ação. Peça ao dono do site para liberar.");
  return { ...context, staff };
}

/** O primeiro administrador do banco vira o dono; os demais sem papel viram administradores. */
export async function ensureOwner() {
  const owner = await query<any[]>("SELECT userId FROM gc_staff WHERE staffRole = 'owner' LIMIT 1");
  const admins = await query<any[]>("SELECT u.id FROM users u LEFT JOIN gc_staff s ON s.userId = u.id WHERE u.role = 'admin' AND s.userId IS NULL ORDER BY u.id ASC");
  let hasOwner = Boolean(owner[0]);
  for (const row of admins) {
    await execute("INSERT INTO gc_staff (userId, staffRole, permissions) VALUES (?, ?, '[]') ON DUPLICATE KEY UPDATE userId = userId", [row.id, hasOwner ? "admin" : "owner"]);
    hasOwner = true;
  }
}

/** Marca uma conta como dono (setup inicial e ADMIN_EMAIL), se ainda não houver dono. */
export async function claimOwnership(userId: number) {
  const owner = await query<any[]>("SELECT userId FROM gc_staff WHERE staffRole = 'owner' LIMIT 1");
  if (owner[0] && Number(owner[0].userId) !== userId) {
    await execute("INSERT INTO gc_staff (userId, staffRole, permissions) VALUES (?, 'admin', '[]') ON DUPLICATE KEY UPDATE userId = userId", [userId]);
    return;
  }
  await execute("INSERT INTO gc_staff (userId, staffRole, permissions) VALUES (?, 'owner', '[]') ON DUPLICATE KEY UPDATE staffRole = 'owner'", [userId]);
}

export async function isOwnerAccount(userId: number): Promise<boolean> {
  const rows = await query<any[]>("SELECT 1 FROM gc_staff WHERE userId = ? AND staffRole = 'owner' LIMIT 1", [userId]);
  return Boolean(rows[0]);
}

/**
 * Exclusão definitiva: apaga os dados pessoais e libera o e-mail para um novo cadastro do zero.
 * Fica só o registro no histórico (auditoria). Contratos e pagamentos já emitidos são mantidos por obrigação legal.
 */
export async function anonymizeAccount(userId: number, actorId: number, reason: string) {
  if (await isOwnerAccount(userId)) throw new HttpError(403, "A conta do dono do site não pode ser excluída.");
  const rows = await query<any[]>("SELECT u.id, u.name, u.email, u.role, p.accountType, s.staffRole FROM users u LEFT JOIN account_profiles p ON p.userId = u.id LEFT JOIN gc_staff s ON s.userId = u.id WHERE u.id = ? LIMIT 1", [userId]);
  const row = rows[0];
  if (!row) throw new HttpError(404, "Conta não encontrada");
  await withTransaction(async connection => {
    await connection.execute("UPDATE users SET name = ?, email = NULL, role = 'user', openId = ? WHERE id = ?", [`Conta excluída #${userId}`, `deleted_${userId}_${Date.now()}`.slice(0, 64), userId]);
    await connection.execute("UPDATE account_profiles SET status = 'deleted', passwordHash = NULL, city = NULL, bio = NULL, specialty = NULL, whatsapp = NULL, notifyOptIn = 0, featured = 0, vip = 0 WHERE userId = ?", [userId]);
    for (const table of ["gc_profile_details", "gc_sessions", "gc_password_resets", "gc_staff", "gc_magic_links"]) await connection.execute(`DELETE FROM ${table} WHERE userId = ?`, [userId]);
    await connection.execute("UPDATE gastro_proposals SET status = 'withdrawn' WHERE providerId = ? AND status = 'pending'", [userId]);
    await connection.execute("UPDATE gastro_events SET status = 'cancelled' WHERE clientId = ? AND status = 'open'", [userId]);
  });
  if (row.accountType === "provider" && row.role !== "admin") { const { unindexProvider } = await import("./indexing"); unindexProvider(userId); }
  await audit(actorId, "account.deleted", { reason, name: row.name, email: row.email, accountType: row.accountType, staffRole: row.staffRole ?? undefined }, userId);
}

// ------------------------------------------------------------------ rotas da equipe

const router = Router();
router.use((req, _res, next) => { if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertOrigin(req); next(); });
const idSchema = z.coerce.number().int().positive();
const roleSchema = z.enum(["admin", "manager", "operator"]);
const random = (n: number) => randomInt(n);

function origin(req: Request) {
  const configured = process.env.GASTRO_PUBLIC_ORIGIN;
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

/** Envia a senha temporária por e-mail. Sem e-mail configurado, devolve a senha para quem criou repassar. */
async function deliverTemporaryPassword(req: Request, to: string, name: string, password: string, role: StaffRole) {
  const { sendMailDetailed } = await import("./password");
  const esc = (s: string) => s.replace(/[<>&"]/g, "");
  const sent = await sendMailDetailed(to, "Seu acesso à administração - Eventos Conecta",
    `<p>Olá, ${esc(name)}.</p><p>Você recebeu acesso como <strong>${STAFF_ROLE_LABELS[role]}</strong> na administração do Eventos Conecta.</p>`
    + `<p>Entre em <a href="${origin(req)}/admin">${origin(req)}/admin</a> com:</p><p>E-mail: <strong>${esc(to)}</strong><br/>Senha temporária: <strong>${esc(password)}</strong></p>`
    + `<p>No primeiro acesso, você vai criar a sua própria senha. Se esquecer a senha depois, use "Esqueci minha senha" na tela de login.</p>`);
  return sent.ok ? { emailed: true as const } : { emailed: false as const, temporaryPassword: password, mailError: sent.error };
}

function mapStaff(row: any) {
  let saved: unknown = [];
  try { saved = row.permissions ? JSON.parse(row.permissions) : []; } catch { saved = []; }
  const role: StaffRole = (ROLES as readonly string[]).includes(row.staffRole) ? row.staffRole : "admin";
  return { id: Number(row.id), name: row.name ?? "", email: row.email ?? "", role, permissions: effectivePermissions(role, saved), status: row.status ?? "active", mustChangePassword: Boolean(row.mustChangePassword), createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined, lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : undefined };
}

/** Quem não é dono/administrador só pode dar as permissões que ele mesmo tem. */
function allowedGrant(actor: StaffInfo, wanted: Permission[]): Permission[] {
  return isFullAccess(actor.role) ? wanted : wanted.filter(p => actor.permissions.includes(p) && p !== "staff.manage");
}

router.get("/admin/me", wrap(async (req, res) => {
  const ctx = await requireStaff(req, "staff");
  res.json({ staff: { ...ctx.staff, name: ctx.user.name ?? "", email: ctx.user.email ?? "" } });
}));

router.get("/admin/staff", wrap(async (req, res) => {
  const ctx = await requireStaff(req);
  const rows = await query<any[]>(`SELECT u.id, u.name, u.email, s.staffRole, s.permissions, s.mustChangePassword, s.createdAt, p.status,
      (SELECT MAX(lastSeenAt) FROM gc_sessions gs WHERE gs.userId = u.id) lastSeenAt
    FROM gc_staff s JOIN users u ON u.id = s.userId LEFT JOIN account_profiles p ON p.userId = u.id
    WHERE u.role = 'admin' ORDER BY FIELD(s.staffRole, 'owner', 'admin', 'manager', 'operator'), u.name`);
  res.json({ staff: rows.map(mapStaff), me: { id: ctx.user.id, role: ctx.staff.role, permissions: ctx.staff.permissions } });
}));

router.post("/admin/staff", wrap(async (req, res) => {
  const ctx = await requireStaff(req);
  limit(`staff-create:${ctx.user.id}`, 20, 60 * 60_000, "Muitos cadastros seguidos; aguarde um pouco");
  const input = body(req, z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320), role: roleSchema, permissions: z.array(z.string()).max(40).default([]) }));
  if (!canManageRole(ctx.staff.role, input.role)) throw new HttpError(403, `Seu acesso não permite criar ${STAFF_ROLE_LABELS[input.role].toLowerCase()}.`);
  const email = normalizeEmail(input.email);
  const existing = await query<any[]>("SELECT id, role FROM users WHERE LOWER(email) = ? LIMIT 1", [email]);
  if (existing[0]) throw new HttpError(409, existing[0].role === "admin" ? "Este e-mail já faz parte da equipe." : "Este e-mail já está cadastrado como cliente ou profissional. Use outro e-mail para o acesso da equipe.");
  const permissions = input.role === "admin" ? [] : allowedGrant(ctx.staff, normalizePermissions(input.permissions));
  const password = temporaryPassword(random);
  const passwordHash = await hashPassword(password);
  const id = await withTransaction(async connection => {
    const [result] = await connection.execute<any>("INSERT INTO users (openId, name, email, loginMethod, role) VALUES (?, ?, ?, 'email', 'admin')", [`gc_staff_${Date.now()}_${random(1_000_000)}`.slice(0, 64), input.name, email]);
    const newId = Number(result.insertId);
    await connection.execute("INSERT INTO account_profiles (userId, accountType, status, passwordHash) VALUES (?, 'client', 'active', ?)", [newId, passwordHash]);
    await connection.execute("INSERT INTO gc_staff (userId, staffRole, permissions, mustChangePassword, createdBy) VALUES (?, ?, ?, 1, ?)", [newId, input.role, JSON.stringify(permissions), ctx.user.id]);
    return newId;
  });
  await audit(ctx.user.id, "staff.created", { role: input.role, email, permissions }, id);
  res.status(201).json({ id, ...(await deliverTemporaryPassword(req, email, input.name, password, input.role)) });
}));

async function targetStaff(id: number) {
  const rows = await query<any[]>("SELECT u.id, u.name, u.email, s.staffRole, s.permissions FROM gc_staff s JOIN users u ON u.id = s.userId WHERE s.userId = ? AND u.role = 'admin' LIMIT 1", [id]);
  if (!rows[0]) throw new HttpError(404, "Pessoa da equipe não encontrada");
  return rows[0];
}

router.patch("/admin/staff/:id", wrap(async (req, res) => {
  const ctx = await requireStaff(req);
  const id = parse(idSchema, req.params.id);
  const input = body(req, z.object({ role: roleSchema.optional(), permissions: z.array(z.string()).max(40).optional(), status: z.enum(["active", "suspended"]).optional() }).strict());
  const target = await targetStaff(id);
  if (target.staffRole === "owner") throw new HttpError(403, "O dono do site não pode ser alterado.");
  if (id === ctx.user.id) throw new HttpError(400, "Você não pode alterar o seu próprio acesso.");
  if (!canManageRole(ctx.staff.role, target.staffRole) || (input.role && !canManageRole(ctx.staff.role, input.role))) throw new HttpError(403, "Seu acesso não permite alterar esta pessoa.");
  const role: StaffRole = input.role ?? target.staffRole;
  const updates: string[] = [], values: unknown[] = [];
  if (input.role) { updates.push("staffRole = ?"); values.push(role); }
  if (input.permissions) { updates.push("permissions = ?"); values.push(JSON.stringify(role === "admin" ? [] : allowedGrant(ctx.staff, normalizePermissions(input.permissions)))); }
  if (updates.length) await execute(`UPDATE gc_staff SET ${updates.join(", ")} WHERE userId = ?`, [...values, id]);
  if (input.status) {
    await execute("UPDATE account_profiles SET status = ? WHERE userId = ?", [input.status, id]);
    if (input.status === "suspended") await execute("DELETE FROM gc_sessions WHERE userId = ?", [id]);
  }
  await audit(ctx.user.id, "staff.updated", input, id);
  res.json({ ok: true });
}));

router.post("/admin/staff/:id/reset-password", wrap(async (req, res) => {
  const ctx = await requireStaff(req);
  const id = parse(idSchema, req.params.id);
  const target = await targetStaff(id);
  if (target.staffRole === "owner" || !canManageRole(ctx.staff.role, target.staffRole)) throw new HttpError(403, "Seu acesso não permite redefinir a senha desta pessoa.");
  const password = temporaryPassword(random);
  await execute("UPDATE account_profiles SET passwordHash = ? WHERE userId = ?", [await hashPassword(password), id]);
  await execute("UPDATE gc_staff SET mustChangePassword = 1 WHERE userId = ?", [id]);
  await execute("DELETE FROM gc_sessions WHERE userId = ?", [id]);
  await audit(ctx.user.id, "staff.password_reset", {}, id);
  res.json(await deliverTemporaryPassword(req, String(target.email), String(target.name ?? ""), password, target.staffRole));
}));

router.delete("/admin/staff/:id", wrap(async (req, res) => {
  const ctx = await requireStaff(req);
  const id = parse(idSchema, req.params.id);
  const target = await targetStaff(id);
  if (target.staffRole === "owner") throw new HttpError(403, "O dono do site não pode ser excluído.");
  if (id === ctx.user.id) throw new HttpError(400, "Você não pode excluir o seu próprio acesso por aqui.");
  if (!canManageRole(ctx.staff.role, target.staffRole)) throw new HttpError(403, "Seu acesso não permite excluir esta pessoa.");
  await anonymizeAccount(id, ctx.user.id, "staff_removed");
  res.json({ ok: true });
}));

/** Troca da senha temporária no primeiro acesso. */
router.post("/admin/first-password", wrap(async (req, res) => {
  const ctx = await requireStaff(req, "staff");
  limit(`first-password:${clientIp(req)}`, 10, 15 * 60_000);
  const { passwordIsStrong, verifyPassword, setGcSession } = await import("./auth");
  const input = body(req, z.object({ current: z.string().min(1).max(200), next: z.string().min(10).max(200).refine(passwordIsStrong, "A senha precisa de 10+ caracteres, maiúscula, minúscula, número e símbolo") }));
  if (!(await verifyPassword(input.current, ctx.profile.passwordHash))) throw new HttpError(400, "Senha temporária incorreta");
  if (input.current === input.next) throw new HttpError(400, "A nova senha precisa ser diferente da temporária");
  await execute("UPDATE account_profiles SET passwordHash = ? WHERE userId = ?", [await hashPassword(input.next), ctx.user.id]);
  await execute("UPDATE gc_staff SET mustChangePassword = 0 WHERE userId = ?", [ctx.user.id]);
  await setGcSession(res, req, ctx.user.id);
  await audit(ctx.user.id, "staff.first_password", {}, ctx.user.id);
  res.json({ ok: true });
}));

/** O próprio cliente, profissional ou pessoa da equipe sai do site (o dono não pode). */
router.post("/account/delete", wrap(async (req, res) => {
  const context = await requireAuth(req);
  limit(`account-delete:${context.user.id}`, 5, 60 * 60_000);
  const { verifyPassword, clearGcSession } = await import("./auth");
  const input = body(req, z.object({ password: z.string().min(1).max(200), confirm: z.literal("EXCLUIR") }));
  if (!(await verifyPassword(input.password, context.profile.passwordHash))) throw new HttpError(400, "Senha incorreta");
  await anonymizeAccount(context.user.id, context.user.id, "self_deleted");
  await clearGcSession(req, res);
  res.json({ ok: true });
}));

router.use(errorHandler);

export function registerStaffRoutes(app: Express) {
  app.use("/api/gastro", router);
}
