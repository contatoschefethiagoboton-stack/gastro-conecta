// Notificações da plataforma.
//  - Admin: tudo o que acontece (novos clientes e profissionais, pedidos de orçamento, propostas,
//    pagamentos…) aparece no sino do painel e, se configurado, chega por e-mail e WhatsApp.
//  - Clientes e profissionais: aviso no painel + WhatsApp com link que já entra logado no site
//    (link de acesso válido por 7 dias) para responder na hora.
// WhatsApp usa a API oficial do WhatsApp Business (Meta Cloud API) com um modelo de mensagem aprovado
// de 3 variáveis: {{1}} título, {{2}} texto e {{3}} link. Sem as chaves, só o aviso no painel e o e-mail funcionam.
import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { dbConfigured, execute, query } from "./db";
import { getInternalFlag, getSiteContent, setInternalFlag } from "./content";
import { sendMail } from "./password";
import { loadDetails } from "./profiles";

const DAY = 24 * 60 * 60 * 1000;
const MAGIC_TTL_MS = 7 * DAY;

// ------------------------------------------------------------------ configurações (painel → Notificações)

type NotifySettings = { waToken: string; waPhoneNumberId: string; waTemplate: string; waLang: string; adminEmails: string; adminEmailOn: boolean; adminWhatsappOn: boolean };
let settings: NotifySettings = { waToken: "", waPhoneNumberId: "", waTemplate: "", waLang: "pt_BR", adminEmails: "", adminEmailOn: true, adminWhatsappOn: true };
let origin = process.env.GASTRO_PUBLIC_ORIGIN?.replace(/\/+$/, "") ?? "";

export async function refreshNotifySettings() {
  if (!dbConfigured()) return;
  try {
    const get = async (key: string) => (await getInternalFlag(`notify.${key}`)) ?? "";
    settings = {
      waToken: await get("waToken"), waPhoneNumberId: await get("waPhoneNumberId"), waTemplate: await get("waTemplate"), waLang: (await get("waLang")) || "pt_BR",
      adminEmails: await get("adminEmails"), adminEmailOn: (await get("adminEmailOn")) !== "false", adminWhatsappOn: (await get("adminWhatsappOn")) !== "false",
    };
    const saved = await getInternalFlag("publicOrigin");
    if (!process.env.GASTRO_PUBLIC_ORIGIN && saved) origin = saved;
  } catch { /* banco indisponível: mantém o que já estava carregado */ }
}

export async function saveNotifySettings(input: Partial<Record<keyof NotifySettings, string>>) {
  for (const [key, value] of Object.entries(input)) if (value !== undefined) await setInternalFlag(`notify.${key}`, value);
  await refreshNotifySettings();
}

const waToken = () => settings.waToken || process.env.WHATSAPP_TOKEN || "";
const waPhoneId = () => settings.waPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const waTemplate = () => settings.waTemplate || process.env.WHATSAPP_TEMPLATE || "";
export const whatsappConfigured = () => Boolean(waToken() && waPhoneId() && waTemplate());

export function notifySettingsStatus() {
  return {
    whatsapp: { configured: whatsappConfigured(), token: waToken() ? `••••${waToken().slice(-4)}` : "", phoneNumberId: waPhoneId(), template: waTemplate(), lang: settings.waLang },
    email: { configured: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM), adminEmails: settings.adminEmails, on: settings.adminEmailOn },
    adminWhatsappOn: settings.adminWhatsappOn,
    origin,
  };
}

/** Guarda o endereço público do site (usado nos links enviados fora de uma requisição). */
export function rememberOrigin(req: Request) {
  if (process.env.GASTRO_PUBLIC_ORIGIN) return;
  const host = req.get("host");
  if (!host || /localhost|127\.0\.0\.1/.test(host)) return;
  const current = `${req.get("x-forwarded-proto")?.split(",")[0] || req.protocol}://${host}`;
  if (current !== origin) { origin = current; if (dbConfigured()) void setInternalFlag("publicOrigin", current).catch(() => undefined); }
}

// ------------------------------------------------------------------ link de acesso automático

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Link que entra logado e abre a página indicada (ex.: /painel?aba=requests). */
export async function magicLink(userId: number, path: string): Promise<string> {
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path.slice(0, 290) : "/painel";
  const token = randomBytes(24).toString("base64url");
  await execute("INSERT INTO gc_magic_links (userId, tokenHash, path, expiresAt) VALUES (?, ?, ?, ?)", [userId, tokenHash(token), safePath, new Date(Date.now() + MAGIC_TTL_MS)]);
  return `${origin}/api/gastro/l/${token}`;
}

export async function consumeMagicLink(token: string): Promise<{ userId: number; path: string } | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const rows = await query<any[]>(`SELECT m.userId, m.path FROM gc_magic_links m JOIN account_profiles p ON p.userId = m.userId JOIN users u ON u.id = m.userId
    WHERE m.tokenHash = ? AND m.expiresAt > CURRENT_TIMESTAMP AND p.status IN ('active','pending') AND u.role <> 'admin' LIMIT 1`, [tokenHash(token)]);
  return rows[0] ? { userId: Number(rows[0].userId), path: String(rows[0].path) } : null;
}

// ------------------------------------------------------------------ envio

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const toWhatsapp = (value: unknown) => { const d = digits(value); if (d.length < 10) return ""; return d.startsWith("55") && d.length > 11 ? d : `55${d}`; };

/** Mensagem pelo modelo aprovado no WhatsApp Business ({{1}} título, {{2}} texto, {{3}} link). */
export async function sendWhatsapp(phone: string, title: string, text: string, link: string): Promise<boolean> {
  const to = toWhatsapp(phone);
  if (!to || !whatsappConfigured()) return false;
  const clean = (v: string, max: number) => v.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").slice(0, max) || "-";
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(waPhoneId())}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${waToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to, type: "template",
        template: { name: waTemplate(), language: { code: settings.waLang || "pt_BR" }, components: [{ type: "body", parameters: [{ type: "text", text: clean(title, 120) }, { type: "text", text: clean(text, 600) }, { type: "text", text: clean(link, 300) }] }] },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) console.warn("[WhatsApp] envio recusado", response.status);
    return response.ok;
  } catch {
    return false;
  }
}

const escapeHtml = (v: string) => v.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Telefone de WhatsApp do usuário: o do cadastro ou o dos dados completos. */
export async function userPhone(userId: number): Promise<string> {
  const rows = await query<any[]>("SELECT whatsapp FROM account_profiles WHERE userId = ? LIMIT 1", [userId]);
  if (rows[0]?.whatsapp) return String(rows[0].whatsapp);
  const { details } = await loadDetails(userId);
  return String(details?.phone ?? "");
}

export type NotifyInput = { type: string; title: string; body: string; path?: string; whatsapp?: boolean; email?: boolean };

/** Aviso para um cliente ou profissional (painel + WhatsApp com link de acesso + e-mail opcional). */
export async function notifyUser(userId: number, input: NotifyInput) {
  if (!dbConfigured()) return;
  try {
    const path = input.path ?? "/painel";
    await execute("INSERT INTO gc_notifications (audience, userId, type, title, body, link) VALUES ('user', ?, ?, ?, ?, ?)", [userId, input.type, input.title.slice(0, 200), input.body, path]);
    if (input.whatsapp === false && !input.email) return;
    const link = await magicLink(userId, path);
    if (input.whatsapp !== false) await sendWhatsapp(await userPhone(userId), input.title, input.body, link);
    if (input.email) {
      const rows = await query<any[]>("SELECT email FROM users WHERE id = ? LIMIT 1", [userId]);
      if (rows[0]?.email) await sendMail(String(rows[0].email), input.title, `<p>${escapeHtml(input.body)}</p><p><a href="${link}">Abrir no GastroConecta</a></p>`);
    }
  } catch (error) {
    console.warn("[Notificação] falhou:", error instanceof Error ? error.message : error);
  }
}

/** Aviso para a administração: tudo que acontece na plataforma. */
export async function notifyAdmin(input: NotifyInput) {
  if (!dbConfigured()) return;
  try {
    const path = input.path ?? "/admin/painel";
    await execute("INSERT INTO gc_notifications (audience, userId, type, title, body, link) VALUES ('admin', NULL, ?, ?, ?, ?)", [input.type, input.title.slice(0, 200), input.body, path]);
    const url = `${origin}${path}`;
    if (settings.adminEmailOn) {
      const list = settings.adminEmails || process.env.ADMIN_EMAIL || (await query<any[]>("SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL LIMIT 3")).map(r => r.email).join(",");
      for (const to of list.split(/[,;\s]+/).filter(e => /@/.test(e)).slice(0, 5)) await sendMail(to, `[GastroConecta] ${input.title}`, `<p>${escapeHtml(input.body)}</p><p><a href="${url}">Abrir o painel</a></p>`);
    }
    if (settings.adminWhatsappOn && whatsappConfigured()) {
      const content = await getSiteContent();
      await sendWhatsapp(content["contact.whatsapp"] ?? "", `[Admin] ${input.title}`, input.body, url);
    }
  } catch (error) {
    console.warn("[Notificação admin] falhou:", error instanceof Error ? error.message : error);
  }
}

/** Dispara sem segurar a resposta da requisição. */
export const later = (task: () => Promise<unknown>) => { setImmediate(() => { task().catch(() => undefined); }); };
