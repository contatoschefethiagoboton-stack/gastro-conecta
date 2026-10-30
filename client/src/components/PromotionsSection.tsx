import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, ChefHat, Loader2, MapPin, Sparkles, Star, X } from 'lucide-react';
import type { Promotion } from '@shared/promotions';
import type { Professional } from '@shared/catalog';
import { api } from '@/lib/api';
import { useSite } from '@/lib/site';

const quoteLink = (p: Promotion, professionalId?: string) => {
  const params = new URLSearchParams();
  if (p.eventType) params.set('ocasiao', p.eventType);
  if (professionalId) params.set('profissional', professionalId);
  const qs = params.toString();
  return `/orcamento${qs ? `?${qs}` : ''}`;
};

/** Fornecedores que participam da promoção: o cliente escolhe com quem quer fechar. */
function PromotionProviders({ promotion, onClose }: { promotion: Promotion; onClose: () => void }) {
  const query = useQuery({ queryKey: ['gastro-promo-providers', promotion.id], queryFn: () => api<{ professionals: Professional[] }>(`/promotions/${promotion.id}/providers`), retry: 1 });
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  const list = query.data?.professionals ?? [];
  return <div className="promo-modal" role="dialog" aria-modal="true" aria-labelledby="promo-modal-title">
    <button type="button" className="promo-modal-backdrop" aria-label="Fechar" onClick={onClose}/>
    <div className="promo-modal-panel">
      <header><div><span className="promo-badge">{promotion.badge}</span><h3 id="promo-modal-title">{promotion.title}</h3><p>Escolha o fornecedor com quem você quer fechar o orçamento.</p></div><button type="button" className="promo-modal-close" onClick={onClose} aria-label="Fechar"><X size={20}/></button></header>
      {query.isLoading ? <div className="promo-modal-empty"><Loader2 className="animate-spin" size={22}/></div>
        : !list.length ? <div className="promo-modal-empty"><ChefHat size={36}/><strong>Ainda não há fornecedores confirmados nesta promoção.</strong><span>Envie seu pedido e os profissionais da região mandam propostas para você comparar.</span><Link href={quoteLink(promotion)} className="btn btn-primary btn-small" onClick={onClose}>Pedir orçamento <ArrowRight size={15}/></Link></div>
        : <div className="promo-provider-list">{list.map(p => <article key={p.id} className="promo-provider">
            {p.image ? <img src={p.image} alt="" loading="lazy"/> : <span className="promo-provider-img"><ChefHat size={26}/></span>}
            <div className="promo-provider-info"><strong>{p.name}</strong><span>{p.category}</span><span className="promo-provider-meta"><MapPin size={13}/> {p.city}{p.rating?.count ? <> · <Star size={13} fill="currentColor"/> {p.rating.average.toFixed(1)} ({p.rating.count})</> : null}</span></div>
            <div className="promo-provider-actions"><Link href={quoteLink(promotion, p.id)} className="btn btn-primary btn-small" onClick={onClose}>Quero este <ArrowRight size={15}/></Link><Link href={`/profissionais/${p.id}`} className="text-link" onClick={onClose}>Ver perfil <ArrowUpRight size={14}/></Link></div>
          </article>)}</div>}
    </div>
  </div>;
}

export default function PromotionsSection() {
  const site = useSite();
  const [open, setOpen] = useState<Promotion | null>(null);
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
          <button type="button" className="btn btn-primary btn-small" onClick={() => setOpen(p)}>{p.cta} <ArrowRight size={15}/></button>
        </div>
      </div>
    </article>)}</div>
    {open && <PromotionProviders promotion={open} onClose={() => setOpen(null)}/>}
  </section>;
}
