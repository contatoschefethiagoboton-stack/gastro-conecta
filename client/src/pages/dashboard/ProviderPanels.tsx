import { useState, type FormEvent } from "react";
import { Activity, BadgeCheck, CalendarDays, Check, Copy, CreditCard, EyeOff, FileUp, Loader2, MessageCircle, QrCode, ReceiptText, RefreshCw, Send, Trash2, TrendingUp, Undo2, UserCheck, UserPlus, Wallet, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { uploadFile } from "@/lib/upload";
import { PHASE_LABELS } from "@shared/subscription";
import { categoryLabel, ContractButton, EmptyState, Field, formatDate, formatMoney, LoadingState, parseCents, post, scoreBand, SectionIntro, statusLabel, SubmitButton, todayKey, useAction, useApi, dateKey, type DashboardUser, type EventItem, type Proposal } from "./common";
import { ProposalComposer } from "./CopilotTools";

type ProviderEvents = { radar: EventItem[]; events: EventItem[]; closed: Array<{ id: number; title: string; city: string; date?: string; closedWith: string }> };
type Summary = { priceCents: number; phase: keyof typeof PHASE_LABELS; label: string; visible: boolean; periodEnd: string | null; autoRenew: { authorized: boolean; status: string | null }; manualPixAvailable: boolean; pendingPix: { qrCode: string; qrCodeBase64: string; ticketUrl: string; expiresAt: string | null } | null; history: Array<{ id: number; method: string; status: string; amountCents: number; createdAt: string }>; paymentsConfigured: boolean };
type Finance = {
  expenses: Array<{ id: number; category: string; description: string; amountCents: number; spentOn: string; eventId?: number; fileUrl?: string }>;
  totals: { revenueCents: number; expensesCents: number; profitCents: number };
  conversion: { submitted: number; won: number; rate: number };
  completedEvents: number;
  monthly: Array<{ month: string; revenueCents: number; expensesCents: number; profitCents: number; completed: number; mealPreps: number }>;
  byEvent: Array<{ eventId: number; title: string; date?: string; status: string; revenueCents: number; estimatedCostCents: number; actualExpensesCents: number; profitCents: number; loss: boolean }>;
};

export function SubscriptionBanner({ user, onGo }: { user: DashboardUser; onGo: () => void }) {
  const phase = user.subscriptionPhase;
  if (!phase || phase === "active") return null;
  const tone = phase === "renewal" ? "dash-alert-warning" : "dash-alert-error";
  return <div className={`dash-alert ${tone}`} role="status">{phase === "blocked" || phase === "inactive" ? <EyeOff size={17}/> : <CreditCard size={17}/>} {PHASE_LABELS[phase]}{phase !== "renewal" && ". Você ainda vê o radar, mas não aparece no catálogo e não envia propostas."}<button type="button" className="dash-small-button" onClick={onGo}>{phase === "renewal" ? "Ver assinatura" : "Pagar via Pix"}</button></div>;
}

export function ProviderOverview({ user, onTab }: { user: DashboardUser; onTab: (tab: string) => void }) {
  const events = useApi<ProviderEvents>("events", "/events");
  const finance = useApi<Finance>("finance", "/finance");
  const f = finance.data;
  return <div className="dash-stack">
    <section className="dash-welcome-card"><div><span className="dash-eyebrow">Zero comissão · 100% do valor é seu</span><h2>Olá, {user.name.split(" ")[0]}.</h2><p>Veja os pedidos da sua região, monte propostas com o Copilot e acompanhe seu lucro.</p></div></section>
    <div className="dash-admin-overview">
      <div><span>Pedidos no radar</span><strong>{events.data?.radar.length ?? "—"}</strong></div>
      <div><span>Taxa de conversão</span><strong>{f ? `${f.conversion.rate}%` : "—"}</strong></div>
      <div><span>Lucro líquido total</span><strong>{f ? formatMoney(f.totals.profitCents) : "—"}</strong></div>
      <div><span>Serviços concluídos</span><strong>{f?.completedEvents ?? "—"}</strong></div>
    </div>
    <div className="dash-card-grid dash-card-grid-three">
      <button type="button" className="dash-quick-card" onClick={() => onTab("radar")}><span className="dash-quick-icon orange"><Activity size={19}/></span><strong>Abrir o radar</strong><span>Pedidos abertos compatíveis</span></button>
      <button type="button" className="dash-quick-card" onClick={() => onTab("calculators")}><span className="dash-quick-icon olive"><TrendingUp size={19}/></span><strong>Calculadoras do Copilot</strong><span>Ingredientes, equipe e custos</span></button>
      <button type="button" className="dash-quick-card" onClick={() => onTab("finance")}><span className="dash-quick-icon sand"><Wallet size={19}/></span><strong>Financeiro</strong><span>Despesas, notas e lucro</span></button>
    </div>
  </div>;
}

export function RadarPanel({ user }: { user: DashboardUser }) {
  const query = useApi<ProviderEvents>("events", "/events");
  const { busy, run } = useAction();
  const [composing, setComposing] = useState<EventItem | null>(null);
  const [intent, setIntent] = useState<"all" | "high" | "medium" | "research">("all");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const blocked = user.subscriptionPhase === "blocked" || user.subscriptionPhase === "inactive";
  const radar = query.data?.radar ?? [];
  const cities = [...new Set(radar.map(e => e.city))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const list = radar.filter(e => (intent === "all" || (intent === "high" ? e.score >= 80 : intent === "medium" ? e.score >= 50 && e.score < 80 : e.score < 50)) && (!city || e.city === city) && (!category || e.category === category));
  if (composing) return <ProposalComposer event={composing} onClose={() => setComposing(null)}/>;
  return <div className="dash-stack">
    <SectionIntro eyebrow="Oportunidades reais" title="Radar de pedidos." text="Pedidos abertos compatíveis com os seus serviços. Envie uma proposta ou recuse para manter o radar limpo."/>
    {blocked && <div className="dash-alert dash-alert-error"><EyeOff size={17}/> Sua assinatura não está ativa: você pode ver o radar, mas o envio de propostas está bloqueado.</div>}
    <section className="dash-card">
      <div className="dash-radar-filters">
        <div className="dash-radar-intents" role="tablist">{([["all", "Todos"], ["high", "Alta (80–100)"], ["medium", "Média (50–79)"], ["research", "Pesquisa (0–49)"]] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={intent === value} className={`dash-radar-intent ${intent === value ? "is-active" : ""}`} key={value} onClick={() => setIntent(value)}>{label}</button>)}</div>
        <label className="dash-radar-city-filter"><span>Cidade</span><select value={city} onChange={e => setCity(e.target.value)}><option value="">Todas</option>{cities.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="dash-radar-city-filter"><span>Tipo</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="">Todos</option>{Object.entries(categoryLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      {query.isLoading ? <LoadingState/> : !list.length ? <EmptyState title="Nenhum pedido no radar" detail={radar.length ? "Ajuste os filtros para ver outros pedidos." : "Quando houver pedidos compatíveis com os seus serviços, eles aparecem aqui."}/> : <div className="dash-record-list">{list.map(e => <article className="dash-record" key={e.id}>
        <div className="dash-record-main"><span className="dash-list-icon orange"><Activity size={17}/></span><div>
          <h4>{e.title} <span className={`dash-client-tag ${e.clientTag === "Cliente Antigo" ? "is-returning" : ""}`}>{e.clientTag === "Cliente Antigo" ? <UserCheck size={12}/> : <UserPlus size={12}/>} {e.clientTag}</span></h4>
          <p>{categoryLabel[e.category]} · {e.type} · {e.city} · {e.guests} pessoa(s){e.details?.mealPlan ? ` · ${e.details.mealPlan}` : ""}{e.details?.areaM2 ? ` · ${e.details.areaM2} m²` : ""}</p>
          <span>{formatDate(e.date)}{e.time ? ` às ${e.time}` : ""} · {e.scope === "full" ? "quer serviço completo" : e.scope === "labor" ? "quer só mão de obra" : "escopo a combinar"}</span>
          {e.clientTag === "Cliente Antigo" && <small className="dash-loyalty-tip">Cliente que volta: ofereça um desconto de fidelidade ou um pacote especial.</small>}
        </div></div>
        <div className="dash-record-actions"><strong>{formatMoney(e.budgetCents)}</strong><span className={`dash-score ${scoreBand(e.score).className}`}>{e.score} · {scoreBand(e.score).label}</span>
          {e.myProposal === "pending" ? <span className="dash-status dash-status-pending">Proposta enviada</span> : <>
            <button className="dash-small-button" type="button" disabled={blocked} onClick={() => setComposing(e)}><Send size={14}/> {e.myProposal ? "Nova proposta" : "Aceitar e propor"}</button>
            <button className="dash-small-button dash-ghost-button" type="button" disabled={busy === `dismiss-${e.id}`} onClick={() => void run(`dismiss-${e.id}`, () => post(`/events/${e.id}/dismiss`), "Pedido recusado e removido do seu radar.")}><X size={14}/> Recusar</button>
          </>}
        </div>
      </article>)}</div>}
    </section>
    {Boolean(query.data?.closed.length) && <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Encerrados</span><h3>Pedidos que você disputou</h3></div></div><div className="dash-record-list">{query.data!.closed.map(c => <article className="dash-record dash-record-muted" key={c.id}><div><h4>{c.title}</h4><p>{c.city} · {formatDate(c.date)}</p></div><span className="dash-status dash-status-cancelled">Cliente fechou com {c.closedWith}</span></article>)}</div></section>}
  </div>;
}

export function ProviderProposals() {
  const query = useApi<{ proposals: Proposal[] }>("proposals", "/proposals");
  const { busy, run } = useAction();
  return <div className="dash-stack">
    <SectionIntro eyebrow="Negociação" title="Suas propostas." text="Acompanhe o que foi enviado. Quando o cliente aceita, o WhatsApp dele é liberado e o contrato é gerado."/>
    <section className="dash-card">{query.isLoading ? <LoadingState/> : !query.data?.proposals.length ? <EmptyState title="Nenhuma proposta enviada" detail="Use o radar para enviar sua primeira proposta."/> : <div className="dash-record-list">{query.data.proposals.map(p => <article className={`dash-record ${p.closedWith ? "dash-record-muted" : ""}`} key={p.id}>
      <div className="dash-record-main"><span className="dash-list-icon"><Send size={17}/></span><div><h4>{p.eventTitle}</h4><p>{p.scope === "full" ? "Serviço completo" : "Só mão de obra"} · custo estimado {formatMoney(p.costCents)} · lucro {formatMoney(p.amountCents - p.costCents)}</p><span>{p.message}</span></div></div>
      <div className="dash-record-actions"><strong>{formatMoney(p.amountCents)}</strong>
        {p.closedWith ? <span className="dash-status dash-status-cancelled">Cliente fechou com {p.closedWith}</span> : <span className={`dash-status dash-status-${p.status}`}>{statusLabel[p.status] ?? p.status}</span>}
        {p.whatsappUrl && <a className="dash-small-button dash-whatsapp" href={p.whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={14}/> WhatsApp do cliente</a>}
        {p.status === "pending" && <button className="dash-small-button dash-ghost-button" type="button" disabled={busy === `withdraw-${p.id}`} onClick={() => void run(`withdraw-${p.id}`, () => post(`/proposals/${p.id}/withdraw`), "Proposta retirada.")}><Undo2 size={14}/> Retirar</button>}
      </div>
    </article>)}</div>}</section>
  </div>;
}

export function ProviderJobs() {
  const query = useApi<ProviderEvents>("events", "/events");
  const { busy, run } = useAction();
  const events = query.data?.events ?? [];
  return <div className="dash-stack">
    <SectionIntro eyebrow="Agenda" title="Serviços fechados." text="Pedidos em que o cliente aceitou sua proposta. Depois do serviço, marque como concluído para abrir a avaliação 360°."/>
    <section className="dash-card">{query.isLoading ? <LoadingState/> : !events.length ? <EmptyState title="Nenhum serviço fechado ainda" detail="Quando um cliente aceitar sua proposta, ele aparece aqui."/> : <div className="dash-record-list">{events.map(e => <article className="dash-record" key={e.id}>
      <div className="dash-record-main"><span className="dash-list-icon"><CalendarDays size={17}/></span><div><h4>{e.title} {e.clientTag && <span className={`dash-client-tag ${e.clientTag === "Cliente Antigo" ? "is-returning" : ""}`}>{e.clientTag}</span>}</h4><p>{e.clientName} · {e.city}{e.location ? ` · ${e.location}` : ""}</p><span>{formatDate(e.date)}{e.time ? ` às ${e.time}` : ""} · {statusLabel[e.status]}</span></div></div>
      <div className="dash-record-actions">
        {e.whatsappUrl && <a className="dash-small-button dash-whatsapp" href={e.whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={14}/> WhatsApp</a>}
        {e.contractId && <ContractButton id={e.contractId}/>}
        {e.status === "booked" && dateKey(e.date) && dateKey(e.date) <= todayKey() && <button className="dash-small-button dash-complete-button" type="button" disabled={busy === `complete-${e.id}`} onClick={() => void run(`complete-${e.id}`, () => api(`/events/${e.id}/complete`, { method: "PATCH" }), "Serviço concluído. Avalie o cliente em até 24h.")}><Check size={14}/> Concluir</button>}
      </div>
    </article>)}</div>}</section>
  </div>;
}

export function SubscriptionPanel() {
  const query = useApi<Summary>("subscription", "/subscription");
  const { busy, run } = useAction();
  const s = query.data;
  const copy = (text: string) => { void navigator.clipboard?.writeText(text).then(() => toast.success("Código Pix copiado.")).catch(() => undefined); };
  const startAuto = async () => {
    const result = await run("auto", () => post<{ initPoint: string }>("/subscription/auto"));
    if (result?.initPoint) window.location.assign(result.initPoint);
  };
  return <div className="dash-stack">
    <SectionIntro eyebrow="Assinatura mensal" title="Sem comissão. Valor fixo." text="Você recebe 100% do valor negociado com seus clientes. A assinatura mantém seu perfil visível no catálogo e libera o envio de propostas."/>
    {query.isLoading || !s ? <LoadingState/> : <>
      <div className="dash-card-grid dash-card-grid-three">
        <section className="dash-money-card"><span>Mensalidade</span><strong>{formatMoney(s.priceCents)}</strong><CreditCard size={20}/></section>
        <section className={`dash-money-card ${s.visible ? "outline" : "muted"}`}><span>Situação</span><strong className="dash-small-strong">{s.label}</strong>{s.visible ? <BadgeCheck size={20}/> : <EyeOff size={20}/>}</section>
        <section className="dash-money-card outline"><span>Vencimento</span><strong>{s.periodEnd ? formatDate(s.periodEnd) : "—"}</strong><CalendarDays size={20}/></section>
      </div>
      {!s.paymentsConfigured && <div className="dash-alert dash-alert-warning">Pagamentos ainda não configurados pela administração (Mercado Pago). Use o Fale Conosco para ativar sua assinatura.</div>}
      <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Pix automático</span><h3>{s.autoRenew.authorized ? "Renovação automática ativa" : "Ative a renovação automática"}</h3><p className="dash-muted">A cobrança automática via Pix é feita 5 dias antes do vencimento. Se falhar, o Pix manual é liberado aqui. Sem pagamento até o vencimento, o perfil fica oculto.</p></div><RefreshCw size={20}/></div>
        <div className="cp-actions">{s.autoRenew.authorized ? <button type="button" className="dash-outline-button" disabled={busy === "auto-off"} onClick={() => void run("auto-off", () => api("/subscription/auto", { method: "DELETE" }), "Renovação automática cancelada.")}>Cancelar renovação automática</button> : <button type="button" className="dash-primary-button" disabled={!s.paymentsConfigured || busy === "auto"} onClick={() => void startAuto()}>{busy === "auto" ? <Loader2 className="dash-spinner" size={16}/> : <RefreshCw size={16}/>} Autorizar Pix automático no Mercado Pago</button>}</div>
      </section>
      {s.manualPixAvailable && <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Pix manual</span><h3>{s.phase === "inactive" ? "Ative sua assinatura" : "Pague a mensalidade via Pix"}</h3></div><QrCode size={20}/></div>
        {s.pendingPix?.qrCode ? <div className="dash-pix">
          {s.pendingPix.qrCodeBase64 && <img src={`data:image/png;base64,${s.pendingPix.qrCodeBase64}`} alt="QR Code Pix" width={200} height={200}/>}
          <div><p>Escaneie o QR Code ou use o Pix copia e cola. A confirmação é automática.</p><code className="dash-pix-code">{s.pendingPix.qrCode}</code>
            <div className="cp-actions"><button type="button" className="dash-small-button" onClick={() => copy(s.pendingPix!.qrCode)}><Copy size={14}/> Copiar código</button><button type="button" className="dash-small-button" disabled={busy === "refresh"} onClick={() => void run("refresh", () => post("/subscription/pix/refresh"))}><RefreshCw size={14}/> Já paguei, verificar</button></div>
            {s.pendingPix.expiresAt && <small className="dash-muted">Válido até {formatDate(s.pendingPix.expiresAt, true)}</small>}</div>
        </div> : <button type="button" className="dash-primary-button" disabled={!s.paymentsConfigured || busy === "pix"} onClick={() => void run("pix", () => post("/subscription/pix"))}>{busy === "pix" ? <Loader2 className="dash-spinner" size={16}/> : <QrCode size={16}/>} Gerar Pix de {formatMoney(s.priceCents)}</button>}
      </section>}
      <section className="dash-card"><div className="dash-card-heading"><h3>Histórico de pagamentos</h3></div>{!s.history.length ? <EmptyState title="Nenhum pagamento ainda" detail="Os pagamentos da assinatura aparecem aqui."/> : <div className="dash-record-list">{s.history.map(h => <article className="dash-record" key={h.id}><div><h4>{h.method === "pix_auto" ? "Pix automático" : h.method === "admin_grant" ? "Liberado pela administração" : "Pix manual"}</h4><span>{formatDate(h.createdAt, true)}</span></div><div className="dash-record-actions"><strong>{formatMoney(h.amountCents)}</strong><span className={`dash-status dash-status-${h.status === "approved" ? "configured" : "pending"}`}>{h.status === "approved" ? "Pago" : h.status === "pending" ? "Aguardando" : "Não pago"}</span></div></article>)}</div>}</section>
    </>}
  </div>;
}

const EXPENSE_LABELS: Record<string, string> = { ingredientes: "Ingredientes", insumos: "Insumos / produtos", embalagens: "Embalagens", transporte: "Transporte", equipe: "Equipe", nota_fiscal: "Nota fiscal", equipamentos: "Equipamentos", outros: "Outros" };
const shortMonth = (key: string) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }); };

export function FinancePanel() {
  const query = useApi<Finance>("finance", "/finance");
  const events = useApi<ProviderEvents>("events", "/events");
  const { busy, run } = useAction();
  const [form, setForm] = useState({ category: "ingredientes", description: "", amount: "", spentOn: todayKey(), eventId: "", mediaId: 0, fileName: "" });
  const [uploading, setUploading] = useState(false);
  const f = query.data;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const amountCents = parseCents(form.amount);
    if (!amountCents) { toast.error("Informe um valor válido."); return; }
    const ok = await run("expense", () => post("/finance/expenses", { category: form.category, description: form.description, amountCents, spentOn: form.spentOn, eventId: form.eventId ? Number(form.eventId) : null, mediaId: form.mediaId || null }), "Lançamento salvo.");
    if (ok) setForm(c => ({ ...c, description: "", amount: "", mediaId: 0, fileName: "" }));
  };
  const attach = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try { const m = await uploadFile(file, "invoice"); setForm(c => ({ ...c, mediaId: m.id, fileName: file.name })); } catch (error) { toast.error(error instanceof Error ? error.message : "Falha no envio."); } finally { setUploading(false); }
  };
  const chart = (f?.monthly ?? []).map(m => ({ name: shortMonth(m.month), Receita: m.revenueCents / 100, Despesas: m.expensesCents / 100, Lucro: m.profitCents / 100, Concluídos: m.completed, Marmitas: m.mealPreps }));
  const tooltipMoney = (v: number | string) => formatMoney(Math.round(Number(v) * 100));
  return <div className="dash-stack">
    <SectionIntro eyebrow="Gestão financeira" title="Lucro de verdade." text="Registre produtos, insumos e notas fiscais. O painel compara receitas e despesas, mostra o lucro líquido e avisa quando um serviço deu prejuízo."/>
    {query.isLoading || !f ? <LoadingState/> : <>
      <div className="dash-admin-overview">
        <div><span>Receita fechada</span><strong>{formatMoney(f.totals.revenueCents)}</strong></div>
        <div><span>Despesas</span><strong>{formatMoney(f.totals.expensesCents)}</strong></div>
        <div className={f.totals.profitCents < 0 ? "is-negative" : ""}><span>Lucro líquido</span><strong>{formatMoney(f.totals.profitCents)}</strong></div>
        <div><span>Conversão</span><strong>{f.conversion.rate}%</strong><small>{f.conversion.won} de {f.conversion.submitted} propostas</small></div>
      </div>
      <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Últimos 12 meses</span><h3>Receita, despesas e lucro</h3></div></div>
        <div className="dash-chart"><ResponsiveContainer width="100%" height={260}><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e1d6"/><XAxis dataKey="name" tickLine={false} fontSize={11}/><YAxis tickLine={false} fontSize={11} width={56}/><Tooltip formatter={tooltipMoney}/><Legend/><Bar dataKey="Receita" fill="#df572f" radius={[4, 4, 0, 0]}/><Bar dataKey="Despesas" fill="#9a9686" radius={[4, 4, 0, 0]}/></BarChart></ResponsiveContainer></div>
        <div className="dash-chart"><ResponsiveContainer width="100%" height={220}><LineChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e1d6"/><XAxis dataKey="name" tickLine={false} fontSize={11}/><YAxis yAxisId="money" tickLine={false} fontSize={11} width={56}/><YAxis yAxisId="count" orientation="right" allowDecimals={false} tickLine={false} fontSize={11} width={28}/><Tooltip/><Legend/><Line yAxisId="money" type="monotone" dataKey="Lucro" stroke="#5c6b3a" strokeWidth={2} dot={false}/><Line yAxisId="count" type="monotone" dataKey="Concluídos" stroke="#df572f" strokeWidth={2} dot={false}/><Line yAxisId="count" type="monotone" dataKey="Marmitas" stroke="#c49a3c" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div>
      </section>
      <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Por serviço</span><h3>Lucro de cada serviço fechado</h3></div></div>
        {!f.byEvent.length ? <EmptyState title="Nenhum serviço fechado" detail="Os serviços aceitos aparecem aqui com o lucro calculado."/> : <div className="dash-record-list">{f.byEvent.map(e => <article className="dash-record" key={e.eventId}><div><h4>{e.title}</h4><p>{formatDate(e.date)} · {statusLabel[e.status]}</p><span>Custo estimado {formatMoney(e.estimatedCostCents)} · despesas lançadas {formatMoney(e.actualExpensesCents)}</span></div><div className="dash-record-actions"><strong>{formatMoney(e.revenueCents)}</strong><span className={`dash-status ${e.loss ? "dash-status-blocked" : "dash-status-configured"}`}>{e.loss ? "Prejuízo" : "Lucro"} {formatMoney(e.profitCents)}</span></div></article>)}</div>}
      </section>
      <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Novo lançamento</span><h3>Produtos, insumos e notas</h3></div><ReceiptText size={20}/></div>
        <form className="dash-form" onSubmit={submit}><div className="dash-form-grid">
          <label className="dash-field"><span>Categoria</span><select value={form.category} onChange={e => setForm(c => ({ ...c, category: e.target.value }))}>{Object.entries(EXPENSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <Field label="Descrição" value={form.description} onChange={v => setForm(c => ({ ...c, description: v }))} placeholder="Ex.: Carnes do churrasco" required/>
          <Field label="Valor (R$)" value={form.amount} onChange={v => setForm(c => ({ ...c, amount: v }))} inputMode="decimal" placeholder="0,00" required/>
          <Field label="Data" type="date" value={form.spentOn} onChange={v => setForm(c => ({ ...c, spentOn: v }))} required/>
          <label className="dash-field"><span>Serviço vinculado (opcional)</span><select value={form.eventId} onChange={e => setForm(c => ({ ...c, eventId: e.target.value }))}><option value="">Sem vínculo</option>{(events.data?.events ?? []).map(e => <option key={e.id} value={e.id}>{e.title} · {formatDate(e.date)}</option>)}</select></label>
          <label className="dash-field"><span>Nota fiscal / comprovante (opcional)</span><span className="dash-file-pick"><label className="dash-small-button">{uploading ? <Loader2 className="dash-spinner" size={14}/> : <FileUp size={14}/>} {form.fileName || "Anexar PDF ou foto"}<input type="file" hidden accept="application/pdf,image/*" onChange={e => { void attach(e.target.files?.[0]); e.target.value = ""; }}/></label></span></label>
        </div><SubmitButton loading={busy === "expense"} label="Salvar lançamento" disabled={uploading}/></form>
      </section>
      <section className="dash-card"><div className="dash-card-heading"><h3>Lançamentos</h3><span className="dash-count-label">{f.expenses.length}</span></div>
        {!f.expenses.length ? <EmptyState title="Nenhuma despesa lançada" detail="Registre compras e notas para ver seu lucro real."/> : <div className="dash-record-list">{f.expenses.map(x => <article className="dash-record" key={x.id}><div><h4>{x.description}</h4><p>{EXPENSE_LABELS[x.category] ?? x.category} · {formatDate(x.spentOn)}</p>{x.fileUrl && <a className="dash-text-link" href={x.fileUrl} target="_blank" rel="noopener noreferrer"><ReceiptText size={13}/> Ver nota</a>}</div><div className="dash-record-actions"><strong>{formatMoney(x.amountCents)}</strong><button type="button" className="cp-icon" aria-label="Excluir lançamento" disabled={busy === `del-${x.id}`} onClick={() => void run(`del-${x.id}`, () => api(`/finance/expenses/${x.id}`, { method: "DELETE" }), "Lançamento excluído.")}><Trash2 size={15}/></button></div></article>)}</div>}
      </section>
    </>}
  </div>;
}
