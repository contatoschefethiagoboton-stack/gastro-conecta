import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, Menu, X, CookingPot, ArrowRight, MapPin, MessageCircle, Mail, Instagram, Facebook, Lock } from 'lucide-react';
import { useSite, Lines } from '@/lib/site';
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
  const site = useSite();
  const instagram = site.c('contact.instagram');
  const facebook = site.c('contact.facebook');
  const email = site.c('contact.email');
  return <footer className="site-footer"><div className="wrap footer-main"><div><Brand/><p><Lines text={site.c('footer.tagline')}/></p><span className="footer-caption">{site.c('footer.caption')}</span><div className="footer-contact"><a href={site.wa('Olá! Vim pelo site GastroConecta.')} target="_blank" rel="noopener noreferrer"><MessageCircle size={14}/> WhatsApp {site.whatsappDisplay}</a>{email && <a href={`mailto:${email}`}><Mail size={14}/> {email}</a>}{instagram && <a href={instagram} target="_blank" rel="noopener noreferrer"><Instagram size={14}/> Instagram</a>}{facebook && <a href={facebook} target="_blank" rel="noopener noreferrer"><Facebook size={14}/> Facebook</a>}</div></div><div><h4>Explore</h4><Link href="/profissionais">Chefs e buffets</Link><Link href="/vagas">Vagas freelance</Link><Link href="/como-funciona">Como funciona</Link></div><div><h4>Faça parte</h4><Link href="/conta?cadastro=1">Criar uma conta</Link><Link href="/para-profissionais">Sou profissional</Link><Link href="/sobre">Nossa história</Link></div><div><h4>Uma relação transparente</h4><Link href="/seguranca">Segurança e privacidade</Link><Link href="/termos">Termos da plataforma</Link><Link href="/painel">Central da conta</Link><span className="footer-location"><MapPin size={14}/> Atendimento em {site.c('contact.region')}</span></div></div><div className="wrap footer-bottom"><span>© {new Date().getFullYear()} {site.c('brand.company') || 'GastroConecta'}. Todos os direitos reservados.</span><span className="footer-bottom-right">Gastronomia conecta pessoas.<Link href="/admin" className="footer-admin-link" aria-label="Acesso da administração"><Lock size={11}/> Administração</Link></span></div></footer>;
}
