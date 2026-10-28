export const EVENT_COMMISSION_PCT = Math.min(12, Math.max(8, Number(process.env.GC_EVENT_COMMISSION_PCT ?? 10)));
export const DAILY_CLIENT_FEE_PCT = 10;

export const DAILY_MINIMUMS_CENTS = {
  Cozinheiro: Number(process.env.GC_MIN_DAILY_COZINHEIRO_CENTS ?? 15000),
  Ajudante: Number(process.env.GC_MIN_DAILY_AJUDANTE_CENTS ?? 12000),
  Garçom: Number(process.env.GC_MIN_DAILY_GARCOM_CENTS ?? 12000),
  Barman: Number(process.env.GC_MIN_DAILY_BARMAN_CENTS ?? 15000),
} as const;

export type EventIntentInput = {
  stage: "ready" | "comparing" | "research";
  date?: string | Date | null;
  city?: string | null;
  location?: string | null;
  guests?: number | null;
  budgetCents?: number | null;
};

export function calculateIntentScore(input: EventIntentInput): number {
  const complete = [Boolean(input.date), Boolean(input.city?.trim()), Boolean(input.location?.trim()), Number(input.guests) > 0, Number(input.budgetCents) > 0].filter(Boolean).length;
  const requiredComplete = [Boolean(input.date), Boolean(input.city?.trim()), Number(input.guests) > 0, Number(input.budgetCents) > 0].filter(Boolean).length;
  if (input.stage === "ready") return requiredComplete === 4 ? Math.min(100, 80 + (Boolean(input.location?.trim()) ? 20 : 0)) : Math.min(79, 50 + complete * 7);
  if (input.stage === "comparing") return Math.min(79, 50 + complete * 5);
  return Math.min(49, complete * 9);
}

export function feeForDaily(dailyCents: number): number {
  return Math.round(dailyCents * DAILY_CLIENT_FEE_PCT / 100);
}

export function eventFeeForGross(grossCents: number, percentage = EVENT_COMMISSION_PCT): number {
  return Math.round(grossCents * percentage / 100);
}

export function netAfterFee(grossCents: number, feeCents: number): number {
  return grossCents - feeCents;
}

export function isoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}
