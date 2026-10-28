import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { api } from '@/lib/api';

type Benefit = { id: number; kind: string; title: string; description: string; amountCents: number; percent: number; expiresAt: string | null };
const kindLabel: Record<string, string> = { bonus: 'Bônus', credit: 'Crédito', discount: 'Desconto', vip: 'VIP', featured: 'Destaque', custom: 'Benefício' };
const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export default function MyBenefits() {
  const query = useQuery({ queryKey: ['gastro-my-benefits'], queryFn: () => api<{ benefits: Benefit[] }>('/benefits'), retry: false });
  const list = query.data?.benefits ?? [];
  if (!list.length) return null;
  return <section className="my-benefits" aria-label="Seus benefícios">
    <header><Gift size={18}/><strong>Seus benefícios</strong></header>
    <div className="my-benefits-list">{list.map(b => <article key={b.id}><span className="my-benefit-kind">{kindLabel[b.kind] ?? 'Benefício'}</span><h4>{b.title}</h4>{(b.amountCents > 0 || b.percent > 0) && <p className="my-benefit-value">{b.amountCents > 0 ? money(b.amountCents) : ''}{b.amountCents > 0 && b.percent > 0 ? ' · ' : ''}{b.percent > 0 ? `${b.percent}%` : ''}</p>}{b.description && <p>{b.description}</p>}{b.expiresAt && <small>Válido até {new Date(`${b.expiresAt}T12:00:00`).toLocaleDateString('pt-BR')}</small>}</article>)}</div>
  </section>;
}
