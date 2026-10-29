import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowUpRight, Award, Heart, MapPin, ChefHat, Star } from 'lucide-react';
import { money } from '@/lib/api';
import type { Professional } from '@shared/catalog';

export default function ProfessionalCard({ professional: p }: { professional: Professional }) {
  const [saved, setSaved] = useState(() => { try { return JSON.parse(localStorage.getItem('gc-favorites') || '[]').includes(p.id); } catch { return false; } });
  function toggle() { const list: string[] = JSON.parse(localStorage.getItem('gc-favorites') || '[]'); const next = saved ? list.filter(id => id !== p.id) : [...list, p.id]; localStorage.setItem('gc-favorites', JSON.stringify(next)); setSaved(!saved); }
  return <article className="pro-card"><div className="pro-image"><Link href={`/profissionais/${p.id}`} tabIndex={-1}>{p.image ? <img src={p.image} alt={p.category} loading="lazy"/> : <div className="pro-image-empty"><ChefHat size={56}/></div>}</Link><span className="pro-type">{p.type}</span><button className={`favorite-btn ${saved ? 'is-saved' : ''}`} onClick={toggle} aria-label={saved ? `Remover ${p.name} dos favoritos` : `Salvar ${p.name} nos favoritos`}><Heart size={18} fill={saved ? 'currentColor' : 'none'}/></button>{p.demo && <span className="demo-image-label">Portfólio ilustrativo</span>}{p.topRated && <span className="top-rated-badge top-rated-floating"><Award size={12}/> Top Rated</span>}</div><div className="pro-content"><div className="pro-category">{p.category}</div><Link href={`/profissionais/${p.id}`} className="pro-name"><h3>{p.name}</h3><ArrowUpRight size={20}/></Link><p className="pro-location"><MapPin size={14}/>{p.city}{p.rating?.count ? <span className="pro-rating"><Star size={13} fill="currentColor"/> {p.rating.average.toFixed(1)} ({p.rating.count})</span> : null}</p><div className="pro-tags">{p.tags.map(tag => <span key={tag}>{tag}</span>)}</div><div className="pro-bottom"><span>{p.price > 0 ? <>A partir de <strong>{money(p.price)}</strong><small> / a partir de</small></> : 'Orçamento sob proposta'}</span><Link href={`/profissionais/${p.id}`} aria-label={`Ver ${p.name}`}><ArrowRightIcon/></Link></div></div></article>;
}
function ArrowRightIcon() { return <ArrowUpRight size={17}/>; }
