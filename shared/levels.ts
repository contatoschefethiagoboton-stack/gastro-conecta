// Níveis do profissional na plataforma, calculados pelas avaliações reais dos clientes.
// As regras (média e quantidade mínimas) e os textos de cada nível são editáveis no painel
// (Textos do site → Níveis e promoções). O admin também pode fixar o nível de alguém.

export type ProviderLevel = 'baixo' | 'medio' | 'alto';
export const LEVELS: ProviderLevel[] = ['baixo', 'medio', 'alto'];
export const LEVEL_LABELS: Record<ProviderLevel, string> = { baixo: 'BAIXO', medio: 'MÉDIO', alto: 'ALTO' };

export type LevelRules = { altoMinAverage: number; altoMinReviews: number; medioMinAverage: number; medioMinReviews: number };
export const LEVEL_RULE_DEFAULTS: LevelRules = { altoMinAverage: 4.5, altoMinReviews: 5, medioMinAverage: 4, medioMinReviews: 2 };

const num = (value: string | undefined, fallback: number) => {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Regras atuais a partir do conteúdo do site. */
export function levelRulesFrom(content: Record<string, string | undefined> | undefined): LevelRules {
  return {
    altoMinAverage: num(content?.['level.altoMinAverage'], LEVEL_RULE_DEFAULTS.altoMinAverage),
    altoMinReviews: Math.round(num(content?.['level.altoMinReviews'], LEVEL_RULE_DEFAULTS.altoMinReviews)),
    medioMinAverage: num(content?.['level.medioMinAverage'], LEVEL_RULE_DEFAULTS.medioMinAverage),
    medioMinReviews: Math.round(num(content?.['level.medioMinReviews'], LEVEL_RULE_DEFAULTS.medioMinReviews)),
  };
}

/** Nível pela média e quantidade de avaliações. */
export function levelFromRatings(average: number, count: number, rules: LevelRules = LEVEL_RULE_DEFAULTS): ProviderLevel {
  if (count >= rules.altoMinReviews && average >= rules.altoMinAverage) return 'alto';
  if (count >= rules.medioMinReviews && average >= rules.medioMinAverage) return 'medio';
  return 'baixo';
}

export const isLevel = (value: unknown): value is ProviderLevel => typeof value === 'string' && (LEVELS as string[]).includes(value);

/** O que falta para o próximo nível (texto curto para o painel do profissional). */
export function nextLevelHint(level: ProviderLevel, average: number, count: number, rules: LevelRules = LEVEL_RULE_DEFAULTS): string {
  if (level === 'alto') return '';
  const target = level === 'baixo' ? { name: 'MÉDIO', avg: rules.medioMinAverage, reviews: rules.medioMinReviews } : { name: 'ALTO', avg: rules.altoMinAverage, reviews: rules.altoMinReviews };
  const parts: string[] = [];
  if (count < target.reviews) parts.push(`${target.reviews - count} avaliação(ões) a mais`);
  if (average < target.avg) parts.push(`média ${target.avg.toLocaleString('pt-BR')} ou mais (hoje ${average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })})`);
  return parts.length ? `Para chegar ao nível ${target.name}: ${parts.join(' e ')}.` : `Você já cumpre as regras do nível ${target.name}; ele aparece assim que o sistema atualizar.`;
}
