import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MessageCircle, Sparkles } from 'lucide-react';
import type { Promotion } from '@shared/promotions';
import { api } from '@/lib/api';
import { useSite } from '@/lib/site';

export default function PromotionsSection() {
  const site = useSite();
  const query = useQuery({ queryKey: ['gastro-promotions'], queryFn: () => api<{ promotions: Promotion[] }>('/promotions'), retry: 1, staleTime: 60_000 });
  const list = query.data?.promotions ?? [];
  if (list.length === 0) return null;
  return <section id="promocoes" className="section wrap promo-section" aria-label="Campanhas da temporada">
    <div className="section-heading"><div><span className="eyebrow"><Sparkles size={13}/> DA TEMPORADA</span><h2>{site.c('home.promoTitle')}</h2></div><p>{site.c('home.promoText')}</p></div>
    <div className="promo-grid">{list.map(p => <article key={p.id} className={`promo-card ${p.imageUrl ? 'has-image' : ''}`}>
      {p.imageUrl && <img className="promo-image" src={p.imageUrl} alt="" loading="lazy"/>}
      <div className="promo-body">
        <span className="promo-badge">{p.badge}</span>
        <h3>{p.title}</h3>
        <p>{p.text}</p>
        <div className="promo-actions">
          <a className="btn btn-primary btn-small" href={site.wa(p.whatsappMessage)} target="_blank" rel="noopener noreferrer"><MessageCircle size={15}/> {p.cta}</a>
          <Link className="text-link" href={p.eventType ? `/orcamento?ocasiao=${encodeURIComponent(p.eventType)}` : '/orcamento'}>Pedir pelo site <ArrowRight size={15}/></Link>
        </div>
      </div>
    </article>)}</div>
  </section>;
}
