// Lista de compras que o profissional entrega ao cliente quando o serviço é só
// mão de obra: itens e quantidades, sem preços. Vai junto da proposta e o
// cliente baixa em PDF no painel.

export type ShoppingItem = { name: string; quantity: number; unit: string };
export type ShoppingList = { items: ShoppingItem[]; note?: string };

export const SHOPPING_UNITS = ['kg', 'g', 'L', 'ml', 'un', 'pct', 'cx', 'dz'] as const;

/** Aviso exibido ao cliente no painel e impresso no PDF. */
export const SHOPPING_LIST_NOTICE =
  'Atenção: esta é uma lista estimada pelo profissional para ajudar nas suas compras. As quantidades são sugestões e podem variar conforme o cardápio final, as marcas escolhidas e o consumo dos convidados. ' +
  'Os itens desta lista NÃO estão incluídos no valor da proposta: o serviço contratado é somente de mão de obra, e a compra dos ingredientes e insumos é de responsabilidade do cliente. Em caso de dúvida, confirme com o profissional antes de comprar.';

/** Confere e limpa a lista recebida (nomes vazios e quantidades inválidas saem). Nunca lança. */
export function normalizeShoppingList(raw: unknown): ShoppingList | null {
  const source = raw && typeof raw === 'object' ? (raw as { items?: unknown; note?: unknown }) : null;
  if (!source || !Array.isArray(source.items)) return null;
  const items = source.items.slice(0, 200).flatMap((it: any) => {
    const name = String(it?.name ?? '').trim().slice(0, 120);
    const quantity = Math.round(Number(it?.quantity) * 100) / 100;
    const unit = String(it?.unit ?? 'un').trim().slice(0, 12) || 'un';
    return name.length >= 2 && Number.isFinite(quantity) && quantity > 0 && quantity < 1_000_000 ? [{ name, quantity, unit }] : [];
  });
  if (!items.length) return null;
  const note = typeof source.note === 'string' ? source.note.trim().slice(0, 1000) : '';
  return { items, ...(note ? { note } : {}) };
}

export const formatQuantity = (q: number) => q.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Preço da lista de compras (em centavos) a partir do texto do painel ("50", "49,90"). */
export function shoppingListPriceCents(text: string | undefined): number {
  const raw = String(text ?? '').trim();
  if (!raw) return 5000;
  const n = Number(raw.replace(/[^\d,.]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 100), 100_000) : 5000;
}
