// Identificação dos pagamentos do GastroConecta no Mercado Pago.
// A mesma conta do Mercado Pago recebe de outras plataformas, então cada cobrança leva:
//  - "Referência externa" (external_reference): GASTROCONECTA-<TIPO>-U<id do assinante>[-P<nº do pagamento>]
//  - Descrição: "GastroConecta · <tipo> · <código do assinante> · <nome>"
//  - metadata: { plataforma: "gastroconecta", assinante_id, codigo_assinante, tipo }
// Assim, no extrato/relatório do Mercado Pago, dá para filtrar por "GASTROCONECTA" e saber quem pagou.

export const PLATFORM_TAG = 'GASTROCONECTA';
export type PaymentKind = 'ASSINATURA' | 'ASSINATURA-AUTO' | 'PROMOCAO';
export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = { ASSINATURA: 'Assinatura mensal', 'ASSINATURA-AUTO': 'Assinatura mensal (Pix automático)', PROMOCAO: 'Adicional de promoção' };

/** Código do assinante mostrado no painel e na descrição do pagamento (ex.: GC-00012). */
export const subscriberCode = (userId: number) => `GC-${String(Math.max(0, Math.floor(userId))).padStart(5, '0')}`;

export const paymentReference = (kind: PaymentKind, userId: number, rowId?: number) => `${PLATFORM_TAG}-${kind}-U${userId}${rowId ? `-P${rowId}` : ''}`;

export function paymentDescription(kind: PaymentKind, userId: number, name: string, extra = ''): string {
  return ['GastroConecta', PAYMENT_KIND_LABELS[kind] + (extra ? ` ${extra}` : ''), subscriberCode(userId), name.trim()].filter(Boolean).join(' · ').slice(0, 200);
}

/** Lê a referência (formato novo e o antigo "gcsub:<id>:<pagamento>" / "gcsub-auto:<id>"). */
export function parsePaymentReference(ref: string | null | undefined): { kind: PaymentKind; userId: number; rowId?: number } | null {
  const value = String(ref ?? '');
  const current = /^GASTROCONECTA-(ASSINATURA-AUTO|ASSINATURA|PROMOCAO)-U(\d+)(?:-P(\d+))?$/.exec(value);
  if (current) return { kind: current[1] as PaymentKind, userId: Number(current[2]), ...(current[3] ? { rowId: Number(current[3]) } : {}) };
  const legacy = /^gcsub(-auto)?:(\d+)(?::(\d+))?/.exec(value);
  if (legacy) return { kind: legacy[1] ? 'ASSINATURA-AUTO' : 'ASSINATURA', userId: Number(legacy[2]), ...(legacy[3] ? { rowId: Number(legacy[3]) } : {}) };
  return null;
}

/** Nome na fatura do cartão (statement_descriptor): até 22 letras/números/espaços. */
export const normalizeDescriptor = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 22);
