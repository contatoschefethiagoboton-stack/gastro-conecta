import { describe, expect, it } from 'vitest';
import { blindIndex, decrypt, encrypt } from '../src/lib/crypto.js';
import { ageFromBirthDate, isValidCpf, roundCoord } from '../src/lib/validators.js';
import { applyDiscount } from '../src/modules/payments/service.js';
import { buildAccessToken, verifyAccessToken } from '../src/modules/ppv/service.js';
import { buildSearchQuery, searchSchema } from '../src/modules/search/routes.js';

describe('criptografia de PII', () => {
  it('cifra e decifra com AAD do usuário', () => {
    const blob = encrypt('123.456.789-09', 'user-a');
    expect(blob.toString('utf8')).not.toContain('123');
    expect(decrypt(blob, 'user-a')).toBe('123.456.789-09');
  });
  it('falha se o blob for movido para outro usuário', () => {
    expect(() => decrypt(encrypt('segredo', 'user-a'), 'user-b')).toThrow();
  });
  it('blind index é determinístico e separado por contexto', () => {
    expect(blindIndex('52998224725', 'cpf').equals(blindIndex('52998224725', 'cpf'))).toBe(true);
    expect(blindIndex('52998224725', 'cpf').equals(blindIndex('52998224725', 'phone'))).toBe(false);
  });
});

describe('validadores', () => {
  it('CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('529.982.247-26')).toBe(false);
  });
  it('idade', () => {
    const today = new Date('2026-11-01T12:00:00Z');
    expect(ageFromBirthDate('2008-11-01', today)).toBe(18);
    expect(ageFromBirthDate('2008-11-02', today)).toBe(17);
  });
  it('arredonda coordenadas para proteger o endereço', () => {
    expect(roundCoord(-23.561684)).toBe(-23.56);
  });
});

describe('pagamentos', () => {
  it('aplica desconto percentual e fixo', () => {
    expect(applyDiscount(14990, { percent_off: 10, amount_off_cents: null })).toBe(13491);
    expect(applyDiscount(14990, { percent_off: null, amount_off_cents: 20000 })).toBe(0);
  });
});

describe('PPV', () => {
  it('token de acesso é verificável e não falsificável', () => {
    const id = '7d0c2c4e-0c39-4d1e-9f53-1b6a2b4f9a10';
    const token = buildAccessToken(id);
    expect(verifyAccessToken(token)).toBe(id);
    expect(verifyAccessToken(token.slice(0, -2) + 'xx')).toBeNull();
    expect(verifyAccessToken('7d0c2c4e-0c39-4d1e-9f53-1b6a2b4f9a11.' + token.split('.')[1])).toBeNull();
  });
});

describe('busca', () => {
  it('monta consulta geográfica parametrizada com filtros', () => {
    const s = searchSchema.parse({ lat: '-23.55', lng: '-46.63', radiusKm: '15', category: 'massagem', massageTypes: 'tantrica,relaxante', services: ['depilacao'] });
    const { sql, params, geo } = buildSearchQuery(s);
    expect(geo).toBe(true);
    expect(sql).toContain('ST_DWithin');
    expect(sql).toContain('a.massage_types && ');
    expect(sql).toContain('a.services @> ');
    expect(params).toContain(15000);
    expect(sql).not.toContain('tantrica'); // nenhum valor interpolado no SQL
  });
  it('rejeita valores fora da taxonomia', () => {
    expect(() => searchSchema.parse({ services: 'qualquer_coisa' })).toThrow();
  });
});
