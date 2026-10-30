// Cliente mínimo da API do Mercado Pago (sem SDK).
//  - Pix avulso:      POST /v1/payments (payment_method_id = "pix")
//  - Pix recorrente:  POST /preapproval (assinatura mensal; o profissional autoriza
//                     uma vez e o Mercado Pago cobra automaticamente a cada ciclo)
//  - Webhook:         assinatura x-signature (HMAC-SHA256) conferida com MP_WEBHOOK_SECRET;
//                     o status sempre é relido na API, nunca confiado no corpo recebido.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { HttpError } from "@shared/_core/errors";
import { normalizeDescriptor, PLATFORM_TAG } from "@shared/payments";
import { getInternalFlag, setInternalFlag } from "./content";
import { dbConfigured } from "./db";

const API = "https://api.mercadopago.com";

// Chaves cadastradas pelo admin no painel (Pagamentos) têm prioridade sobre as variáveis do Render.
type MpSettings = { accessToken: string; webhookSecret: string; descriptor: string };
let settings: MpSettings = { accessToken: "", webhookSecret: "", descriptor: "" };

/** Recarrega as chaves salvas no banco (chamado na inicialização, a cada hora e ao salvar no painel). */
export async function refreshMpSettings() {
  if (!dbConfigured()) return;
  try {
    settings = {
      accessToken: (await getInternalFlag("mp.accessToken")) ?? "",
      webhookSecret: (await getInternalFlag("mp.webhookSecret")) ?? "",
      descriptor: (await getInternalFlag("mp.descriptor")) ?? "",
    };
  } catch { /* banco indisponível: mantém o que já estava carregado */ }
}

export async function saveMpSettings(input: Partial<MpSettings>) {
  for (const [key, value] of Object.entries(input)) if (value !== undefined) await setInternalFlag(`mp.${key}`, value);
  await refreshMpSettings();
}

const accessToken = () => settings.accessToken || process.env.MP_ACCESS_TOKEN || "";
export const mpWebhookSecret = () => settings.webhookSecret || process.env.MP_WEBHOOK_SECRET || "";
export const mpDescriptor = () => normalizeDescriptor(settings.descriptor || process.env.MP_STATEMENT_DESCRIPTOR || PLATFORM_TAG) || PLATFORM_TAG;
export const mpConfigured = () => Boolean(accessToken());

/** Situação das chaves para o painel (nunca devolve a chave inteira). */
export function mpSettingsStatus() {
  const mask = (value: string) => (value ? `••••${value.slice(-4)}` : "");
  return {
    accessToken: { configured: Boolean(accessToken()), source: settings.accessToken ? "painel" : process.env.MP_ACCESS_TOKEN ? "render" : "", hint: mask(accessToken()), test: accessToken().startsWith("TEST-") },
    webhookSecret: { configured: Boolean(mpWebhookSecret()), source: settings.webhookSecret ? "painel" : process.env.MP_WEBHOOK_SECRET ? "render" : "", hint: mask(mpWebhookSecret()) },
    descriptor: mpDescriptor(),
  };
}

async function mp<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string; token?: string } = {}): Promise<T> {
  const token = init.token ?? accessToken();
  if (!token) throw new HttpError(503, "Pagamentos indisponíveis: cadastre as chaves do Mercado Pago no painel (Pagamentos)");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[MercadoPago] erro", response.status, path, (data as any)?.message ?? "");
      throw new HttpError(502, "O Mercado Pago recusou a operação. Tente novamente em instantes.");
    }
    return data as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(504, "Mercado Pago não respondeu a tempo");
  } finally {
    clearTimeout(timeout);
  }
}

export type MpPixPayment = {
  id: number;
  status: string; // pending | approved | rejected | cancelled | expired ...
  external_reference?: string;
  transaction_amount?: number;
  date_of_expiration?: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
  metadata?: Record<string, unknown>;
  preapproval_id?: string;
};

export type PaymentMetadata = { assinante_id: number; codigo_assinante: string; tipo: string };

/** Confere se a chave funciona (consulta a conta dona da chave). */
export const testAccessToken = (token?: string) => mp<{ id: number; nickname?: string; email?: string; site_id?: string }>("/users/me", { token });

export async function createPixPayment(input: { amountCents: number; description: string; payerEmail: string; externalReference: string; expiresAt: Date; notificationUrl?: string; metadata?: PaymentMetadata }) {
  return mp<MpPixPayment>("/v1/payments", {
    method: "POST",
    idempotencyKey: randomUUID(),
    body: {
      transaction_amount: Math.round(input.amountCents) / 100,
      description: input.description,
      payment_method_id: "pix",
      payer: { email: input.payerEmail },
      external_reference: input.externalReference,
      statement_descriptor: mpDescriptor(),
      metadata: { plataforma: "gastroconecta", ...(input.metadata ?? {}) },
      date_of_expiration: input.expiresAt.toISOString().replace("Z", "-00:00"),
      ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
    },
  });
}

export const getPayment = (id: string | number) => mp<MpPixPayment>(`/v1/payments/${encodeURIComponent(String(id))}`);

export type MpPreapproval = { id: string; status: string; init_point?: string; external_reference?: string; next_payment_date?: string; payer_email?: string };

/** Autorização da cobrança recorrente mensal; a 1ª cobrança é agendada para 5 dias antes do vencimento atual. */
export async function createPreapproval(input: { amountCents: number; reason: string; payerEmail: string; externalReference: string; startDate: Date; backUrl: string; notificationUrl?: string }) {
  return mp<MpPreapproval>("/preapproval", {
    method: "POST",
    idempotencyKey: randomUUID(),
    body: {
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        start_date: input.startDate.toISOString(),
        transaction_amount: Math.round(input.amountCents) / 100,
        currency_id: "BRL",
      },
      ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
    },
  });
}

export const getPreapproval = (id: string) => mp<MpPreapproval>(`/preapproval/${encodeURIComponent(id)}`);
export const cancelPreapproval = (id: string) => mp<MpPreapproval>(`/preapproval/${encodeURIComponent(id)}`, { method: "PUT", body: { status: "cancelled" } });

export type MpAuthorizedPayment = { id: number; preapproval_id: string; status: string; payment?: { id: number; status: string }; transaction_amount?: number };
export const getAuthorizedPayment = (id: string | number) => mp<MpAuthorizedPayment>(`/authorized_payments/${encodeURIComponent(String(id))}`);

/**
 * Valida o cabeçalho x-signature ("ts=...,v1=...") do Mercado Pago.
 * Manifesto: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 */
export function verifyWebhookSignature(input: { signature?: string; requestId?: string; dataId?: string; secret?: string }): boolean {
  const secret = input.secret ?? mpWebhookSecret();
  if (!secret || !input.signature) return false;
  const parts = Object.fromEntries(input.signature.split(",").map(part => part.split("=").map(s => s.trim()) as [string, string]));
  const ts = parts.ts, v1 = parts.v1;
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;
  let manifest = "";
  if (input.dataId) manifest += `id:${String(input.dataId).toLowerCase()};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  const given = Buffer.from(v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
