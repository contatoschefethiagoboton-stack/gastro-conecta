import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, Menu, X, CookingPot, ArrowRight, MapPin, MessageCircle, Mail, Globe } from 'lucide-react';
import { business, whatsappLink } from '@shared/business';
import { useQuery } from '@tanstack/react-query';
import { api, type CurrentUser } from '@/lib/api';

export function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="GastroConecta — início"><span className="brand-mark"><CookingPot size={23} strokeWidth={1.7}/><i/></span><span>gastro<span className="brand-weight">conecta</span><span className="brand-dot">.</span></span></Link>;
}

export function Header() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const me = useQuery({ queryKey: ['gastro-me-header'], queryFn: () => api<{user: CurrentUser | null}>('/me'), retry: false, staleTime: 15000 });
  return <header className="site-header"><div className="wrap header-inner"><Brand/><nav className={`desktop-nav ${open ? 'nav-open' : ''}`} aria-label="Navegação principal"><Link href="/profissionais" className={location === '/profissionais' ? 'active' : ''} onClick={() => setOpen(false)}>Encontre um profissional</Link><Link href="/como-funciona" onClick={() => setOpen(false)}>Como funciona</Link><Link href="/sobre" onClick={() => setOpen(false)}>Quem somos</Link><Link href="/para-profissionais" className="mobile-only" onClick={() => setOpen(false)}>Sou profissional</Link></nav><div className="header-actions"><Link href="/para-profissionais" className="professional-link">Sou profissional <ArrowUpRight size={15}/></Link><span className="header-divider"/><Link href={me.data?.user ? '/painel' : '/conta'} className="btn btn-outline btn-small">{me.data?.user ? 'Meu painel' : 'Entrar'} <ArrowRight size={15}/></Link><button className="menu-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Fechar menu' : 'Abrir menu'}>{open ? <X/> : <Menu/>}</button></div></div></header>;
}

export function Footer() {
  return <footer className="site-footer"><div className="wrap footer-main"><div><Brand/><p>Boas conexões.<br/>Experiências à altura da sua mesa.</p><span className="footer-caption">Criado por quem vive a gastronomia.</span><div className="footer-contact"><a href={whatsappLink(`Olá! Vim pelo site ${business.name}.`)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14}/> WhatsApp {business.whatsappDisplay}</a><a href={`mailto:${business.email}`}><Mail size={14}/> {business.email}</a><a href={business.showcaseUrl} target="_blank" rel="noopener"><Globe size={14}/> {business.showcaseLabel}</a></div></div><div><h4>Explore</h4><Link href="/profissionais">Chefs e buffets</Link><Link href="/vagas">Vagas freelance</Link><Link href="/como-funciona">Como funciona</Link></div><div><h4>Faça parte</h4><Link href="/conta?cadastro=1">Criar uma conta</Link><Link href="/para-profissionais">Sou profissional</Link><Link href="/sobre">Nossa história</Link></div><div><h4>Uma relação transparente</h4><Link href="/seguranca">Segurança e privacidade</Link><Link href="/termos">Termos da plataforma</Link><Link href="/painel">Central da conta</Link><span className="footer-location"><MapPin size={14}/> Atendimento em {business.region}</span></div></div><div className="wrap footer-bottom"><span>© {new Date().getFullYear()} GastroConecta · {business.company}. Todos os direitos reservados.</span><span>Gastronomia conecta pessoas.</span></div></footer>;
}
