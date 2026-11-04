import { describe, expect, it } from 'vitest';
import { contentFields, copilotAllowed } from '../shared/content';

describe('quem vê o Copilot', () => {
  const visitor = null, client = { accountType: 'client', role: 'user' }, provider = { accountType: 'provider', role: 'user' }, owner = { accountType: 'client', role: 'admin' };
  it('todos / logados / profissionais / só equipe / desligado', () => {
    expect([visitor, client, provider, owner].map(u => copilotAllowed('all', u))).toEqual([true, true, true, true]);
    expect([visitor, client, provider, owner].map(u => copilotAllowed('logged', u))).toEqual([false, true, true, true]);
    expect([visitor, client, provider, owner].map(u => copilotAllowed('providers', u))).toEqual([false, false, true, true]);
    expect([visitor, client, provider, owner].map(u => copilotAllowed('staff', u))).toEqual([false, false, false, true]);
    expect([visitor, client, provider, owner].map(u => copilotAllowed('off', u))).toEqual([false, false, false, false]);
  });
  it('padrão é "todos" e o campo aparece no painel com as opções', () => {
    expect(copilotAllowed(undefined, null)).toBe(true);
    const field = contentFields.find(f => f.key === 'copilot.visibility')!;
    expect(field.type).toBe('select');
    expect(field.options?.map(([v]) => v)).toEqual(['all', 'logged', 'providers', 'staff', 'off']);
  });
});
