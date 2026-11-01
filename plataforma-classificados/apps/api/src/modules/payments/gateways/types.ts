/**
 * Contrato único para qualquer gateway/PSP. O domínio (assinaturas, PPV) só fala
 * com esta interface; trocar de provedor = escrever um novo adaptador.
 *
 * IMPORTANTE (risco comercial): a maioria dos gateways populares no Brasil
 * proíbe acompanhantes/conteúdo adulto nos termos de uso. Use processadores
 * "high-risk" com política explícita para adulto (ex.: CCBill, Segpay, Epoch,
 * Verotel para cartão) e confirme por escrito com o PSP de PIX antes de integrar.
 */

export type PaymentMethod = 'pix_automatico' | 'cartao_credito' | 'debito_conta' | 'pix_avulso';

export interface Customer {
  name: string;
  email: string;
  document: string; // CPF — exigido pelo PSP para PIX/antifraude
  phone?: string;
}

export interface AntiFraudContext {
  ip: string;
  userAgent?: string;
  deviceFingerprint?: string; // SDK antifraude do PSP no front-end
}

export interface CreateSubscriptionInput {
  reference: string;               // "sub_<uuid>" — volta nos webhooks
  customer: Customer;
  method: Exclude<PaymentMethod, 'pix_avulso'>;
  amountCents: number;             // valor do 1º ciclo (com desconto)
  recurringAmountCents: number;    // valor dos ciclos seguintes
  intervalDays: 15 | 30;
  cardToken?: string;              // cartão SEMPRE tokenizado no navegador (PCI-DSS SAQ-A)
  bankAccount?: { bank: string; agency: string; account: string }; // débito em conta
  antiFraud: AntiFraudContext;
}

export interface CreateSubscriptionResult {
  gatewaySubscriptionId: string;
  gatewayCustomerId?: string;
  status: 'pending_authorization' | 'active';
  /** PIX Automático: QR Code/copia-e-cola que autoriza a recorrência e paga o 1º ciclo. */
  pix?: { qrCodeBase64?: string; copyPaste: string; expiresAt: string };
  /** 3-D Secure ou autorização bancária */
  redirectUrl?: string;
}

export interface CreateChargeInput {
  reference: string;               // "ppv_<uuid>"
  customer: { email: string; name?: string; document?: string };
  method: 'pix_avulso' | 'cartao_credito';
  amountCents: number;
  description: string;
  cardToken?: string;
  antiFraud: AntiFraudContext;
}

export interface CreateChargeResult {
  gatewayPaymentId: string;
  status: 'pending' | 'paid';
  pix?: { qrCodeBase64?: string; copyPaste: string; expiresAt: string };
  redirectUrl?: string;
}

/** Eventos normalizados — cada adaptador traduz o webhook do PSP para cá. */
export type GatewayEvent =
  | { type: 'subscription.activated'; eventId: string; gatewaySubscriptionId: string; reference?: string }
  | {
      type: 'payment.paid';
      eventId: string;
      gatewayPaymentId: string;
      gatewaySubscriptionId?: string;
      reference?: string;
      amountCents: number;
      method: PaymentMethod;
      paidAt: string;
      periodStart?: string;
      periodEnd?: string;
    }
  | { type: 'payment.failed'; eventId: string; gatewayPaymentId: string; gatewaySubscriptionId?: string; reference?: string; reason: string; method: PaymentMethod; amountCents: number }
  | { type: 'payment.refunded' | 'payment.chargeback'; eventId: string; gatewayPaymentId: string; reference?: string }
  | { type: 'subscription.canceled'; eventId: string; gatewaySubscriptionId: string; reference?: string };

export interface PaymentGateway {
  readonly name: string;
  createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>;
  cancelSubscription(gatewaySubscriptionId: string): Promise<void>;
  updateSubscriptionAmount(gatewaySubscriptionId: string, amountCents: number): Promise<void>;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  /** Valida assinatura HMAC do webhook sobre o CORPO BRUTO. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(rawBody: Buffer): GatewayEvent | null;
}
