import { useLocation } from 'wouter';
import { MessageCircle } from 'lucide-react';
import { useSite } from '@/lib/site';

const hiddenPrefixes = ['/painel', '/conta', '/admin'];

export default function WhatsAppButton() {
  const [location] = useLocation();
  const site = useSite();
  if (hiddenPrefixes.some(prefix => location.startsWith(prefix))) return null;
  if (site.c('whatsapp.enabled') === 'false') return null;
  const href = site.wa('Olá! Vim pelo site GastroConecta e quero saber mais sobre os serviços.');
  return <a className="whatsapp-fab" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Falar no WhatsApp ${site.whatsappDisplay}`}><MessageCircle size={20} aria-hidden="true"/><span>Fale no WhatsApp</span></a>;
}
