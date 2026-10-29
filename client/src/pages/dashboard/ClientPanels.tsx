import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Award, CalendarDays, Check, ChefHat, CircleAlert, Leaf, Loader2, MapPin, MessageCircle, Plus, Sparkles, Star, UtensilsCrossed, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Professional } from "@shared/catalog";
import { categoryLabel, ContractButton, EmptyState, formatDate, formatMoney, LoadingState, post, SectionIntro, Stars, statusLabel, todayKey, useAction, useApi, dateKey, type DashboardUser, type EventItem, type Proposal } from "./common";

const CATEGORIES = [
  { id: "event", label: "Eventos e jantares", text: "Chefs, buffets, garçons e barmans", icon: UtensilsCrossed },
  { id: "mealPrep", label: "Personal chef", text: "Marmitas semanais, fit e low-carb", icon: ChefHat },
  { id: "cleaning", label: "Limpeza", text: "Residencial, pesada, restaurante, pós-evento", icon: Sparkles },
  { id: "gardening", label: "Jardinagem", text: "Manutenção e paisagismo", icon: Leaf },
] as const;

export function ClientHome({ user, onTab }: { user: DashboardUser; onTab: (tab: string) => void }) {
  const catalog = useQuery({ queryKey: ["gastro-professionals"], queryFn: () => api<{ professionals: Professional[] }>("/professionals"), retry: false });
  const events = useApi<{ events: EventItem[] }>("events", "/events");
  const city = (user.city ?? "").split(/[-,]/)[0].trim().toLowerCase();
  const all = (catalog.data?.professionals ?? []).filter(p => !p.demo);
  const regional = (city ? all.filter(p => p.city.toLowerCase().includes(city)) : all);
  const shown = (regional.length ? regional : all).slice(0, 6);
  const active = (events.data?.events ?? []).filter(e => e.status === "open" || e.status === "booked");
  return <div className="dash-stack">
    <section className="dash-welcome-card"><div><span className="dash-eyebrow">Conta VIP gratuita</span><h2>Olá, {user.name.split(" ")[0]}.</h2><p>Conte o que você precisa e receba propostas de profissionais da sua região. Você não paga nada para usar a plataforma.</p></div><Link className="dash-primary-button" href="/orcamento"><Plus size={16}/> Novo pedido</Link></section>
    <div className="dash-category-grid">{CATEGORIES.map(({ id, label, text, icon: Icon }) => <Link key={id} href={`/orcamento?categoria=${id}`} className="dash-quick-card"><span className="dash-quick-icon orange"><Icon size={19}/></span><strong>{label}</strong><span>{text}</span></Link>)}</div>
    <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Seus pedidos</span><h3>Pedidos ativos</h3></div><button type="button" className="dash-text-link" onClick={() => onTab("requests")}>Ver todos</button></div>
      {events.isLoading ? <LoadingState/> : !active.length ? <EmptyState title="Nenhum pedido ativo" detail="Publique um pedido para receber propostas." action={<Link className="dash-small-button" href="/orcamento"><Plus size={14}/> Pedir orçamento</Link>}/> : <div className="dash-record-list">{active.slice(0, 4).map(e => <article className="dash-record" key={e.id}><div><h4>{e.title}</h4><p>{categoryLabel[e.category]} · {e.city} · {formatDate(e.date)}</p></div><div className="dash-record-actions">{e.status === "open" ? <span className="dash-status dash-status-pending">{e.pendingProposals ?? 0} proposta(s)</span> : <span className="dash-status dash-status-booked">Fechado com {e.providerName}</span>}<button type="button" className="dash-small-button" onClick={() => onTab("requests")}>Abrir</button></div></article>)}</div>}
    </section>
    <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow"><MapPin size={12}/> {user.city || "Sua região"}</span><h3>Profissionais perto de você</h3></div><Link className="dash-text-link" href="/profissionais">Ver catálogo</Link></div>
      {catalog.isLoading ? <LoadingState/> : !shown.length ? <EmptyState title="Ainda não há profissionais ativos aqui" detail="Publique seu pedido: profissionais da região recebem no radar."/> : <div className="dash-pro-grid">{shown.map(p => <Link key={p.id} href={`/profissionais/${p.id}`} className="dash-pro-card">{p.image ? <img src={p.image} alt="" loading="lazy"/> : <span className="dash-avatar">{p.name[0]}</span>}<div><strong>{p.name}{p.topRated && <span className="top-rated-badge"><Award size={11}/> Top Rated</span>}</strong><span>{p.category} · {p.city}</span>{p.rating?.count ? <span><Stars value={p.rating.average}/> {p.rating.average.toFixed(1)} ({p.rating.count})</span> : <span>Novo na plataforma</span>}</div></Link>)}</div>}
    </section>
  </div>;
}

export function ClientRequests({ user, onTab }: { user: DashboardUser; onTab: (tab: string) => void }) {
  const events = useApi<{ events: EventItem[] }>("events", "/events");
  const proposals = useApi<{ proposals: Proposal[] }>("proposals", "/proposals");
  const { busy, run } = useAction();
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const accept = async (p: Proposal) => {
    if (!user.contractDataComplete) { toast.info("Antes de aceitar, preencha seus dados para o contrato."); onTab("data"); return; }
    if (!confirm(`Aceitar a proposta de ${p.providerName} por ${formatMoney(p.amountCents)}? O pedido será fechado e o contrato gerado.`)) return;
    const result = await run(`accept-${p.id}`, () => post<{ whatsappUrl: string; contractId: number }>(`/proposals/${p.id}/accept`), "Proposta aceita! O contrato foi gerado e o WhatsApp do profissional liberado.");
    if (result?.whatsappUrl) setRevealed(r => ({ ...r, [p.eventId]: result.whatsappUrl }));
  };
  const list = events.data?.events ?? [];
  return <div className="dash-stack">
    <SectionIntro eyebrow="Pedidos e propostas" title="Seus pedidos." text="Compare as propostas, aceite (OK) a que preferir ou recuse as que não servem. Ao aceitar, você recebe o WhatsApp do profissional e o contrato em PDF." action={<Link className="dash-primary-button" href="/orcamento"><Plus size={16}/> Novo pedido</Link>}/>
    {!user.contractDataComplete && <div className="dash-alert dash-alert-warning"><CircleAlert size={17}/> Para aceitar propostas, preencha seus dados para o contrato (CPF, endereço, telefone e foto do rosto).<button type="button" className="dash-small-button" onClick={() => onTab("data")}>Preencher agora</button></div>}
    {events.isLoading ? <LoadingState/> : !list.length ? <section className="dash-card"><EmptyState title="Nenhum pedido ainda" detail="Conte o que você precisa e receba propostas." action={<Link className="dash-small-button" href="/orcamento"><Plus size={14}/> Pedir orçamento</Link>}/></section> : list.map(e => {
      const eventProposals = (proposals.data?.proposals ?? []).filter(p => p.eventId === e.id && p.status !== "withdrawn" && (e.status === "open" ? p.status === "pending" : p.status === "accepted"));
      const whatsapp = revealed[e.id] || e.whatsappUrl;
      return <section className="dash-card" key={e.id}>
        <div className="dash-card-heading"><div><span className="dash-eyebrow">{categoryLabel[e.category]} · pedido nº {e.id}</span><h3>{e.title}</h3><p className="dash-muted"><CalendarDays size={13}/> {formatDate(e.date)}{e.time ? ` às ${e.time}` : ""} · {e.city} · {e.guests} pessoa(s) · orçamento {formatMoney(e.budgetCents)}</p></div><span className={`dash-status dash-status-${e.status}`}>{statusLabel[e.status]}</span></div>
        {(e.status === "booked" || e.status === "completed") && <div className="dash-booked-box"><div><strong>Fechado com {e.providerName}</strong><span>Combine os detalhes finais direto com o profissional.</span></div><div className="cp-actions">{whatsapp && <a className="dash-primary-button dash-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={16}/> Falar no WhatsApp</a>}{e.contractId && <ContractButton id={e.contractId} label="Baixar contrato (PDF)"/>}{e.status === "booked" && dateKey(e.date) && dateKey(e.date) <= todayKey() && <button type="button" className="dash-small-button dash-complete-button" disabled={busy === `complete-${e.id}`} onClick={() => void run(`complete-${e.id}`, () => api(`/events/${e.id}/complete`, { method: "PATCH" }), "Serviço concluído. Avalie o profissional em até 24h.")}><Check size={14}/> Serviço realizado</button>}</div></div>}
        {e.status === "open" && (!eventProposals.length ? <EmptyState title="Aguardando propostas" detail="Os profissionais da região já podem ver seu pedido no radar."/> : <div className="dash-record-list">{eventProposals.map(p => <article className="dash-record" key={p.id}>
          <div className="dash-record-main"><span className="dash-avatar dash-avatar-small">{(p.providerName ?? "?")[0]}</span><div><h4>{p.providerName}{p.providerRating?.count ? <> · <Stars value={p.providerRating.average}/> {p.providerRating.average.toFixed(1)}</> : null}</h4><p>{p.scope === "full" ? "Serviço completo (com louças, utensílios e ingredientes)" : "Somente mão de obra"} · {p.paymentTerms}</p><span>{p.message}</span></div></div>
          <div className="dash-record-actions"><strong>{formatMoney(p.amountCents)}</strong>
            <button className="dash-small-button" type="button" disabled={busy === `accept-${p.id}`} onClick={() => void accept(p)}>{busy === `accept-${p.id}` ? <Loader2 className="dash-spinner" size={14}/> : <Check size={14}/>} OK, aceitar</button>
            <button className="dash-small-button dash-ghost-button" type="button" disabled={busy === `decline-${p.id}`} onClick={() => void run(`decline-${p.id}`, () => post(`/proposals/${p.id}/decline`), "Proposta recusada.")}><X size={14}/> Recusar</button>
          </div></article>)}</div>)}
        {e.status === "open" && <button type="button" className="dash-text-link" disabled={busy === `cancel-${e.id}`} onClick={() => { if (confirm("Cancelar este pedido? As propostas recebidas serão recusadas.")) void run(`cancel-${e.id}`, () => post(`/events/${e.id}/cancel`), "Pedido cancelado."); }}><X size={14}/> Cancelar pedido</button>}
        {e.status === "completed" && <button type="button" className="dash-text-link" onClick={() => onTab("reviews")}><Star size={14}/> Avaliar o profissional</button>}
      </section>;
    })}
  </div>;
}
