// "Esqueci minha senha", redefinição por link e troca de senha dentro da conta.
import { randomBytes } from "node:crypto";
import { Router, type Express, type Request } from "express";
import { z } from "zod";
import { HttpError } from "@shared/_core/errors";
import { assertOrigin, body, clientIp, errorHandler, limit, parse, wrap } from "./http";
import { dbConfigured, execute, query, withTransaction } from "./db";
import { getUserByEmail, hashPassword, isOwner, passwordIsStrong, requireAuth, setGcSession, tokenHash, verifyPassword } from "./auth";

const router = Router();
const RESET_TTL_MS = 60 * 60 * 1000;
const strongPassword = z.string().min(10).max(200).refine(passwordIsStrong, "A senha precisa de 10+ caracteres, maiúscula, minúscula, número e símbolo");

router.use((req, _res, next) => { if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertOrigin(req); next(); });

function origin(req: Request) {
  const configured = process.env.GASTRO_PUBLIC_ORIGIN;
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

export async function createResetLink(req: Request, userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await execute("UPDATE gc_password_resets SET usedAt = CURRENT_TIMESTAMP WHERE userId = ? AND usedAt IS NULL", [userId]);
  await execute("INSERT INTO gc_password_resets (userId, tokenHash, expiresAt) VALUES (?, ?, ?)", [userId, tokenHash(token), new Date(Date.now() + RESET_TTL_MS)]);
  return `${origin(req)}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

/** Envia e-mail pelo Resend (RESEND_API_KEY + MAIL_FROM). Sem configuração, não envia. */
async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, subject, html }) });
    return response.ok;
  } catch {
    return false;
  }
}
export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

router.post("/password/forgot", wrap(async (req, res) => {
  if (!dbConfigured()) throw new HttpError(503, "Banco de dados não configurado");
  const input = body(req, z.object({ email: z.string().trim().email().max(320) }));
  limit(`forgot:${clientIp(req)}`, 5, 15 * 60_000);
  limit(`forgot-mail:${input.email.toLowerCase()}`, 3, 60 * 60_000);
  const found = await getUserByEmail(input.email);
  if (found && found.user.role !== "admin" && !["deleted", "blocked"].includes(found.profile.status)) {
    const link = await createResetLink(req, found.user.id);
    const sent = await sendMail(found.user.email ?? input.email, "Redefinição de senha - GastroConecta", `<p>Olá, ${String(found.user.name ?? "").replace(/[<>&]/g, "")}.</p><p>Para criar uma nova senha, acesse o link abaixo (válido por 1 hora):</p><p><a href="${link}">${link}</a></p><p>Se você não pediu a troca, ignore este e-mail.</p>`);
    if (!sent && process.env.NODE_ENV !== "production") console.log(`[GastroConecta] Link de redefinição (desenvolvimento) para ${found.user.email}: ${link}`);
  }
  // Resposta sempre igual: não revela se o e-mail existe.
  res.json({ ok: true, message: mailConfigured() ? "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha." : "Se o e-mail estiver cadastrado, o link de redefinição será enviado. Se não receber em alguns minutos, use o Fale Conosco para que a administração envie o link." });
}));

router.post("/password/reset", wrap(async (req, res) => {
  if (!dbConfigured()) throw new HttpError(503, "Banco de dados não configurado");
  limit(`reset:${clientIp(req)}`, 10, 15 * 60_000);
  const input = body(req, z.object({ token: z.string().min(20).max(200), password: strongPassword }));
  const passwordHash = await hashPassword(input.password);
  const userId = await withTransaction(async connection => {
    const [rows] = await connection.execute<any[]>("SELECT id, userId FROM gc_password_resets WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE", [tokenHash(input.token)]);
    if (!rows[0]) throw new HttpError(400, "Link inválido ou expirado. Peça um novo em “Esqueci minha senha”.");
    await connection.execute("UPDATE gc_password_resets SET usedAt = CURRENT_TIMESTAMP WHERE id = ?", [rows[0].id]);
    await connection.execute("UPDATE account_profiles SET passwordHash = ? WHERE userId = ?", [passwordHash, rows[0].userId]);
    await connection.execute("DELETE FROM gc_sessions WHERE userId = ?", [rows[0].userId]);
    return Number(rows[0].userId);
  });
  await execute("INSERT INTO gastro_audit_logs (action, details, actorId, targetId) VALUES ('account.password_reset', '{}', ?, ?)", [userId, userId]);
  res.json({ ok: true });
}));

router.post("/password/change", wrap(async (req, res) => {
  const context = await requireAuth(req);
  limit(`pwchange:${context.user.id}`, 8, 15 * 60_000);
  const input = body(req, z.object({ current: z.string().min(1).max(200), next: strongPassword }));
  if (!(await verifyPassword(input.current, context.profile.passwordHash))) throw new HttpError(400, "Senha atual incorreta");
  await execute("UPDATE account_profiles SET passwordHash = ? WHERE userId = ?", [await hashPassword(input.next), context.user.id]);
  // Renova a sessão atual e derruba as demais.
  await setGcSession(res, req, context.user.id);
  await execute("INSERT INTO gastro_audit_logs (action, details, actorId, targetId) VALUES ('account.password_change', '{}', ?, ?)", [context.user.id, context.user.id]);
  res.json({ ok: true });
}));

/** A administração gera o link para quem pediu ajuda pelo Fale Conosco. */
router.post("/admin/users/:id/reset-link", wrap(async (req, res) => {
  const context = await requireAuth(req);
  if (!(await isOwner(context))) throw new HttpError(403, "Acesso reservado à administração");
  const id = parse(z.coerce.number().int().positive(), req.params.id);
  const target = await query<any[]>("SELECT id, role FROM users WHERE id = ? LIMIT 1", [id]);
  if (!target[0] || target[0].role === "admin") throw new HttpError(404, "Usuário não encontrado");
  const link = await createResetLink(req, id);
  await execute("INSERT INTO gastro_audit_logs (action, details, actorId, targetId) VALUES ('admin.password_reset_link', '{}', ?, ?)", [context.user.id, id]);
  res.json({ link, expiresInMinutes: 60 });
}));

router.use(errorHandler);

export function registerPasswordRoutes(app: Express) {
  app.use("/api/gastro", router);
}
