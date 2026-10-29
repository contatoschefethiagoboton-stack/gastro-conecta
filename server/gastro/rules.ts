// Sem comissões: o profissional recebe 100% do valor negociado e paga apenas a assinatura mensal.
export const SUBSCRIPTION_PRICE_CENTS = Math.max(100, Number(process.env.GC_SUBSCRIPTION_PRICE_CENTS ?? 4990));

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

/** "Top Rated": média mínima de 4,5 com pelo menos 3 avaliações. */
export function isTopRated(average: number, count: number): boolean {
  return count >= 3 && average >= 4.5;
}

export function isoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}
