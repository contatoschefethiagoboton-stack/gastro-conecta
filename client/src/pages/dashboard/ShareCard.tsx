import { Copy, Megaphone, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { shareLink } from "@/lib/attribution";
import { subscriberCode } from "@shared/payments";
import type { DashboardUser } from "./common";

/** Link de divulgação do próprio usuário (com etiqueta de indicação para o marketing). */
export function ShareCard({ user }: { user: DashboardUser }) {
  const provider = user.accountType === "provider";
  const url = shareLink(provider ? `/profissionais/user-${user.id}` : "/", provider ? "fornecedor" : "cliente", subscriberCode(user.id));
  const text = provider
    ? `Faço seu evento, jantar ou serviço com orçamento sem compromisso. Veja meu perfil no GastroConecta: ${url}`
    : `Encontrei profissionais para eventos, jantares e serviços no GastroConecta, e é grátis para clientes: ${url}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success("Link copiado."); } catch { toast.error("Não foi possível copiar."); } };
  return <section className="dash-card dash-share">
    <div><span className="dash-eyebrow"><Megaphone size={13}/> {provider ? "Divulgue seu perfil" : "Indique o GastroConecta"}</span>
      <h3>{provider ? "Mais clientes vendo o seu trabalho" : "Conhece alguém que precisa de um profissional?"}</h3>
      <p className="dash-muted">{provider ? "Coloque este link na bio do Instagram, no status do WhatsApp e nas suas postagens. Quem chega por ele cai direto no seu perfil." : "Compartilhe o link com amigos e grupos. Para clientes é sempre grátis."}</p></div>
    <code className="dash-share-link">{url}</code>
    <div className="cp-actions"><button type="button" className="dash-small-button" onClick={() => void copy()}><Copy size={14}/> Copiar link</button><a className="dash-small-button dash-whatsapp" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14}/> Enviar no WhatsApp</a></div>
  </section>;
}
