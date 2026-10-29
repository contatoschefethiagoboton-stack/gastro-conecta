import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import type { User } from "../../drizzle/schema";
import { execute, query, withTransaction } from "./db";
import { ENV } from "../_core/env";
import { sdk } from "../_core/sdk";
import { HttpError } from "@shared/_core/errors";

const scrypt = (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keylen, { ...options, maxmem: 128 * 1024 * 1024 }, (error, derivedKey) => error ? reject(error) : resolve(derivedKey));
  });
const GC_COOKIE = "gc_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const LOCAL_HOST_RE = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

export type AccountType = "client" | "provider";
export type AccountStatus = "active" | "pending" | "suspended" | "blocked" | "deleted";
export type ProfileRow = {
  userId: number;
  accountType: AccountType;
  status: AccountStatus;
  city: string | null;
  bio: string | null;
  specialty: string | null;
  vip: number | boolean;
  discountPercent: number;
  featured: number | boolean;
  passwordHash: string | null;
};
export type AuthContext = {
  user: User;
  profile: ProfileRow;
  source: "gastro" | "manus";
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isLocalRequest(req: Request): boolean {
  return LOCAL_HOST_RE.test(req.hostname || "");
}

export function gcCookieOptions(req: Request) {
  const local = isLocalRequest(req);
  return {
    httpOnly: true,
    path: "/",
    sameSite: local ? ("lax" as const) : ("none" as const),
    secure: !local,
    maxAge: SESSION_TTL_MS,
  };
}

export function passwordIsStrong(password: string): boolean {
  return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = (await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1 })) as Buffer;
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  if (!encoded) return false;
  const [algorithm, nText, rText, pText, saltText, digestText] = encoded.split("$");
  if (algorithm !== "scrypt" || !nText || !rText || !pText || !saltText || !digestText) return false;
  const n = Number(nText), r = Number(rText), p = Number(pText);
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p) || n < 16384 || n > 1048576 || r < 1 || p < 1) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(digestText, "base64url");
    const actual = (await scrypt(password, salt, expected.length, { N: n, r, p })) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function safeBoolean(value: number | boolean): boolean {
  return value === true || value === 1;
}

export async function getProfile(userId: number): Promise<ProfileRow | null> {
  const rows = await query<any[]>("SELECT userId, accountType, status, city, bio, specialty, vip, discountPercent, featured, passwordHash FROM account_profiles WHERE userId = ? LIMIT 1", [userId]);
  return rows[0] ?? null;
}

export async function ensureProfile(user: User, defaults: Partial<Pick<ProfileRow, "accountType" | "city">> = {}): Promise<ProfileRow> {
  await execute(
    "INSERT INTO account_profiles (userId, accountType, city, passwordHash) VALUES (?, ?, ?, NULL) ON DUPLICATE KEY UPDATE userId = VALUES(userId)",
    [user.id, defaults.accountType ?? "client", defaults.city ?? null],
  );
  const profile = await getProfile(user.id);
  if (!profile) throw new Error("account profile could not be initialized");
  return profile;
}

export async function createLocalUser(input: { name: string; email: string; password: string; accountType: AccountType; city: string }): Promise<{ user: User; profile: ProfileRow }> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  return withTransaction(async connection => {
    const [existing] = await connection.execute<any[]>("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1", [email]);
    if (existing.length > 0) throw new HttpError(409, "E-mail já cadastrado");
    const openId = `gc_${randomBytes(24).toString("hex")}`;
    const [result] = await connection.execute<any>("INSERT INTO users (openId, name, email, loginMethod, role) VALUES (?, ?, ?, 'email', 'user')", [openId, input.name.trim(), email]);
    const id = Number(result.insertId);
    const status = input.accountType === "client" ? "active" : "pending";
    await connection.execute("INSERT INTO account_profiles (userId, accountType, status, city, passwordHash) VALUES (?, ?, ?, ?, ?)", [id, input.accountType, status, input.city.trim(), passwordHash]);
    const [users] = await connection.execute<any[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
    const [profiles] = await connection.execute<any[]>("SELECT userId, accountType, status, city, bio, specialty, vip, discountPercent, featured, passwordHash FROM account_profiles WHERE userId = ?", [id]);
    if (!users[0] || !profiles[0]) throw new Error("user creation failed");
    return { user: users[0], profile: profiles[0] };
  });
}

export async function getUserByEmail(email: string): Promise<{ user: User; profile: ProfileRow } | null> {
  const rows = await query<any[]>("SELECT u.*, p.userId, p.accountType, p.status, p.city, p.bio, p.specialty, p.vip, p.discountPercent, p.featured, p.passwordHash FROM users u JOIN account_profiles p ON p.userId = u.id WHERE LOWER(u.email) = ? LIMIT 1", [normalizeEmail(email)]);
  if (!rows[0]) return null;
  const row = rows[0];
  const { userId, accountType, status, city, bio, specialty, vip, discountPercent, featured, passwordHash, ...user } = row;
  return { user: user as User, profile: { userId, accountType, status, city, bio, specialty, vip, discountPercent, featured, passwordHash } };
}

export async function createGcSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await withTransaction(async connection => {
    // A single active session is an account invariant, not a client-side convention.
    const [users] = await connection.execute<any[]>("SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE", [userId]);
    if (!users[0]) throw new HttpError(404, "Usuário não encontrado");
    await connection.execute("DELETE FROM gc_sessions WHERE userId = ?", [userId]);
    await connection.execute("INSERT INTO gc_sessions (userId, tokenHash, expiresAt) VALUES (?, ?, ?)", [userId, tokenHash(token), expires]);
  });
  return token;
}

export async function setGcSession(res: Response, req: Request, userId: number): Promise<void> {
  const token = await createGcSession(userId);
  res.cookie(GC_COOKIE, token, gcCookieOptions(req));
}

export async function clearGcSession(req: Request, res: Response): Promise<void> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[GC_COOKIE];
  if (token) await execute("DELETE FROM gc_sessions WHERE tokenHash = ?", [tokenHash(token)]);
  res.clearCookie(GC_COOKIE, gcCookieOptions(req));
}

async function fromGcSession(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const rows = await query<any[]>("SELECT u.*, p.userId, p.accountType, p.status, p.city, p.bio, p.specialty, p.vip, p.discountPercent, p.featured, p.passwordHash FROM gc_sessions s JOIN users u ON u.id = s.userId JOIN account_profiles p ON p.userId = u.id WHERE s.tokenHash = ? AND s.expiresAt > CURRENT_TIMESTAMP LIMIT 1", [tokenHash(token)]);
  const row = rows[0];
  if (!row) return null;
  await execute("UPDATE gc_sessions SET lastSeenAt = CURRENT_TIMESTAMP WHERE tokenHash = ?", [tokenHash(token)]);
  const { userId, accountType, status, city, bio, specialty, vip, discountPercent, featured, passwordHash, ...user } = row;
  return { user: user as User, profile: { userId, accountType, status, city, bio, specialty, vip, discountPercent, featured, passwordHash }, source: "gastro" };
}

export async function resolveAuth(req: Request): Promise<AuthContext | null> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const localToken = cookies[GC_COOKIE];
  const local = await fromGcSession(localToken);
  if (local) return local;
  // A present but invalid/expired GastroConecta cookie is an explicit local
  // logout/expiry state; do not turn it into an unexpected Manus session.
  if (localToken) return null;
  // Login Manus só existe na hospedagem Manus; fora dela (Render), ignora.
  if (!process.env.MANUS_OAUTH_API_URL) return null;
  try {
    const manusUser = await sdk.authenticateRequest(req);
    const profile = await ensureProfile(manusUser);
    if (ENV.ownerOpenId && manusUser.openId === ENV.ownerOpenId && manusUser.role !== "admin") {
      await execute("UPDATE users SET role = 'admin' WHERE id = ?", [manusUser.id]);
      manusUser.role = "admin";
    }
    return { user: manusUser, profile, source: "manus" };
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request): Promise<AuthContext> {
  const auth = await resolveAuth(req);
  if (!auth) throw new HttpError(401, "Autenticação necessária");
  if (["deleted", "blocked", "suspended"].includes(auth.profile.status)) throw new HttpError(403, "Conta indisponível");
  return auth;
}

export function publicUser(auth: AuthContext) {
  const owner = auth.user.role === "admin";
  return {
    id: auth.user.id,
    name: auth.user.name ?? "",
    email: auth.user.email ?? "",
    accountType: auth.profile.accountType,
    role: owner ? "admin" : "user",
    status: auth.profile.status,
    city: auth.profile.city ?? undefined,
    bio: auth.profile.bio ?? undefined,
    vip: safeBoolean(auth.profile.vip),
    discountPercent: auth.profile.discountPercent,
    featured: safeBoolean(auth.profile.featured),
  } as const;
}

/** Administrador da plataforma: papel "admin" gravado no banco (criado pelo setup de /admin). */
export async function isOwner(auth: AuthContext): Promise<boolean> {
  return auth.user.role === "admin";
}

export { GC_COOKIE, SESSION_TTL_MS, normalizeEmail, tokenHash };
