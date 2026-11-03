import { describe, expect, it } from 'vitest';
import { normalizeShoppingList, SHOPPING_LIST_NOTICE, shoppingListFeeLabel } from '../shared/shoppingList';
import { buildContractPayload, contractBlocks } from './gastro/contracts';
import { calculateMealPrep, mealPrepInputFor, platformEstimateCents } from '../shared/copilot';
import { buildPdf } from './gastro/pdf';

describe('lista de compras (só mão de obra)', () => {
  it('limpa itens inválidos e mantém nome, quantidade e unidade', () => {
    expect(normalizeShoppingList({ items: [{ name: 'Arroz', quantity: 5, unit: 'kg', unitCostCents: 999 }, { name: '', quantity: 1 }, { name: 'Sal', quantity: 0 }, { name: 'Óleo', quantity: '2,5' }], note: ' comprar antes ' }))
      .toEqual({ items: [{ name: 'Arroz', quantity: 5, unit: 'kg' }], note: 'comprar antes', feeCents: 0, courtesy: true });
    expect(normalizeShoppingList({ items: [{ name: 'Arroz', quantity: 5, unit: 'kg' }], feeCents: 5000 })).toMatchObject({ feeCents: 5000, courtesy: false });
    expect(normalizeShoppingList({ items: [{ name: 'Arroz', quantity: 5, unit: 'kg' }], feeCents: 5000, courtesy: true })).toMatchObject({ feeCents: 0, courtesy: true });
    expect(normalizeShoppingList({ items: [] })).toBeNull();
    expect(normalizeShoppingList('x')).toBeNull();
  });
  it('o aviso deixa claro que os itens não estão no valor', () => {
    expect(SHOPPING_LIST_NOTICE).toMatch(/NÃO estão incluídos no valor/);
    expect(shoppingListFeeLabel({ feeCents: 5000, courtesy: false })).toMatch(/50,00/);
    expect(shoppingListFeeLabel({ feeCents: 0, courtesy: true })).toMatch(/Cortesia/);
    expect(SHOPPING_LIST_NOTICE).toMatch(/responsabilidade do cliente/);
  });
  it('gera o PDF com o aviso', () => {
    const pdf = buildPdf([{ kind: 'title', text: 'Lista de compras' }, { kind: 'text', text: SHOPPING_LIST_NOTICE }, { kind: 'text', text: '[  ]  Arroz: 5 kg' }]);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('valor sugerido só com mão de obra', () => {
  it('evento: só mão de obra não soma ingredientes', () => {
    const labor = platformEstimateCents({ category: 'event', type: 'Jantar em casa', guests: 40, scope: 'labor' });
    const full = platformEstimateCents({ category: 'event', type: 'Jantar em casa', guests: 40, scope: 'full' });
    expect(full).toBeGreaterThan(labor);
  });
  it('marmitas: só o preparo não soma ingredientes nem embalagens', () => {
    const labor = calculateMealPrep(mealPrepInputFor(20, true));
    expect(labor.ingredientsCents).toBe(0);
    expect(labor.packagingCents).toBe(0);
    expect(labor.laborCents).toBeGreaterThan(0);
    const full = platformEstimateCents({ category: 'mealPrep', type: 'Semanal', guests: 1, mealsPerWeek: 20, weeks: 1, scope: 'full' });
    expect(platformEstimateCents({ category: 'mealPrep', type: 'Semanal', guests: 1, mealsPerWeek: 20, weeks: 1, scope: 'labor' })).toBe(labor.priceCents);
    expect(full).toBeGreaterThan(labor.priceCents);
  });
});

describe('contrato com todos os valores', () => {
  const base = { contractNumber: 'EC-1', acceptedAt: new Date('2026-11-03T12:00:00Z'), acceptedIp: '1.1.1.1', client: { userId: 1, name: 'Carla', email: 'c@c.com', details: {} }, provider: { userId: 2, name: 'Paulo', email: 'p@p.com', details: {} }, event: { id: 9, title: 'Festa', type: 'Aniversário', city: 'Campinas', guests: 40 } };
  const text = (blocks: ReturnType<typeof contractBlocks>) => blocks.map(b => ('text' in b ? b.text : '') + ('label' in b ? `${b.label}: ${'value' in b ? b.value : ''}` : '')).join('\n');
  it('lista cobrada: serviço + lista + total', () => {
    const payload = buildContractPayload({ ...base, proposal: { amountCents: 185000, scope: 'labor', breakdown: JSON.stringify({ shoppingList: { items: [{ name: 'Arroz', quantity: 5, unit: 'kg' }], feeCents: 5000 } }) } });
    expect(payload.values).toEqual({ serviceCents: 180000, shoppingList: { feeCents: 5000, courtesy: false, items: 1 } });
    const t = text(contractBlocks(payload));
    expect(t).toMatch(/Serviço \(mão de obra\): R\$\s?1\.800,00/);
    expect(t).toMatch(/Lista de compras \(1 itens\): R\$\s?50,00/);
    expect(t).toMatch(/Valor total acordado: R\$\s?1\.850,00/);
  });
  it('lista em cortesia aparece como cortesia', () => {
    const payload = buildContractPayload({ ...base, proposal: { amountCents: 180000, scope: 'labor', breakdown: { shoppingList: { items: [{ name: 'Arroz', quantity: 5, unit: 'kg' }], feeCents: 0, courtesy: true } } } });
    expect(text(contractBlocks(payload))).toMatch(/Lista de compras \(1 itens\): Cortesia/);
  });
  it('sem lista: só o serviço', () => {
    expect(buildContractPayload({ ...base, proposal: { amountCents: 90000, scope: 'full' } }).values).toEqual({ serviceCents: 90000 });
  });
});
