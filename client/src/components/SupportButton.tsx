import { useState } from 'react';
import { useLocation } from 'wouter';
import { MessageCircle, X } from 'lucide-react';
import { useSite } from '@/lib/site';

// "Fale Conosco": sempre direciona para o WhatsApp da administração do site.
const hiddenPrefixes = ['/conta', '/admin', '/redefinir-senha'];
const topics = [
  { label: 'Tirar uma dúvida', message: 'Olá, equipe GastroConecta! Tenho uma dúvida sobre a plataforma:' },
  { label: 'Problema com um profissional ou cliente', message: 'Olá, equipe GastroConecta! Quero relatar um problema com um profissional/cliente (pedido nº ___):' },
  { label: 'Problema na minha conta ou pagamento', message: 'Olá, equipe GastroConecta! Preciso de ajuda com minha conta/assinatura:' },
  { label: 'Enviar sugestão ou feedback', message: 'Olá, equipe GastroConecta! Tenho uma sugestão para a plataforma:' },
];

export default function SupportButton() {
  const [location] = useLocation();
  const site = useSite();
  const [open, setOpen] = useState(false);
  if (hiddenPrefixes.some(prefix => location.startsWith(prefix))) return null;
  if (site.c('whatsapp.enabled') === 'false') return null;
  const inDashboard = location.startsWith('/painel');
  if (!inDashboard) return <a className="whatsapp-fab" href={site.wa('Olá, equipe GastroConecta! Vim pelo site e quero entrar em contato.')} target="_blank" rel="noopener noreferrer" aria-label="Fale Conosco pelo WhatsApp da administração"><MessageCircle size={20} aria-hidden="true"/><span>Fale Conosco</span></a>;
  return <div className="support-root">
    {open && <div className="support-menu" role="menu"><header><strong>Fale Conosco</strong><button type="button" onClick={() => setOpen(false)} aria-label="Fechar"><X size={16}/></button></header><p>Fale direto com a administração do GastroConecta.</p>{topics.map(t => <a key={t.label} role="menuitem" href={site.wa(t.message)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>{t.label}</a>)}</div>}
    <button type="button" className="whatsapp-fab support-fab" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Fale Conosco"><MessageCircle size={20} aria-hidden="true"/><span>Fale Conosco</span></button>
  </div>;
}
