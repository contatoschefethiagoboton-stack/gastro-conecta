// Copilot do profissional: estimativas de ingredientes, brigada, limpeza,
// jardinagem, marmitas e lucro. São sugestões por regras de mercado; o
// profissional pode editar qualquer quantidade ou valor antes de enviar.

export type EstimateItem = { key: string; name: string; quantity: number; unit: string; unitCostCents: number };
export type StaffItem = { role: string; count: number; dailyCents: number };

export const EVENT_STYLES = ['Jantar servido', 'Churrasco', 'Buffet / almoço', 'Coquetel / finger food', 'Café da manhã / brunch'] as const;
export type EventStyle = typeof EVENT_STYLES[number];

/** Estilo de serviço sugerido a partir do tipo de evento informado pelo cliente. */
export function styleForEventType(type: string): EventStyle {
  const t = type.toLowerCase();
  if (/churras|brasa/.test(t)) return 'Churrasco';
  if (/coquetel|finger|happy|confraterniza/.test(t)) return 'Coquetel / finger food';
  if (/caf[eé]|brunch/.test(t)) return 'Café da manhã / brunch';
  if (/casamento|anivers|corporativ|almo/.test(t)) return 'Buffet / almoço';
  return 'Jantar servido';
}

// Gramas (ou ml) por convidado adulto e custo de referência por kg/litro/unidade, em centavos.
type Row = { key: string; name: string; perGuest: number; unit: 'kg' | 'L' | 'un'; costPerUnitCents: number };
const MENUS: Record<EventStyle, Row[]> = {
  'Jantar servido': [
    { key: 'protein', name: 'Proteína principal (carne, frango ou peixe)', perGuest: 0.25, unit: 'kg', costPerUnitCents: 5500 },
    { key: 'rice', name: 'Arroz (cru)', perGuest: 0.07, unit: 'kg', costPerUnitCents: 700 },
    { key: 'side', name: 'Guarnição (legumes, purê, massas)', perGuest: 0.15, unit: 'kg', costPerUnitCents: 1200 },
    { key: 'salad', name: 'Saladas e folhas', perGuest: 0.08, unit: 'kg', costPerUnitCents: 1500 },
    { key: 'dessert', name: 'Sobremesa', perGuest: 0.1, unit: 'kg', costPerUnitCents: 4000 },
    { key: 'drinks', name: 'Bebidas não alcoólicas', perGuest: 0.8, unit: 'L', costPerUnitCents: 600 },
    { key: 'water', name: 'Água', perGuest: 0.5, unit: 'L', costPerUnitCents: 300 },
  ],
  Churrasco: [
    { key: 'meat', name: 'Carnes (bovina, suína, linguiça, frango)', perGuest: 0.4, unit: 'kg', costPerUnitCents: 4800 },
    { key: 'rice', name: 'Arroz (cru)', perGuest: 0.06, unit: 'kg', costPerUnitCents: 700 },
    { key: 'beans', name: 'Feijão tropeiro / feijão (cru)', perGuest: 0.05, unit: 'kg', costPerUnitCents: 900 },
    { key: 'farofa', name: 'Farofa e vinagrete', perGuest: 0.08, unit: 'kg', costPerUnitCents: 1400 },
    { key: 'bread', name: 'Pão de alho / pão', perGuest: 1.5, unit: 'un', costPerUnitCents: 180 },
    { key: 'charcoal', name: 'Carvão', perGuest: 0.5, unit: 'kg', costPerUnitCents: 900 },
    { key: 'drinks', name: 'Refrigerantes e sucos', perGuest: 1, unit: 'L', costPerUnitCents: 600 },
    { key: 'beer', name: 'Cerveja (se houver bebida alcoólica)', perGuest: 1.5, unit: 'L', costPerUnitCents: 1100 },
    { key: 'water', name: 'Água', perGuest: 0.5, unit: 'L', costPerUnitCents: 300 },
  ],
  'Buffet / almoço': [
    { key: 'protein', name: 'Proteínas (2 opções)', perGuest: 0.3, unit: 'kg', costPerUnitCents: 4500 },
    { key: 'rice', name: 'Arroz (cru)', perGuest: 0.08, unit: 'kg', costPerUnitCents: 700 },
    { key: 'beans', name: 'Feijão (cru)', perGuest: 0.05, unit: 'kg', costPerUnitCents: 900 },
    { key: 'side', name: 'Guarnições', perGuest: 0.2, unit: 'kg', costPerUnitCents: 1200 },
    { key: 'salad', name: 'Saladas', perGuest: 0.1, unit: 'kg', costPerUnitCents: 1500 },
    { key: 'dessert', name: 'Sobremesas', perGuest: 0.12, unit: 'kg', costPerUnitCents: 3500 },
    { key: 'drinks', name: 'Bebidas não alcoólicas', perGuest: 0.8, unit: 'L', costPerUnitCents: 600 },
    { key: 'water', name: 'Água', perGuest: 0.5, unit: 'L', costPerUnitCents: 300 },
  ],
  'Coquetel / finger food': [
    { key: 'savory', name: 'Salgados e canapés', perGuest: 15, unit: 'un', costPerUnitCents: 150 },
    { key: 'sweets', name: 'Docinhos', perGuest: 5, unit: 'un', costPerUnitCents: 120 },
    { key: 'drinks', name: 'Bebidas não alcoólicas', perGuest: 0.7, unit: 'L', costPerUnitCents: 600 },
    { key: 'alcohol', name: 'Drinks / espumante (se houver)', perGuest: 0.5, unit: 'L', costPerUnitCents: 4500 },
    { key: 'water', name: 'Água', perGuest: 0.4, unit: 'L', costPerUnitCents: 300 },
    { key: 'ice', name: 'Gelo', perGuest: 1, unit: 'kg', costPerUnitCents: 400 },
  ],
  'Café da manhã / brunch': [
    { key: 'bread', name: 'Pães variados', perGuest: 3, unit: 'un', costPerUnitCents: 120 },
    { key: 'cold', name: 'Frios e queijos', perGuest: 0.08, unit: 'kg', costPerUnitCents: 6000 },
    { key: 'fruit', name: 'Frutas', perGuest: 0.15, unit: 'kg', costPerUnitCents: 900 },
    { key: 'cake', name: 'Bolos e doces', perGuest: 0.1, unit: 'kg', costPerUnitCents: 3500 },
    { key: 'coffee', name: 'Café, leite e chás', perGuest: 0.4, unit: 'L', costPerUnitCents: 1200 },
    { key: 'juice', name: 'Sucos naturais', perGuest: 0.4, unit: 'L', costPerUnitCents: 1200 },
  ],
};

const round = (value: number, unit: string) => unit === 'un' ? Math.ceil(value) : Math.round(value * 10) / 10;

/** Ingredientes e porções sugeridos para um evento. */
export function estimateIngredients(guests: number, style: EventStyle, withAlcohol = true): EstimateItem[] {
  const n = Math.max(1, Math.floor(guests || 0));
  return MENUS[style]
    .filter(row => withAlcohol || !['beer', 'alcohol'].includes(row.key))
    .map(row => ({ key: row.key, name: row.name, quantity: round(row.perGuest * n, row.unit), unit: row.unit, unitCostCents: row.costPerUnitCents }));
}

export const DEFAULT_DAILY_CENTS: Record<string, number> = {
  'Chef executivo': 60000,
  'Cozinheiro(a)': 25000,
  'Auxiliar de cozinha': 15000,
  'Garçom / garçonete': 15000,
  Barman: 22000,
  Churrasqueiro: 25000,
};

/** Brigada recomendada a partir de convidados e estilo do evento. */
export function estimateBrigade(guests: number, style: EventStyle, withBar = true): StaffItem[] {
  const n = Math.max(1, Math.floor(guests || 0));
  const seated = style === 'Jantar servido';
  const items: StaffItem[] = [];
  const push = (role: string, count: number) => { if (count > 0) items.push({ role, count, dailyCents: DEFAULT_DAILY_CENTS[role] ?? 15000 }); };
  push('Chef executivo', 1);
  if (style === 'Churrasco') push('Churrasqueiro', Math.ceil(n / 50));
  push('Cozinheiro(a)', n <= 15 ? 0 : Math.ceil(n / 40));
  push('Auxiliar de cozinha', Math.ceil(n / 25));
  push('Garçom / garçonete', Math.ceil(n / (seated ? 12 : 25)));
  if (withBar && n >= 20) push('Barman', Math.ceil(n / 60));
  return items;
}

export const CLEANING_RATES = {
  Residencial: { m2PerHour: 30, hourlyCents: 3500 },
  'Limpeza pesada': { m2PerHour: 15, hourlyCents: 4500 },
  Restaurante: { m2PerHour: 20, hourlyCents: 4500 },
  'Pós-evento': { m2PerHour: 25, hourlyCents: 4000 },
} as const;
export const GARDEN_RATES = {
  Manutenção: { m2PerHour: 50, hourlyCents: 4000 },
  Paisagismo: { m2PerHour: 15, hourlyCents: 7000 },
} as const;

export type ServiceEstimate = { hours: number; people: number; hourlyCents: number; dailyCents: number; billing: 'hora' | 'diária'; totalCents: number };

/** Horas, equipe e valor sugeridos para limpeza ou jardinagem pelo tamanho do imóvel. */
export function estimateAreaService(areaM2: number, rate: { m2PerHour: number; hourlyCents: number }): ServiceEstimate {
  const area = Math.max(1, areaM2 || 0);
  const totalHours = area / rate.m2PerHour;
  const people = totalHours > 8 ? Math.ceil(totalHours / 8) : 1;
  const hours = Math.max(2, Math.ceil((totalHours / people) * 2) / 2);
  const dailyCents = rate.hourlyCents * 8 - Math.round(rate.hourlyCents * 8 * 0.1); // diária com 10% de desconto sobre 8h
  const billing = hours >= 6 ? 'diária' : 'hora';
  const totalCents = billing === 'diária' ? dailyCents * people * Math.ceil(hours / 8) : Math.round(rate.hourlyCents * hours * people);
  return { hours, people, hourlyCents: rate.hourlyCents, dailyCents, billing, totalCents };
}

export type MealPrepInput = {
  meals: number;                // total de refeições do pacote
  ingredientCostPerMealCents: number;
  packagingPerMealCents: number;
  distanceKm: number;           // ida e volta somadas por viagem
  trips: number;
  costPerKmCents: number;
  laborHours: number;
  hourlyCents: number;
  marginPercent: number;
  mealsPerKit: number;
};
export type MealPrepResult = { ingredientsCents: number; packagingCents: number; transportCents: number; laborCents: number; costCents: number; priceCents: number; perMealCents: number; perKitCents: number; kits: number };

export const MEAL_PREP_DEFAULTS: MealPrepInput = { meals: 10, ingredientCostPerMealCents: 1200, packagingPerMealCents: 250, distanceKm: 20, trips: 1, costPerKmCents: 120, laborHours: 4, hourlyCents: 5000, marginPercent: 20, mealsPerKit: 5 };

/** Custo do personal chef: ingredientes + embalagem + deslocamento + mão de obra, com margem. */
export function calculateMealPrep(input: MealPrepInput): MealPrepResult {
  const meals = Math.max(1, Math.floor(input.meals || 0));
  const ingredientsCents = Math.round(meals * Math.max(0, input.ingredientCostPerMealCents));
  const packagingCents = Math.round(meals * Math.max(0, input.packagingPerMealCents));
  const transportCents = Math.round(Math.max(0, input.distanceKm) * Math.max(0, input.trips) * Math.max(0, input.costPerKmCents));
  const laborCents = Math.round(Math.max(0, input.laborHours) * Math.max(0, input.hourlyCents));
  const costCents = ingredientsCents + packagingCents + transportCents + laborCents;
  const priceCents = Math.round(costCents * (1 + Math.max(0, input.marginPercent) / 100));
  const perMealCents = Math.round(priceCents / meals);
  const mealsPerKit = Math.max(1, Math.floor(input.mealsPerKit || 1));
  return { ingredientsCents, packagingCents, transportCents, laborCents, costCents, priceCents, perMealCents, perKitCents: perMealCents * mealsPerKit, kits: Math.ceil(meals / mealsPerKit) };
}

export const itemsTotalCents = (items: EstimateItem[]) => items.reduce((sum, i) => sum + Math.round(i.quantity * i.unitCostCents), 0);
export const staffTotalCents = (items: StaffItem[]) => items.reduce((sum, i) => sum + i.count * i.dailyCents, 0);

/** Lucro líquido da proposta e alerta de prejuízo. */
export function profitability(priceCents: number, costCents: number) {
  const profitCents = priceCents - costCents;
  const marginPercent = priceCents > 0 ? Math.round((profitCents / priceCents) * 1000) / 10 : 0;
  return { profitCents, marginPercent, loss: profitCents < 0, lowMargin: profitCents >= 0 && marginPercent < 15 };
}

/** Taxa de conversão: propostas fechadas / propostas enviadas. */
export function conversionRate(submitted: number, won: number): number {
  return submitted > 0 ? Math.round((won / submitted) * 1000) / 10 : 0;
}
