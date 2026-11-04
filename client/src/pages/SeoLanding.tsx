// Páginas de SEO: /servicos/... (quem contrata) e /trabalhe-como/... (profissionais).
// O texto vem de @shared/seo, o mesmo usado no HTML que o servidor entrega ao Google.
import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, CheckCircle2, MapPin, Radar, Calculator, Wallet, FileText, Award } from 'lucide-react';
import type { Professional } from '@shared/catalog';
import { allServices } from '@shared/services';
import {
  JOBS_BASE, SERVICES_BASE, SITE_NAME, seoCatalogFrom, cityPath, serviceCityPath, jobCityPath, normalizeCityName,
  matchProfessionals, nearbyCities, resolveSeoRoute, seoCitiesFrom, type Faq, type SeoCity, type Crumb,
} from '@shared/seo';
import { api } from '@/lib/api';
import { useSite } from '@/lib/site';
import ProfessionalCard from '@/components/ProfessionalCard';

function Crumbs({ crumbs }: { crumbs: Crumb[] }) {
  return <nav className="breadcrumb" aria-label="Navegação estrutural">{crumbs.map((c, i) => <span key={c.path} className="seo-crumb">{i > 0 && <span>/</span>}{i === crumbs.length - 1 ? <span>{c.name}</span> : <Link href={c.path}>{c.name}</Link>}</span>)}</nav>;
}

function Faqs({ faqs }: { faqs: Faq[] }) {
  return <><h2 className="info-heading">Perguntas frequentes</h2><div className="faq-list">{faqs.map(([q, a]) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></>;
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return <div className="seo-box"><h2>{title}</h2><ul>{items.map(i => <li key={i}><CheckCircle2 size={16}/> {i}</li>)}</ul></div>;
}

function LinkCloud({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  if (!links.length) return null;
  return <section className="seo-links"><h2>{title}</h2><div>{links.map(l => <Link key={l.href} href={l.href}><MapPin size={13}/> {l.label}</Link>)}</div></section>;
}

export default function SeoLanding() {
  const [location, navigate] = useLocation();
  const site = useSite();
  const cities = seoCitiesFrom(site.content);
  const seo = seoCatalogFrom(site.serviceCatalog);
  const route = resolveSeoRoute(location, cities, seo);
  const pros = useQuery({ queryKey: ['gastro-professionals'], queryFn: () => api<{ professionals: Professional[] }>('/professionals'), retry: false, enabled: Boolean(route && (route.kind === 'service' || route.kind === 'job' || route.kind === 'cityHub')) });
  const redirectTo = route?.kind === 'redirect' ? route.to : null;
  useEffect(() => { if (redirectTo) navigate(redirectTo, { replace: true }); }, [redirectTo]);
  useEffect(() => { if (route && route.kind !== 'redirect') document.title = route.page.title; }, [route && route.kind !== 'redirect' ? route.page.title : '']);

  if (route?.kind === 'redirect') return null;
  if (!route) return <main className="wrap info-page empty-state"><span className="eyebrow">404</span><h1>Essa página<br/>não foi encontrada.</h1><p>Veja todos os serviços para eventos.</p><Link href={SERVICES_BASE} className="btn btn-primary">Ver serviços</Link></main>;
  const { page } = route;
  const all = pros.data?.professionals ?? [];
  const known = allServices(site.serviceCatalog);

  if (route.kind === 'servicesHub' || route.kind === 'jobsHub') {
    const isJobs = route.kind === 'jobsHub';
    const items = isJobs ? seo.professions.map(p => ({ href: `${JOBS_BASE}/${p.slug}`, title: p.name, text: p.intro })) : seo.services.map(s => ({ href: `${SERVICES_BASE}/${s.slug}`, title: s.name, text: s.intro }));
    return <main className="wrap info-page seo-page"><Crumbs crumbs={page.crumbs}/><span className="eyebrow">{isJobs ? 'PARA PROFISSIONAIS DE EVENTOS' : 'PROFISSIONAIS PARA EVENTOS'}</span><h1>{page.h1}</h1><p className="lead">{page.lead}</p>
      <div className="seo-cards">{items.map(i => <Link key={i.href} href={i.href} className="seo-card"><h2>{i.title}</h2><p>{i.text}</p><span>Ver mais <ArrowUpRight size={15}/></span></Link>)}</div>
      {!isJobs && <LinkCloud title="Cidades atendidas" links={cities.map(c => ({ href: cityPath(c), label: `${c.name}/${c.uf}` }))}/>}
      <div className="catalog-cta"><div><h3>{isJobs ? 'Comece a receber pedidos' : 'Peça orçamento grátis'}</h3><p>{isJobs ? 'Cadastro com CPF ou CNPJ. Sem comissão: você recebe 100% do valor.' : 'Conte sua ocasião e receba propostas de profissionais da sua região.'}</p></div><Link href={isJobs ? '/conta?cadastro=profissional' : '/orcamento'} className="btn btn-primary">{isJobs ? 'Cadastrar como profissional' : 'Pedir orçamento'} <ArrowRight size={18}/></Link></div>
      <Faqs faqs={page.faqs}/></main>;
  }

  if (route.kind === 'cityHub') {
    const { city } = route;
    const local = all.filter(p => !p.demo && normalizeCityName(p.city) === normalizeCityName(city.name)).slice(0, 12);
    return <main className="wrap info-page seo-page"><Crumbs crumbs={page.crumbs}/><span className="eyebrow">{city.name.toUpperCase()} E REGIÃO</span><h1>{page.h1}</h1><p className="lead">{page.lead}</p>
      <div className="seo-actions"><Link href={`/orcamento?cidade=${encodeURIComponent(`${city.name}, ${city.uf}`)}`} className="btn btn-primary">Pedir orçamento grátis <ArrowRight size={18}/></Link></div>
      <div className="seo-cards">{seo.services.map(s => <Link key={s.slug} href={serviceCityPath(s, city)} className="seo-card"><h2>{s.name} em {city.name}</h2><p>{s.intro}</p><span>Ver mais <ArrowUpRight size={15}/></span></Link>)}</div>
      {local.length > 0 && <><h2 className="info-heading">Profissionais em {city.name}</h2><div className="professional-grid">{local.map(p => <ProfessionalCard key={p.id} professional={p}/>)}</div></>}
      <LinkCloud title={`Para profissionais de ${city.name}`} links={seo.professions.map(p => ({ href: jobCityPath(p, city, seo), label: p.name }))}/>
      <LinkCloud title="Cidades próximas" links={nearbyCities(cities, city).map(c => ({ href: cityPath(c), label: `${c.name}/${c.uf}` }))}/>
      <Faqs faqs={page.faqs}/></main>;
  }

  if (route.kind === 'service') {
    const { service, city } = route;
    const labels = known.filter(s => service.serviceIds.includes(s.id)).map(s => s.label);
    const matches = matchProfessionals(all, [service.categoryId], labels, city);
    const where = city ? ` em ${city.name}` : '';
    const catalogHref = `/profissionais?tipo=${encodeURIComponent(service.categoryId)}${city ? `&cidade=${encodeURIComponent(city.name)}` : ''}`;
    return <main className="wrap info-page seo-page"><Crumbs crumbs={page.crumbs}/><span className="eyebrow">ORÇAMENTO GRÁTIS · CONTRATO EM PDF</span><h1>{page.h1}</h1><p className="lead">{page.lead}</p>
      <div className="seo-actions"><Link href={`/orcamento?servico=${encodeURIComponent(service.slug)}${city ? `&cidade=${encodeURIComponent(`${city.name}, ${city.uf}`)}` : ''}`} className="btn btn-primary">Pedir orçamento grátis <ArrowRight size={18}/></Link><Link href={catalogHref} className="btn btn-outline">Ver profissionais <ArrowUpRight size={16}/></Link></div>
      {city && <p className="seo-intro">{service.intro}</p>}
      <div className="seo-grid"><Checklist title={`Ocasiões para contratar ${service.short}`} items={service.occasions}/><Checklist title="O que costuma incluir" items={service.includes}/><Checklist title="Dicas para contratar bem" items={service.tips}/></div>
      <h2 className="info-heading">Profissionais{where}</h2>
      {matches.length ? <div className="professional-grid">{matches.map(p => <ProfessionalCard key={p.id} professional={p}/>)}</div>
        : <div className="notice"><MapPin size={20}/><p>Publique o seu pedido e receba propostas de {service.plural} que atendem {city ? city.name : 'a sua região'}. É grátis e você só fecha se quiser.</p></div>}
      <Faqs faqs={page.faqs}/>
      {city ? <><LinkCloud title={`${service.name} em cidades próximas`} links={nearbyCities(cities, city).map(c => ({ href: serviceCityPath(service, c), label: `${service.name} em ${c.name}` }))}/><LinkCloud title={`Outros serviços em ${city.name}`} links={seo.services.filter(s => s.slug !== service.slug).map(s => ({ href: serviceCityPath(s, city), label: s.name }))}/></>
        : <LinkCloud title={`${service.name} por cidade`} links={cities.map(c => ({ href: serviceCityPath(service, c), label: `${c.name}/${c.uf}` }))}/>}
      <div className="catalog-cta"><div><h3>{service.name}{where}</h3><p>Conte a data, o local e o número de convidados. Os profissionais enviam propostas para você.</p></div><Link href="/orcamento" className="btn btn-primary">Pedir orçamento <ArrowRight size={18}/></Link></div>
    </main>;
  }

  const { profession, city } = route;
  const labels = known.filter(s => profession.serviceIds.includes(s.id)).map(s => s.label);
  const categoryIds = site.serviceCatalog.filter(c => c.services.some(s => profession.serviceIds.includes(s.id))).map(c => c.id);
  const count = matchProfessionals(all, categoryIds, labels, city as SeoCity | undefined).length;
  return <main className="wrap info-page seo-page"><Crumbs crumbs={page.crumbs}/><span className="eyebrow">ZERO COMISSÃO · {SITE_NAME.toUpperCase()}</span><h1>{page.h1}</h1><p className="lead">{page.lead}</p>
    <div className="seo-actions"><Link href="/conta?cadastro=profissional" className="btn btn-primary">Cadastrar como {profession.role} <ArrowRight size={18}/></Link><Link href="/para-profissionais" className="btn btn-outline">Como funciona <ArrowUpRight size={16}/></Link></div>
    {city && <p className="seo-intro">{profession.intro}</p>}
    <div className="info-values">{[{ icon: Wallet, title: 'Zero comissão', text: 'Você recebe 100% do valor combinado direto no seu Pix e paga só uma assinatura mensal fixa.' }, { icon: Radar, title: 'Radar de pedidos', text: `Pedidos de clientes${city ? ` de ${city.name} e região` : ' da sua região'} com data, convidados e score de intenção.` }, { icon: Calculator, title: 'Copilot com calculadoras', text: 'Ingredientes, porções, equipe, custos e lucro calculados antes de enviar a proposta.' }, { icon: FileText, title: 'Contrato em PDF', text: 'Gerado automaticamente quando o cliente aceita a sua proposta.' }, { icon: Award, title: 'Selo Top Rated', text: 'Avaliações altas dão destaque ao seu perfil no catálogo.' }].map(({ icon: Icon, title, text }) => <div key={title}><Icon size={27}/><h3>{title}</h3><p>{text}</p></div>)}</div>
    <div className="seo-grid"><Checklist title={`Quem contrata ${profession.plural}`} items={profession.clients}/></div>
    {count > 0 && <p className="seo-intro">{count} {count === 1 ? 'profissional já atende' : 'profissionais já atendem'}{city ? ` em ${city.name}` : ''} pela plataforma.</p>}
    <Faqs faqs={page.faqs}/>
    {city ? <LinkCloud title={`${profession.name} em cidades próximas`} links={nearbyCities(cities, city).map(c => ({ href: jobCityPath(profession, c, seo), label: `${profession.name} em ${c.name}` }))}/>
      : <LinkCloud title={`${profession.name} por cidade`} links={cities.map(c => ({ href: jobCityPath(profession, c, seo), label: `${c.name}/${c.uf}` }))}/>}
    <div className="catalog-cta"><div><h3>Comece a receber pedidos</h3><p>Cadastro com CPF ou CNPJ, fotos dos seus trabalhos e chave Pix.</p></div><Link href="/conta?cadastro=profissional" className="btn btn-primary">Cadastrar agora <ArrowRight size={18}/></Link></div>
  </main>;
}
