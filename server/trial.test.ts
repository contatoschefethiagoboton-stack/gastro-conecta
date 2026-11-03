import { describe, expect, it } from 'vitest';
import { normalizeTrial, trialEnd, trialLabel } from '../shared/subscription';
import { trialActive } from './gastro/subscriptions';
import { permissionForRequest } from '../shared/staff';

describe('período de teste', () => {
  const start = new Date('2026-01-31T12:00:00Z');
  it('calcula o fim em dias, semanas e meses', () => {
    expect(trialEnd(start, { amount: 7, unit: 'days' }).toISOString().slice(0, 10)).toBe('2026-02-07');
    expect(trialEnd(start, { amount: 2, unit: 'weeks' }).toISOString().slice(0, 10)).toBe('2026-02-14');
    expect(trialEnd(start, { amount: 1, unit: 'months' }).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(trialEnd(start, { amount: 3, unit: 'months' }).toISOString().slice(0, 10)).toBe('2026-04-30');
  });
  it('limita a duração e trata valores inválidos', () => {
    expect(normalizeTrial(999, 'days')).toEqual({ amount: 365, unit: 'days' });
    expect(normalizeTrial(60, 'weeks')).toEqual({ amount: 52, unit: 'weeks' });
    expect(normalizeTrial(20, 'months')).toEqual({ amount: 12, unit: 'months' });
    expect(normalizeTrial('abc', 'anos')).toEqual({ amount: 0, unit: 'days' });
    expect(normalizeTrial(-3, 'days').amount).toBe(0);
  });
  it('texto amigável', () => {
    expect(trialLabel({ amount: 1, unit: 'months' })).toBe('1 mês');
    expect(trialLabel({ amount: 15, unit: 'days' })).toBe('15 dias');
    expect(trialLabel({ amount: 0, unit: 'weeks' })).toBe('sem período de teste');
  });
  it('teste ativo só até a data e enquanto não pagou', () => {
    const now = new Date('2026-02-01T00:00:00Z');
    expect(trialActive({ trialUntil: '2026-02-10', trialGrantedAt: '2026-01-31' }, now)).toBe(true);
    expect(trialActive({ trialUntil: '2026-01-31', trialGrantedAt: '2026-01-20' }, now)).toBe(false);
    expect(trialActive({ trialUntil: '2026-02-10', trialGrantedAt: '2026-01-31', lastPaidAt: '2026-02-01T00:00:00Z' }, new Date('2026-02-02'))).toBe(false);
    expect(trialActive(null, now)).toBe(false);
  });
  it('configurar o teste exige permissão de pagamentos', () => {
    expect(permissionForRequest('PUT', '/admin/payments/trial')).toBe('payments.manage');
    expect(permissionForRequest('POST', '/admin/subscriptions/5/trial')).toBe('subscriptions.manage');
  });
});
