import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Download, ExternalLink, FileText, Instagram, KeyRound, Loader2, Lock, Star } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useSite } from "@/lib/site";
import { PasswordRules, passwordOk } from "@/components/PasswordRules";
import type { RequestCategory } from "@shared/services";

export type DashboardUser = {
  id: number; name: string; email: string; accountType: "client" | "provider"; role: "user" | "admin"; status: string; city?: string;
  profileComplete?: boolean; contractDataComplete?: boolean; pendingReviews?: number; reviewLock?: boolean; growthPrompt?: boolean; growthFlags?: string[];
  subscriptionPhase?: "inactive" | "active" | "renewal" | "manual" | "blocked";
};

export type EventItem = {
  id: number; clientId: number; providerId?: number; title: string; type: string; category: RequestCategory; date?: string; time?: string; city: string; location?: string;
  guests: number; budgetCents: number; description?: string; scope?: string; details: Record<string, any>; score: number; status: "open" | "booked" | "completed" | "cancelled"; createdAt: string;
  pendingProposals?: number; providerName?: string; clientName?: string; whatsappUrl?: string; contractId?: number;
  clientTag?: "Cliente Novo" | "Cliente Antigo"; clientPreviousEvents?: number; myProposal?: string;
};
export type Proposal = {
  id: number; eventId: number; providerId: number; amountCents: number; costCents: number; message: string; status: string; scope: "labor" | "full"; paymentTerms: string; eventTime?: string;
  createdAt: string; providerName?: string; eventTitle?: string; eventStatus?: string; closedWith?: string; whatsappUrl?: string; providerRating?: { average: number; count: number }; clientView?: boolean;
};
export type PendingReview = { eventId: number; title: string; completedAt: string; targets: Array<{ id: number; name: string }> };
export type ReviewsResponse = { pending: PendingReview[]; overdue: number; average: number; count: number; reviews: Array<{ id: number; eventTitle: string; reviewerName: string; targetName: string; rating: number; feedback: string; createdAt: string; mine: boolean }> };
export type Contract = { id: number; title: string; status: string; createdAt: string; eventId?: number; clientName?: string; providerName?: string; amountCents?: number };

const moneyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatMoney = (cents: number) => moneyFormat.format((cents || 0) / 100);
export const parseCents = (value: string): number | null => {
  const normalized = value.trim().replace(/\s|R\$/g, "");
  if (!normalized) return null;
  const brazilian = /^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(normalized);
  const decimal = /^\d+(?:\.\d{1,2})?$/.test(normalized);
  if (!brazilian && !decimal) return null;
  const parsed = Number(brazilian ? normalized.replace(/\./g, "").replace(",", ".") : normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
};
export const centsInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
export const dateKey = (value?: string) => value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
export const todayKey = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
export function formatDate(value?: string, withTime = false) {
  if (!value) return "Data a definir";
  const key = dateKey(value);
  const parsed = key && !withTime ? new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("pt-BR", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}
export const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");
export const errorText = (error: unknown, fallback = "Não foi possível concluir esta ação.") => (error instanceof Error && error.message ? error.message : fallback);
export const statusLabel: Record<string, string> = { open: "Aberto", booked: "Fechado", completed: "Concluído", cancelled: "Cancelado", pending: "Aguardando", accepted: "Aceita", rejected: "Recusada", withdrawn: "Retirada" };
export const categoryLabel: Record<RequestCategory, string> = { event: "Evento", mealPrep: "Marmitas / personal chef", cleaning: "Limpeza", gardening: "Jardinagem" };

export function scoreBand(score: number) {
  if (score >= 80) return { label: "Alta intenção", className: "score-high" };
  if (score >= 50) return { label: "Em avaliação", className: "score-medium" };
  return { label: "Em pesquisa", className: "score-low" };
}

/** Busca autenticada com react-query. */
export function useApi<T>(key: string, path: string, enabled = true) {
  return useQuery({ queryKey: ["dash", key], queryFn: () => api<T>(path), enabled, retry: false, staleTime: 5_000 });
}

/** Mutação com toast e recarga das listas do painel. */
export function useAction() {
  const client = useQueryClient();
  const [busy, setBusy] = useState("");
  const run = async <T,>(key: string, request: () => Promise<T>, success?: string): Promise<T | null> => {
    setBusy(key);
    try {
      const value = await request();
      if (success) toast.success(success);
      await client.invalidateQueries({ queryKey: ["dash"] });
      await client.invalidateQueries({ queryKey: ["gastro-me-dashboard"] });
      return value;
    } catch (error) {
      toast.error(errorText(error));
      return null;
    } finally {
      setBusy("");
    }
  };
  return { busy, run };
}

export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export async function downloadFile(path: string, fileName: string) {
  try {
    const response = await fetch(`/api/gastro${path}`, { credentials: "include" });
    if (!response.ok) {
      let message = "Não foi possível baixar o arquivo.";
      try { const body = await response.json() as { error?: string }; if (body.error) message = body.error; } catch { /* resposta sem JSON */ }
      throw new Error(message);
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = fileName;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    toast.error(errorText(error, "Não foi possível baixar o arquivo."));
  }
}

export function ContractButton({ id, label = "Contrato PDF" }: { id: number; label?: string }) {
  return <button className="dash-small-button" type="button" onClick={() => void downloadFile(`/contracts/${id}/pdf`, `contrato-gastroconecta-${id}.pdf`)}><Download size={14}/> {label}</button>;
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="dash-empty"><div className="dash-empty-mark"><CircleAlert size={20}/></div><strong>{title}</strong><p>{detail}</p>{action}</div>;
}
export function LoadingState() { return <div className="dash-loading"><Loader2 className="dash-spinner" size={20}/> Carregando…</div>; }
export function SectionIntro({ eyebrow, title, text, action }: { eyebrow: string; title: string; text?: string; action?: ReactNode }) {
  return <div className="dash-section-intro"><div><span className="dash-eyebrow">{eyebrow}</span><h2>{title}</h2>{text && <p>{text}</p>}</div>{action}</div>;
}

type FieldProps = { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean; min?: string; max?: string; inputMode?: "decimal" | "numeric" | "text"; help?: string };
export function Field({ label, value, onChange, type = "text", placeholder, required, min, max, inputMode, help }: FieldProps) {
  return <label className="dash-field"><span>{label}</span><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} min={min} max={max} inputMode={inputMode}/>{help && <small className="dash-field-help">{help}</small>}</label>;
}
export function SubmitButton({ loading, label, disabled }: { loading: boolean; label: string; disabled?: boolean }) {
  return <button className="dash-primary-button" type="submit" disabled={loading || disabled}>{loading ? <Loader2 className="dash-spinner" size={16}/> : <Check size={16}/>} {label}</button>;
}
export function Stars({ value }: { value: number }) {
  return <span className="dash-stars" aria-label={`${value} de 5`}>{[1, 2, 3, 4, 5].map(n => <Star key={n} size={14} fill={n <= Math.round(value) ? "currentColor" : "none"}/>)}</span>;
}

/** Aviso de bloqueio pela regra das 24h. */
export function ReviewLockBanner({ user, onGo }: { user: DashboardUser; onGo: () => void }) {
  if (!user.pendingReviews) return null;
  return <div className={`dash-alert ${user.reviewLock ? "dash-alert-error" : "dash-alert-warning"}`} role="alert"><Lock size={17}/> {user.reviewLock ? "Avaliação pendente há mais de 24h: pedidos, propostas e aceites estão bloqueados até você avaliar." : `Você tem ${user.pendingReviews} avaliação(ões) obrigatória(s). Avalie em até 24h após a conclusão para não ter ações bloqueadas.`}<button type="button" className="dash-small-button" onClick={onGo}>Avaliar agora</button></div>;
}

/** Convite para avaliar a GastroConecta no Google e seguir o Instagram. */
export function GrowthPrompt({ user }: { user: DashboardUser }) {
  const site = useSite();
  const { run } = useAction();
  const google = site.c("growth.googleReviewUrl");
  const instagram = site.c("contact.instagram");
  const flags = user.growthFlags ?? [];
  if (!user.growthPrompt || (!google && !instagram)) return null;
  const ack = (flag: "google" | "instagram") => void run(`growth-${flag}`, () => post("/growth/ack", { flag }));
  return <section className="dash-card dash-growth-card"><div><span className="dash-eyebrow">Ajude a comunidade a crescer</span><h3>Sua opinião faz diferença</h3><p>Leva 1 minuto: avalie a GastroConecta no Google e siga nosso Instagram para novidades e oportunidades.</p></div><div className="dash-growth-actions">
    {google && !flags.includes("google") && <a className="dash-primary-button" href={google} target="_blank" rel="noopener noreferrer" onClick={() => ack("google")}><Star size={16}/> Avaliar no Google <ExternalLink size={13}/></a>}
    {instagram && !flags.includes("instagram") && <a className="dash-outline-button" href={instagram} target="_blank" rel="noopener noreferrer" onClick={() => ack("instagram")}><Instagram size={16}/> Seguir no Instagram</a>}
  </div></section>;
}

export function ReviewsPanel() {
  const query = useApi<ReviewsResponse>("reviews", "/reviews");
  const { busy, run } = useAction();
  const [forms, setForms] = useState<Record<string, { rating: number; feedback: string }>>({});
  const [thanks, setThanks] = useState(false);
  const site = useSite();
  const submit = async (pending: PendingReview, targetId: number) => {
    const key = `${pending.eventId}-${targetId}`;
    const values = forms[key] ?? { rating: 0, feedback: "" };
    const ok = await run(`review-${key}`, () => post("/reviews", { eventId: pending.eventId, targetId, rating: values.rating, feedback: values.feedback }), "Avaliação registrada. Obrigado!");
    if (ok) setThanks(true);
  };
  const data = query.data;
  return <div className="dash-stack">
    <SectionIntro eyebrow="Avaliação 360°" title="Avaliações obrigatórias." text="Depois de cada serviço concluído, cliente e profissional avaliam um ao outro. Pendências com mais de 24h bloqueiam novos pedidos, propostas e aceites."/>
    {thanks && (site.c("growth.googleReviewUrl") || site.c("contact.instagram")) && <section className="dash-card dash-growth-card"><div><span className="dash-eyebrow">Obrigado!</span><h3>Que tal avaliar a GastroConecta também?</h3><p>Sua avaliação no Google e seu follow no Instagram ajudam mais pessoas a encontrar bons profissionais.</p></div><div className="dash-growth-actions">{site.c("growth.googleReviewUrl") && <a className="dash-primary-button" href={site.c("growth.googleReviewUrl")} target="_blank" rel="noopener noreferrer" onClick={() => void post("/growth/ack", { flag: "google" })}><Star size={16}/> Avaliar no Google</a>}{site.c("contact.instagram") && <a className="dash-outline-button" href={site.c("contact.instagram")} target="_blank" rel="noopener noreferrer" onClick={() => void post("/growth/ack", { flag: "instagram" })}><Instagram size={16}/> Seguir no Instagram</a>}</div></section>}
    <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Pendências</span><h3>Avalie agora</h3></div><Star size={20}/></div>
      {query.isLoading ? <LoadingState/> : !data?.pending.length ? <EmptyState title="Nenhuma avaliação pendente" detail="Quando um serviço for concluído, a avaliação aparece aqui."/> : <div className="dash-review-list">{data.pending.map(pending => <div className="dash-review-event" key={pending.eventId}><strong>{pending.title}</strong>{pending.targets.map(target => {
        const key = `${pending.eventId}-${target.id}`; const values = forms[key] ?? { rating: 0, feedback: "" };
        return <div className="dash-review-form" key={target.id}><div><span>Avaliar</span><b>{target.name}</b></div>
          <div className="dash-star-picker" role="radiogroup" aria-label={`Nota para ${target.name}`}>{[1, 2, 3, 4, 5].map(n => <button type="button" role="radio" aria-checked={values.rating === n} key={n} className={n <= values.rating ? "is-on" : ""} onClick={() => setForms(c => ({ ...c, [key]: { ...values, rating: n } }))}><Star size={18} fill={n <= values.rating ? "currentColor" : "none"}/></button>)}</div>
          <input aria-label={`Comentário para ${target.name}`} value={values.feedback} onChange={e => setForms(c => ({ ...c, [key]: { ...values, feedback: e.target.value } }))} placeholder="Conte como foi (obrigatório)"/>
          <button className="dash-small-button" type="button" disabled={!values.rating || values.feedback.trim().length < 5 || busy === `review-${key}`} onClick={() => void submit(pending, target.id)}>{busy === `review-${key}` ? <Loader2 className="dash-spinner" size={14}/> : <Check size={14}/>} Enviar</button></div>;
      })}</div>)}</div>}
    </section>
    <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Sua reputação</span><h3>{data?.count ? <>{data.average.toFixed(1)} <Stars value={data.average}/> · {data.count} avaliação(ões) recebida(s)</> : "Histórico"}</h3></div></div>
      {!data?.reviews.length ? <EmptyState title="Nenhuma avaliação ainda" detail="Suas avaliações enviadas e recebidas aparecem aqui."/> : <div className="dash-record-list">{data.reviews.map(review => <article className="dash-record" key={review.id}><div><h4>{review.mine ? `Você avaliou ${review.targetName}` : `${review.reviewerName} avaliou você`}</h4><p>{review.feedback}</p><span>{review.eventTitle} · {formatDate(review.createdAt)}</span></div><strong className="dash-rating"><Star size={15}/> {review.rating}/5</strong></article>)}</div>}
    </section>
  </div>;
}

export function ContractsPanel() {
  const query = useApi<{ contracts: Contract[] }>("contracts", "/contracts");
  return <div className="dash-stack">
    <SectionIntro eyebrow="Documentos" title="Contratos gerados automaticamente." text="Quando o cliente aceita uma proposta, o contrato com os dados das duas partes, escopo, data, local, valor e forma de pagamento é gerado em PDF e fica disponível aqui para as duas partes e para a administração."/>
    <section className="dash-card">{query.isLoading ? <LoadingState/> : !query.data?.contracts.length ? <EmptyState title="Nenhum contrato ainda" detail="O contrato aparece assim que uma proposta for aceita."/> : <div className="dash-record-list">{query.data.contracts.map(c => <article className="dash-record" key={c.id}><div className="dash-record-main"><span className="dash-list-icon"><FileText size={17}/></span><div><h4>{c.title}</h4><p>{c.clientName} × {c.providerName}{c.amountCents ? ` · ${formatMoney(c.amountCents)}` : ""}</p><span>Gerado em {formatDate(c.createdAt, true)}</span></div></div><ContractButton id={c.id}/></article>)}</div>}</section>
  </div>;
}

export function SecurityPanel({ user }: { user: DashboardUser }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const { busy, run } = useAction();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordOk(form.next)) { toast.error("A nova senha não cumpre os requisitos."); return; }
    if (form.next !== form.confirm) { toast.error("As senhas não conferem."); return; }
    const ok = await run("password", () => post("/password/change", { current: form.current, next: form.next }), "Senha alterada. As outras sessões foram encerradas.");
    if (ok) setForm({ current: "", next: "", confirm: "" });
  };
  return <div className="dash-stack">
    <SectionIntro eyebrow="Segurança" title="Senha e acesso." text="Troque sua senha quando quiser. Se esquecer, use “Esqueci minha senha” na tela de login."/>
    <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">{user.email}</span><h3>Alterar senha</h3></div><KeyRound size={20}/></div>
      <form className="dash-form" onSubmit={submit}><div className="dash-form-grid">
        <Field label="Senha atual" type="password" value={form.current} onChange={v => setForm(f => ({ ...f, current: v }))} required/>
        <Field label="Nova senha" type="password" value={form.next} onChange={v => setForm(f => ({ ...f, next: v }))} required/>
        <Field label="Repita a nova senha" type="password" value={form.confirm} onChange={v => setForm(f => ({ ...f, confirm: v }))} required/>
      </div><PasswordRules value={form.next}/><SubmitButton loading={busy === "password"} label="Salvar nova senha"/></form>
    </section>
  </div>;
}
