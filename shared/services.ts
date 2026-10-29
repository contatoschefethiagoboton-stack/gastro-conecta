// Categoria única "Profissional": todos os prestadores de serviço da plataforma.
export type ServiceGroup = 'Gastronomia' | 'Bar & salão' | 'Limpeza' | 'Jardinagem';

export type ServiceType = {
  id: string;
  label: string;
  group: ServiceGroup;
  /** Tipo de calculadora do Copilot usado nos pedidos deste serviço. */
  calculator: 'event' | 'mealPrep' | 'cleaning' | 'gardening';
};

export const SERVICE_TYPES: ServiceType[] = [
  { id: 'chef-executivo', label: 'Chef executivo', group: 'Gastronomia', calculator: 'event' },
  { id: 'personal-chef', label: 'Personal chef (marmitas semanais / fit)', group: 'Gastronomia', calculator: 'mealPrep' },
  { id: 'buffet', label: 'Buffet', group: 'Gastronomia', calculator: 'event' },
  { id: 'cozinheiro', label: 'Cozinheiro(a)', group: 'Gastronomia', calculator: 'event' },
  { id: 'auxiliar-cozinha', label: 'Auxiliar de cozinha', group: 'Gastronomia', calculator: 'event' },
  { id: 'barman', label: 'Barman', group: 'Bar & salão', calculator: 'event' },
  { id: 'garcom', label: 'Garçom / garçonete', group: 'Bar & salão', calculator: 'event' },
  { id: 'limpeza-residencial', label: 'Limpeza residencial', group: 'Limpeza', calculator: 'cleaning' },
  { id: 'limpeza-pesada', label: 'Limpeza pesada', group: 'Limpeza', calculator: 'cleaning' },
  { id: 'limpeza-restaurante', label: 'Limpeza de restaurante', group: 'Limpeza', calculator: 'cleaning' },
  { id: 'limpeza-pos-evento', label: 'Limpeza pós-evento', group: 'Limpeza', calculator: 'cleaning' },
  { id: 'jardinagem', label: 'Jardinagem / paisagismo', group: 'Jardinagem', calculator: 'gardening' },
];

export const SERVICE_IDS = SERVICE_TYPES.map(s => s.id) as [string, ...string[]];
export const SERVICE_GROUPS: ServiceGroup[] = ['Gastronomia', 'Bar & salão', 'Limpeza', 'Jardinagem'];
export const serviceById = (id: string | null | undefined) => SERVICE_TYPES.find(s => s.id === id);
export const serviceLabel = (id: string | null | undefined) => serviceById(id)?.label ?? 'Serviço';

/** Categoria do pedido do cliente (o que ele quer contratar). */
export type RequestCategory = 'event' | 'mealPrep' | 'cleaning' | 'gardening';
export const REQUEST_CATEGORIES: Array<{ id: RequestCategory; label: string }> = [
  { id: 'event', label: 'Evento / gastronomia' },
  { id: 'mealPrep', label: 'Personal chef — marmitas' },
  { id: 'cleaning', label: 'Limpeza' },
  { id: 'gardening', label: 'Jardinagem / paisagismo' },
];
export const MEAL_PLANS = ['Semanal', 'Fitness', 'Low-carb', 'Congelados personalizados'] as const;
export const CLEANING_KINDS = ['Residencial', 'Limpeza pesada', 'Restaurante', 'Pós-evento'] as const;
export const GARDEN_KINDS = ['Manutenção', 'Paisagismo'] as const;

/** Escopo do contrato: só mão de obra ou serviço completo (louças, utensílios e ingredientes). */
export type ContractScope = 'labor' | 'full';
export const SCOPE_LABELS: Record<ContractScope, string> = {
  labor: 'Somente serviço / mão de obra',
  full: 'Serviço completo (inclui louças, pratos, talheres, copos, utensílios de cozinha e ingredientes)',
};

/** O profissional atende a categoria do pedido? (radar só mostra pedidos compatíveis). */
export function serviceMatchesRequest(services: string[], category: RequestCategory): boolean {
  if (!services.length) return true;
  return services.some(id => {
    const s = serviceById(id);
    if (!s) return false;
    if (category === 'event') return s.calculator === 'event' || s.id === 'personal-chef';
    return s.calculator === category;
  });
}
