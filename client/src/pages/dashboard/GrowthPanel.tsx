import { Award, Check, Copy, Gem, Lock, Loader2, Megaphone, RefreshCw, Sparkles, Star, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, formatDate, formatMoney, LoadingState, post, SectionIntro, useAction, useApi } from "./common";

type Pix = { qrCode: string; qrCodeBase64: string; ticketUrl: string; expiresAt: string | null };
type Growth = {
  level: { level: "baixo" | "medio" | "alto"; label: string; average: number; count: number; hint: string };
  messages: Record<"baixo" | "medio" | "alto", string>;
  benefits: Record<"baixo" | "medio" | "alto", string[]>;
  eligible: boolean;
  paymentsConfigured: boolean;
  promotions: Array<{ id: number; title: string; badge: string; text: string; imageUrl?: string; start: string; end: string; feeCents: number; joined: boolean; validUntil: string | null; pendingPix: Pix | null }>;
};

const STEPS = ["baixo", "medio", "alto"] as const;
const STEP_LABEL = { baixo: "BAIXO", medio: "MÉDIO", alto: "ALTO" };
const md = (v: string) => v.split("-").reverse().join("/");

/** Nível do profissional (BAIXO / MÉDIO / ALTO) e promoções da temporada. */
export function GrowthPanel() {
  const query = useApi<Growth>("growth", "/provider/growth");
  const { busy, run } = useAction();
  if (query.isLoading || !query.data) return query.isLoading ? <LoadingState/> : <EmptyState title="Não foi possível carregar" detail="Tente novamente em instantes."/>;
  const g = query.data;
  const current = g.level.level;
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success("Código Pix copiado."); } catch { toast.error("Não foi possível copiar."); } };
  return <div className="dash-stack">
    <SectionIntro eyebrow="Seu nível na plataforma" title={`Nível ${g.level.label}`} text={g.messages[current]}/>
    <section className="dash-card gr-level">
      <div className="gr-steps" role="list">{STEPS.map(step => <div role="listitem" key={step} className={`gr-step gr-${step} ${step === current ? "is-current" : ""} ${STEPS.indexOf(step) < STEPS.indexOf(current) ? "is-done" : ""}`}><span>{STEPS.indexOf(step) < STEPS.indexOf(current) ? <Check size={14}/> : STEPS.indexOf(step) + 1}</span><strong>{STEP_LABEL[step]}</strong></div>)}</div>
      <div className="gr-stats"><span><Star size={16} fill="currentColor"/> Média <strong>{g.level.count ? g.level.average.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</strong></span><span><Award size={16}/> <strong>{g.level.count}</strong> avaliação(ões)</span></div>
      {g.level.hint && <p className="gr-hint"><TrendingUp size={16}/> {g.level.hint}</p>}
      <div className="gr-benefits">
        {(["medio", "alto"] as const).map(step => <div key={step} className={`gr-benefit-box ${STEPS.indexOf(current) >= STEPS.indexOf(step) ? "is-unlocked" : ""}`}>
          <strong>{STEPS.indexOf(current) >= STEPS.indexOf(step) ? <Sparkles size={15}/> : <Lock size={15}/>} Benefícios do nível {STEP_LABEL[step]}</strong>
          {g.benefits[step].length ? <ul>{g.benefits[step].map(b => <li key={b}>{b}</li>)}</ul> : <p className="dash-muted">Em breve.</p>}
        </div>)}
      </div>
      <p className="dash-muted gr-note">O nível é calculado pelas avaliações reais dos clientes e conferido pela administração. Atenda bem e peça a avaliação depois de cada serviço.</p>
    </section>

    <section className="dash-card">
      <div className="dash-card-heading"><div><span className="dash-eyebrow"><Megaphone size={13}/> Promoções da temporada</span><h3>Apareça para quem clica nas promoções</h3><p className="dash-muted">Os clientes que clicam numa promoção da página inicial veem a lista de fornecedores participantes e escolhem com quem fechar.</p></div></div>
      {!g.promotions.length ? <EmptyState title="Nenhuma promoção no ar agora" detail="Quando uma promoção da temporada começar, ela aparece aqui."/> : <div className="dash-record-list">{g.promotions.map(p => <article className="dash-record gr-promo" key={p.id}>
        <div className="dash-record-main">{p.imageUrl ? <img className="gr-promo-img" src={p.imageUrl} alt=""/> : <span className="dash-list-icon orange"><Megaphone size={17}/></span>}<div><h4>{p.title}</h4><p>{p.badge} · de {md(p.start)} a {md(p.end)}</p><span>{p.text}</span></div></div>
        <div className="dash-record-actions">
          {p.joined ? <span className="dash-status dash-status-accepted"><Check size={13}/> Participando{p.validUntil ? ` até ${formatDate(p.validUntil)}` : ""}</span>
            : !g.eligible ? <span className="dash-status dash-status-pending"><Lock size={13}/> Exclusivo do nível ALTO</span>
            : p.pendingPix ? <span className="dash-status dash-status-pending">Aguardando o Pix</span>
            : <><strong>{p.feeCents > 0 ? formatMoney(p.feeCents) : "Sem custo"}</strong><button type="button" className="dash-small-button" disabled={busy === `join-${p.id}` || (p.feeCents > 0 && !g.paymentsConfigured)} onClick={() => void run(`join-${p.id}`, () => post(`/provider/promotions/${p.id}/join`), p.feeCents > 0 ? "Pix gerado. Pague para entrar na promoção." : "Pronto! Você já aparece nesta promoção.")}>{busy === `join-${p.id}` ? <Loader2 className="dash-spinner" size={14}/> : <Sparkles size={14}/>} {p.feeCents > 0 ? "Participar (pagar via Pix)" : "Participar"}</button></>}
        </div>
        {p.pendingPix?.qrCode && !p.joined && <div className="dash-pix gr-pix">
          {p.pendingPix.qrCodeBase64 && <img src={`data:image/png;base64,${p.pendingPix.qrCodeBase64}`} alt="QR Code Pix" width={170} height={170}/>}
          <div><p>Adicional da promoção: pague com o QR Code ou o Pix copia e cola. A confirmação é automática.</p><code className="dash-pix-code">{p.pendingPix.qrCode}</code>
            <div className="cp-actions"><button type="button" className="dash-small-button" onClick={() => void copy(p.pendingPix!.qrCode)}><Copy size={14}/> Copiar código</button><button type="button" className="dash-small-button" disabled={busy === "promo-refresh"} onClick={() => void run("promo-refresh", () => post("/provider/promotions/refresh"))}><RefreshCw size={14}/> Já paguei, verificar</button></div></div>
        </div>}
      </article>)}</div>}
      {g.eligible && !g.paymentsConfigured && g.promotions.some(p => p.feeCents > 0 && !p.joined) && <p className="dash-muted">O pagamento por Pix ainda não está disponível. Fale com a administração.</p>}
    </section>
    <ExtraBenefits/>
  </div>;
}

type BenefitProduct = { id: number; title: string; description: string; priceCents: number; days: number; effect: string; pendingPix: Pix | null };

/** Benefícios extras que o profissional compra à parte (ex.: destaque no catálogo). */
function ExtraBenefits() {
  const query = useApi<{ paymentsConfigured: boolean; products: BenefitProduct[] }>("benefit-products", "/provider/benefits");
  const { busy, run } = useAction();
  const products = query.data?.products ?? [];
  if (!products.length) return null;
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success("Código Pix copiado."); } catch { toast.error("Não foi possível copiar."); } };
  return <section className="dash-card">
    <div className="dash-card-heading"><div><span className="dash-eyebrow"><Gem size={13}/> Benefícios extras</span><h3>Mais visibilidade quando você precisar</h3><p className="dash-muted">Vantagens opcionais, pagas à parte via Pix. A confirmação é automática.</p></div></div>
    <div className="dash-record-list">{products.map(p => <article className="dash-record gr-promo" key={p.id}>
      <div className="dash-record-main"><span className="dash-list-icon orange"><Gem size={17}/></span><div><h4>{p.title}</h4><p>{p.days} dia(s){p.effect === "featured" ? " · destaque no catálogo" : ""}</p>{p.description && <span>{p.description}</span>}</div></div>
      <div className="dash-record-actions">{p.pendingPix ? <span className="dash-status dash-status-pending">Aguardando o Pix</span> : <><strong>{formatMoney(p.priceCents)}</strong><button type="button" className="dash-small-button" disabled={!query.data?.paymentsConfigured || busy === `buy-${p.id}`} onClick={() => void run(`buy-${p.id}`, () => post(`/provider/benefits/${p.id}/buy`), "Pix gerado. Pague para ativar o benefício.")}>{busy === `buy-${p.id}` ? <Loader2 className="dash-spinner" size={14}/> : <Sparkles size={14}/>} Quero este</button></>}</div>
      {p.pendingPix?.qrCode && <div className="dash-pix gr-pix">
        {p.pendingPix.qrCodeBase64 && <img src={`data:image/png;base64,${p.pendingPix.qrCodeBase64}`} alt="QR Code Pix" width={170} height={170}/>}
        <div><p>Pague com o QR Code ou o Pix copia e cola.</p><code className="dash-pix-code">{p.pendingPix.qrCode}</code>
          <div className="cp-actions"><button type="button" className="dash-small-button" onClick={() => void copy(p.pendingPix!.qrCode)}><Copy size={14}/> Copiar código</button><button type="button" className="dash-small-button" disabled={busy === "benefit-refresh"} onClick={() => void run("benefit-refresh", () => post("/provider/promotions/refresh"))}><RefreshCw size={14}/> Já paguei, verificar</button></div></div>
      </div>}
    </article>)}</div>
    {!query.data?.paymentsConfigured && <p className="dash-muted">O pagamento por Pix ainda não está disponível. Fale com a administração.</p>}
  </section>;
}
