import { useLocation } from 'wouter';
import { MessageCircle } from 'lucide-react';
import { business, whatsappLink } from '@shared/business';

const hiddenOn = ['/painel', '/conta'];

export default function WhatsAppButton() {
  const [location] = useLocation();
  if (hiddenOn.includes(location)) return null;
  const href = whatsappLink(`Olá! Vim pelo site ${business.name} e quero saber mais sobre os serviços.`);
  return <a className="whatsapp-fab" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Falar no WhatsApp ${business.whatsappDisplay}`}><MessageCircle size={20} aria-hidden="true"/><span>Fale no WhatsApp</span></a>;
}
