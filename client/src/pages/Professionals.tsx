import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, SlidersHorizontal, ArrowRight, Heart, ChefHat } from 'lucide-react';
import type { Professional } from '@shared/catalog';
import { api } from '@/lib/api';
import ProfessionalCard from '@/components/ProfessionalCard';
import { useSite } from '@/lib/site';

export default function Professionals() {
  const params = new URLSearchParams(window.location.search);
  const [type, setType] = useState(params.get('tipo') || '');
  const [city, setCity] = useState(params.get('cidade') || '');
  const [search, setSearch] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [order, setOrder] = useState('recommended');
  const site = useSite();
  const query = useQuery({ queryKey: ['gastro-professionals'], queryFn: () => api<{professionals:Professional[]}>('/professionals'), retry: false });
  const items = query.data?.professionals || site.demos;
  const favorites: string[] = JSON.parse(localStorage.getItem('gc-favorites') || '[]');
  const filtered = items.filter(p => (!type || (type === 'top' ? Boolean(p.topRated) : p.categoryIds ? p.categoryIds.includes(type) : p.type === type)) && (!city || p.city.toLowerCase().includes(city.toLowerCase())) && (!search || `${p.name} ${p.category} ${p.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase())) && (!savedOnly || favorites.includes(p.id))).sort((a,b) => order === 'rating' ? (b.rating?.average ?? 0)-(a.rating?.average ?? 0) : Number(b.featured)-Number(a.featured) || Number(Boolean(b.topRated))-Number(Boolean(a.topRated)));
  return <main className="catalog-page"><div className="wrap"><div className="breadcrumb"><Link href="/">Início</Link><span>/</span><span>Profissionais</span></div><div className="page-title"><span className="eyebrow">ENCONTRE SUA BOA CONEXÃO</span><h1>Gente que transforma<br/>ocasiões em experiências.</h1><p>{site.serviceCatalog.map(cat => cat.name).join(', ')}. Para clientes, é grátis.</p></div><div className="catalog-toolbar"><label className="field-with-icon"><Search size={18}/><input placeholder="Nome, cozinha ou especialidade" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Pesquisar profissionais"/></label><label className="field-with-icon"><MapPin size={18}/><input placeholder="Todas as cidades" value={city} onChange={e=>setCity(e.target.value)} aria-label="Filtrar por cidade"/></label><select value={order} onChange={e=>setOrder(e.target.value)} aria-label="Ordenar resultados"><option value="recommended">Recomendados</option><option value="rating">Melhor avaliados</option></select></div><div className="filter-row"><div className="filter-pills">{[['','Todos'],['top','Top Rated'],...site.serviceCatalog.map(cat => [cat.id, cat.name])].map(([value,label]) => <button key={value} className={type===value?'selected':''} onClick={()=>setType(value)}>{label}</button>)}</div><button className={`favorites-filter ${savedOnly?'selected':''}`} onClick={()=>setSavedOnly(!savedOnly)}><Heart size={16} fill={savedOnly?'currentColor':'none'}/> Meus favoritos</button></div><div className="results-heading"><span><strong>{filtered.length}</strong> {filtered.length===1?'profissional encontrado':'profissionais encontrados'}</span><span>Portfólios demonstrativos identificados</span></div>{filtered.length ? <div className="professional-grid">{filtered.map(p=><ProfessionalCard key={p.id} professional={p}/>)}</div> : <div className="empty-state"><ChefHat size={44}/><h3>Nenhum profissional por aqui ainda.</h3><p>Tente outra cidade ou ajuste os filtros. Você também pode publicar seu evento.</p><button className="btn btn-outline" onClick={()=>{setType('');setCity('');setSearch('');setSavedOnly(false);}}>Limpar filtros</button><Link href="/orcamento" className="text-link">Solicitar um orçamento <ArrowRight size={16}/></Link></div>}<div className="catalog-cta"><div><h3>Não sabe por onde começar?</h3><p>Conte sua ideia. Os profissionais podem enviar propostas para você.</p></div><Link href="/orcamento" className="btn btn-primary">Solicitar orçamento <ArrowRight size={18}/></Link></div></div></main>;
}
