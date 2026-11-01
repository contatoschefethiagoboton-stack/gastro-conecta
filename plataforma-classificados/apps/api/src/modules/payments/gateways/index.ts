import { createHmac, randomUUID } from 'node:crypto';
import { env } from '../../../config/env.js';
import { safeEqual } from '../../../lib/crypto.js';
import type {
  CreateChargeInput, CreateChargeResult, CreateSubscriptionInput, CreateSubscriptionResult,
  GatewayEvent, PaymentGateway,
} from './types.js';

function verifyHmacHeader(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, header = 'x-signature') {
  const received = headers[header];
  if (typeof received !== 'string') return false;
  const expected = createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
}

/**
 * Gateway de desenvolvimento: devolve QR Codes falsos e aceita webhooks já no
 * formato normalizado (GatewayEvent), assinados com PAYMENT_WEBHOOK_SECRET.
 * Simule um pagamento com: scripts/simulate-webhook.sh
 */
class MockGateway implements PaymentGateway {
  readonly name = 'mock';
  async createSubscription(i: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const id = `mock_sub_${randomUUID()}`;
    if (i.method === 'pix_automatico') {
      return {
        gatewaySubscriptionId: id,
        status: 'pending_authorization',
        pix: { copyPaste: `00020126MOCKPIXAUTOMATICO${i.reference}`, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() },
      };
    }
    return { gatewaySubscriptionId: id, status: 'pending_authorization', redirectUrl: `https://mock-psp.local/authorize/${id}` };
  }
  async cancelSubscription() {}
  async updateSubscriptionAmount() {}
  async createCharge(i: CreateChargeInput): Promise<CreateChargeResult> {
    return {
      gatewayPaymentId: `mock_pay_${randomUUID()}`,
      status: 'pending',
      pix: { copyPaste: `00020126MOCKPIX${i.reference}`, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() },
    };
  }
  verifyWebhook(raw: Buffer, h: Record<string, string | string[] | undefined>) {
    return verifyHmacHeader(raw, h);
  }
  parseWebhook(raw: Buffer): GatewayEvent | null {
    return JSON.parse(raw.toString('utf8')) as GatewayEvent;
  }
}

/**
 * Adaptador HTTP genérico — modelo para integrar o PSP escolhido.
 * Ajuste endpoints e o mapeamento em parseWebhook() ao contrato real do provedor.
 */
class HttpGateway implements PaymentGateway {
  readonly name = 'http';
  private async call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
    const res = await fetch(`${env.PAYMENT_API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.PAYMENT_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`PSP ${path} HTTP ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  async createSubscription(i: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const d = await this.call<Record<string, any>>('/subscriptions', {
      external_reference: i.reference,
      customer: i.customer,
      payment_method: i.method, // pix_automatico | credit_card | direct_debit
      first_amount: i.amountCents,
      amount: i.recurringAmountCents,
      interval: { unit: 'day', count: i.intervalDays },
      card_token: i.cardToken,
      bank_account: i.bankAccount,
      three_d_secure: i.method === 'cartao_credito' ? 'required' : undefined,
      antifraud: { ip: i.antiFraud.ip, user_agent: i.antiFraud.userAgent, device_id: i.antiFraud.deviceFingerprint },
    });
    return {
      gatewaySubscriptionId: String(d.id),
      gatewayCustomerId: d.customer_id,
      status: d.status === 'active' ? 'active' : 'pending_authorization',
      pix: d.pix ? { qrCodeBase64: d.pix.qr_code_base64, copyPaste: d.pix.copy_paste, expiresAt: d.pix.expires_at } : undefined,
      redirectUrl: d.authorization_url,
    };
  }
  async cancelSubscription(id: string) {
    await this.call(`/subscriptions/${id}/cancel`);
  }
  async updateSubscriptionAmount(id: string, amountCents: number) {
    await this.call(`/subscriptions/${id}`, { amount: amountCents }, 'PATCH');
  }
  async createCharge(i: CreateChargeInput): Promise<CreateChargeResult> {
    const d = await this.call<Record<string, any>>('/charges', {
      external_reference: i.reference,
      amount: i.amountCents,
      description: i.description,
      payment_method: i.method,
      customer: i.customer,
      card_token: i.cardToken,
      antifraud: { ip: i.antiFraud.ip, device_id: i.antiFraud.deviceFingerprint },
    });
    return {
      gatewayPaymentId: String(d.id),
      status: d.status === 'paid' ? 'paid' : 'pending',
      pix: d.pix ? { qrCodeBase64: d.pix.qr_code_base64, copyPaste: d.pix.copy_paste, expiresAt: d.pix.expires_at } : undefined,
      redirectUrl: d.redirect_url,
    };
  }
  verifyWebhook(raw: Buffer, h: Record<string, string | string[] | undefined>) {
    return verifyHmacHeader(raw, h, 'x-psp-signature');
  }
  parseWebhook(raw: Buffer): GatewayEvent | null {
    const d = JSON.parse(raw.toString('utf8')) as Record<string, any>;
    const base = { eventId: String(d.id), reference: d.data?.external_reference as string | undefined };
    switch (d.type) {
      case 'subscription.authorized':
        return { ...base, type: 'subscription.activated', gatewaySubscriptionId: d.data.subscription_id };
      case 'charge.paid':
        return {
          ...base, type: 'payment.paid', gatewayPaymentId: d.data.id, gatewaySubscriptionId: d.data.subscription_id,
          amountCents: d.data.amount, method: d.data.payment_method, paidAt: d.data.paid_at,
          periodStart: d.data.period?.start, periodEnd: d.data.period?.end,
        };
      case 'charge.failed':
        return {
          ...base, type: 'payment.failed', gatewayPaymentId: d.data.id, gatewaySubscriptionId: d.data.subscription_id,
          reason: d.data.failure_reason ?? 'desconhecido', method: d.data.payment_method, amountCents: d.data.amount,
        };
      case 'charge.refunded':
        return { ...base, type: 'payment.refunded', gatewayPaymentId: d.data.id };
      case 'charge.chargeback':
        return { ...base, type: 'payment.chargeback', gatewayPaymentId: d.data.id };
      case 'subscription.canceled':
        return { ...base, type: 'subscription.canceled', gatewaySubscriptionId: d.data.subscription_id };
      default:
        return null; // evento irrelevante: confirma recebimento e ignora
    }
  }
}

export const gateway: PaymentGateway = env.PAYMENT_GATEWAY === 'http' ? new HttpGateway() : new MockGateway();
