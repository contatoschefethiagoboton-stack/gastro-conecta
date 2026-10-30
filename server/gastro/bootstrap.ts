import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { defaultPromotions } from "@shared/promotions";
import { buildMysqlConfig, dbConfigured, ensureDatabaseExists, execute, getGastroPool, query, withTransaction } from "./db";
import { getInternalFlag, setInternalFlag } from "./content";
import { hashPassword, normalizeEmail, passwordIsStrong } from "./auth";
import { refreshMpSettings } from "./mercadopago";

export const dbState: { ready: boolean; error: string } = { ready: false, error: "" };

let setupCodeHash: Buffer | null = null;
const digest = (value: string) => createHash("sha256").update(value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")).digest();

function findMigrationsFolder(): string | null {
  const candidates = [path.resolve(process.cwd(), "drizzle"), path.resolve(import.meta.dirname ?? ".", "..", "drizzle"), path.resolve(import.meta.dirname ?? ".", "../..", "drizzle")];
  return candidates.find(dir => fs.existsSync(path.join(dir, "meta", "_journal.json"))) ?? null;
}

export async function adminExists(): Promise<boolean> {
  const rows = await query<any[]>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  return Boolean(rows[0]);
}

export function verifySetupCode(code: string): boolean {
  if (!setupCodeHash) return false;
  const given = digest(code);
  return given.length === setupCodeHash.length && timingSafeEqual(given, setupCodeHash);
}

export function consumeSetupCode() {
  setupCodeHash = null;
}

function issueSetupCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  const raw = Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
  const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
  setupCodeHash = digest(code);
  console.log("==================================================================");
  console.log("[GastroConecta] Nenhum administrador cadastrado ainda.");
  console.log(`[GastroConecta] Código de configuração do admin: ${code}`);
  console.log("[GastroConecta] Abra /admin no site e use este código para criar o acesso.");
  console.log("==================================================================");
}

/** Cria ou atualiza o administrador a partir de ADMIN_EMAIL e ADMIN_PASSWORD (opcional). */
async function adminFromEnv() {
  const email = process.env.ADMIN_EMAIL ? normalizeEmail(process.env.ADMIN_EMAIL) : "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) return;
  if (!passwordIsStrong(password)) { console.warn("[GastroConecta] ADMIN_PASSWORD ignorada: use 10+ caracteres com maiúscula, minúscula, número e símbolo."); return; }
  const passwordHash = await hashPassword(password);
  await createOrPromoteAdmin({ email, name: process.env.ADMIN_NAME || "Administrador", passwordHash });
  console.log(`[GastroConecta] Administrador sincronizado a partir de ADMIN_EMAIL (${email}).`);
}

export async function createOrPromoteAdmin(input: { email: string; name: string; passwordHash: string }): Promise<number> {
  return withTransaction(async connection => {
    const [existing] = await connection.execute<any[]>("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1", [input.email]);
    let id: number;
    if (existing[0]) {
      id = Number(existing[0].id);
      await connection.execute("UPDATE users SET role = 'admin' WHERE id = ?", [id]);
      await connection.execute("INSERT INTO account_profiles (userId, accountType, status, passwordHash) VALUES (?, 'client', 'active', ?) ON DUPLICATE KEY UPDATE status = 'active', passwordHash = VALUES(passwordHash)", [id, input.passwordHash]);
    } else {
      const openId = `gc_admin_${randomBytes(16).toString("hex")}`;
      const [result] = await connection.execute<any>("INSERT INTO users (openId, name, email, loginMethod, role) VALUES (?, ?, ?, 'email', 'admin')", [openId, input.name, input.email]);
      id = Number(result.insertId);
      await connection.execute("INSERT INTO account_profiles (userId, accountType, status, passwordHash) VALUES (?, 'client', 'active', ?)", [id, input.passwordHash]);
    }
    return id;
  });
}

async function seedPromotions() {
  if (await getInternalFlag("promotionsSeeded")) return;
  const rows = await query<any[]>("SELECT COUNT(*) count FROM gc_promotions");
  if (Number(rows[0]?.count ?? 0) === 0) {
    let order = 0;
    for (const p of defaultPromotions) {
      await execute("INSERT INTO gc_promotions (badge, title, text, ctaLabel, whatsappMessage, eventType, startMd, endMd, active, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [p.badge, p.title, p.text, p.cta, p.whatsappMessage, p.eventType ?? null, p.start, p.end, p.active, order++]);
    }
  }
  await setInternalFlag("promotionsSeeded", new Date().toISOString());
}

/** Roda na inicialização: migrações, dados iniciais e acesso do administrador. */
export async function bootstrapDatabase() {
  if (!dbConfigured()) {
    dbState.error = "DATABASE_URL não configurado";
    console.warn("[GastroConecta] DATABASE_URL não configurado: cadastro, login e painel ficam indisponíveis até configurar o banco.");
    return;
  }
  try {
    const cfg = buildMysqlConfig(process.env.DATABASE_URL ?? "");
    console.log(`[GastroConecta] Conectando ao banco "${cfg.database}" em ${cfg.host}:${cfg.port} (SSL ${cfg.ssl ? "ligado" : "desligado"}).`);
    await ensureDatabaseExists();
    const folder = findMigrationsFolder();
    if (!folder) throw new Error("pasta drizzle/ com as migrações não encontrada");
    await migrate(drizzle(getGastroPool()), { migrationsFolder: folder });
    console.log("[GastroConecta] Banco de dados atualizado (migrações aplicadas).");
    await seedPromotions();
    await refreshMpSettings();
    await adminFromEnv();
    if (!(await adminExists())) issueSetupCode();
    dbState.ready = true;
    dbState.error = "";
  } catch (error) {
    dbState.ready = false;
    const message = error instanceof Error ? error.message.split("\n")[0] : "falha desconhecida";
    // O drizzle esconde o motivo real em error.cause (ex.: senha errada, sem permissão, SSL).
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    dbState.error = cause || message;
    console.error("[GastroConecta] Falha ao preparar o banco de dados:", message, cause ? `| Motivo: ${cause}` : "");
  }
}
