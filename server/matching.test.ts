import { describe, expect, it } from 'vitest';
import { rankCandidates, scoreCandidate, type MatchCandidate } from '../shared/matching';
import { DEFAULT_SERVICE_CATALOG } from '../shared/services';

const base: Omit<MatchCandidate, 'userId' | 'city' | 'services'> = { ratingAverage: 0, ratingCount: 0, topRated: false, featured: false, busyOnDate: false, recentProposals: 0 };
const region = ['Campinas', 'Valinhos', 'Sumaré'];
const event = { category: 'event' as const, city: 'Campinas, SP', date: '2026-12-12', target: { serviceCategoryId: 'Bar & salão', serviceId: 'garcom' } };

describe('matching de pedidos', () => {
  it('ordem: mesma cidade > região > fora; profissão exata pesa mais', () => {
    const list = rankCandidates(event, [
      { ...base, userId: 1, city: 'São Paulo, SP', services: ['garcom'] },
      { ...base, userId: 2, city: 'Valinhos, SP', services: ['garcom'] },
      { ...base, userId: 3, city: 'Campinas', services: ['garcom'] },
      { ...base, userId: 4, city: 'Campinas', services: ['barman'] },
    ], DEFAULT_SERVICE_CATALOG, region);
    expect(list.map(r => r.userId)).toEqual([3, 2, 1]);
    expect(list[0].reasons).toEqual(expect.arrayContaining(['profissão exata', 'mesma cidade']));
  });
  it('quem já tem evento fechado na data fica de fora', () => {
    expect(scoreCandidate(event, { ...base, userId: 5, city: 'Campinas', services: ['garcom'], busyOnDate: true }, DEFAULT_SERVICE_CATALOG, region)).toBeNull();
  });
  it('reputação e agilidade desempatam', () => {
    const list = rankCandidates(event, [
      { ...base, userId: 6, city: 'Campinas', services: ['garcom'] },
      { ...base, userId: 7, city: 'Campinas', services: ['garcom'], ratingAverage: 4.8, ratingCount: 6, topRated: true, recentProposals: 4 },
    ], DEFAULT_SERVICE_CATALOG, region);
    expect(list[0].userId).toBe(7);
    expect(list[0].score - list[1].score).toBe(19 + 10 + 4);
  });
  it('pedido genérico de evento aceita qualquer profissional de eventos', () => {
    const generic = { category: 'event' as const, city: 'Valinhos', target: {} };
    expect(rankCandidates(generic, [{ ...base, userId: 8, city: 'Valinhos', services: ['chef-executivo'] }, { ...base, userId: 9, city: 'Valinhos', services: ['jardinagem'] }], DEFAULT_SERVICE_CATALOG, region).map(r => r.userId)).toEqual([8]);
  });
});
