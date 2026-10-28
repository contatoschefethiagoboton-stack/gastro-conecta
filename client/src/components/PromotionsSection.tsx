import { Link } from 'wouter';
import { ArrowRight, MessageCircle, Sparkles } from 'lucide-react';
import { activePromotions } from '@shared/promotions';
import { whatsappLink } from '@shared/business';

export default function PromotionsSection() {
  const list = activePromotions();
  if (list.length === 0) return null;
  return <section id="promocoes" className="section wrap promo-section" aria-label="Campanhas da temporada">
    <div className="section-heading"><div><span className="eyebrow"><Sparkles size={13}/> DA TEMPORADA</span><h2>Datas que pedem uma boa mesa.</h2></div><p>Agenda limitada nas datas mais procuradas.</p></div>
    <div className="promo-grid">{list.map(p => <article key={p.id} className="promo-card">
      <span className="promo-badge">{p.badge}</span>
      <h3>{p.title}</h3>
      <p>{p.text}</p>
      <div className="promo-actions">
        <a className="btn btn-primary btn-small" href={whatsappLink(p.whatsappMessage)} target="_blank" rel="noopener noreferrer"><MessageCircle size={15}/> {p.cta}</a>
        <Link className="text-link" href={p.eventType ? `/orcamento?ocasiao=${encodeURIComponent(p.eventType)}` : '/orcamento'}>Pedir pelo site <ArrowRight size={15}/></Link>
      </div>
    </article>)}</div>
  </section>;
}
