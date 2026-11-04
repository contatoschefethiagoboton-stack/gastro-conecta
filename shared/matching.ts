// Matching de pedidos com profissionais: quem recebe o aviso primeiro.
// Regra pura (sem banco) para ser testável; o servidor só junta os dados.
import { findCategory, findService, serviceMatchesRequest, type RequestCategory, type RequestTarget, type ServiceCategory } from './services';
import { normalizeCityName } from './seo';

export type MatchEvent = { category: RequestCategory; city: string; date?: string | null; target: RequestTarget };
export type MatchCandidate = {
  userId: number;
  city: string;
  services: string[];
  ratingAverage: number;
  ratingCount: number;
  topRated: boolean;
  featured: boolean;
  /** Já tem serviço fechado nesta data. */
  busyOnDate: boolean;
  /** Propostas enviadas nos últimos 30 dias (mostra que responde rápido). */
  recentProposals: number;
};
export type MatchResult = { userId: number; score: number; reasons: string[] };

/** Pontuação de 0 a 100+ (null = não atende este pedido). */
export function scoreCandidate(event: MatchEvent, c: MatchCandidate, catalog: ServiceCategory[], regionCities: string[]): MatchResult | null {
  if (c.busyOnDate) return null;
  if (!serviceMatchesRequest(c.services, event.category, catalog, event.target)) return null;
  const reasons: string[] = [];
  let score = 0;
  if (event.target.serviceId && findService(catalog, event.target.serviceId) && c.services.includes(event.target.serviceId)) { score += 40; reasons.push('profissão exata'); }
  else if (event.target.serviceCategoryId && findCategory(catalog, event.target.serviceCategoryId)) { score += 30; reasons.push('mesma categoria'); }
  else { score += 20; reasons.push('serviço compatível'); }
  const eventCity = normalizeCityName(event.city);
  const myCity = normalizeCityName(c.city);
  const region = new Set(regionCities.map(normalizeCityName));
  if (eventCity && myCity === eventCity) { score += 35; reasons.push('mesma cidade'); }
  else if (eventCity && region.has(eventCity) && region.has(myCity)) { score += 15; reasons.push('mesma região'); }
  if (c.ratingCount > 0) { score += Math.round(Math.min(5, Math.max(0, c.ratingAverage)) * 4); reasons.push(`nota ${c.ratingAverage.toFixed(1)}`); }
  if (c.topRated) { score += 10; reasons.push('Top Rated'); }
  if (c.featured) { score += 5; reasons.push('destaque'); }
  if (c.recentProposals > 0) { score += Math.min(10, c.recentProposals); reasons.push('responde rápido'); }
  return { userId: c.userId, score, reasons };
}

/** Lista ordenada (melhor primeiro); empate: quem está na mesma cidade e tem mais avaliações. */
export function rankCandidates(event: MatchEvent, candidates: MatchCandidate[], catalog: ServiceCategory[], regionCities: string[]): MatchResult[] {
  const byId = new Map(candidates.map(c => [c.userId, c]));
  return candidates
    .map(c => scoreCandidate(event, c, catalog, regionCities))
    .filter((r): r is MatchResult => r !== null)
    .sort((a, b) => b.score - a.score || (byId.get(b.userId)!.ratingCount - byId.get(a.userId)!.ratingCount) || a.userId - b.userId);
}
