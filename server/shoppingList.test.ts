import { describe, expect, it } from 'vitest';
import { normalizeShoppingList, SHOPPING_LIST_NOTICE } from '../shared/shoppingList';
import { calculateMealPrep, mealPrepInputFor, platformEstimateCents } from '../shared/copilot';
import { buildPdf } from './gastro/pdf';

describe('lista de compras (só mão de obra)', () => {
  it('limpa itens inválidos e mantém nome, quantidade e unidade', () => {
    expect(normalizeShoppingList({ items: [{ name: 'Arroz', quantity: 5, unit: 'kg', unitCostCents: 999 }, { name: '', quantity: 1 }, { name: 'Sal', quantity: 0 }, { name: 'Óleo', quantity: '2,5' }], note: ' comprar antes ' }))
      .toEqual({ items: [{ name: 'Arroz', quantity: 5, unit: 'kg' }], note: 'comprar antes' });
    expect(normalizeShoppingList({ items: [] })).toBeNull();
    expect(normalizeShoppingList('x')).toBeNull();
  });
  it('o aviso deixa claro que os itens não estão no valor', () => {
    expect(SHOPPING_LIST_NOTICE).toMatch(/NÃO estão incluídos no valor/);
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
