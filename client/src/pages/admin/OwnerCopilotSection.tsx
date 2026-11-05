// Painel → Copilot do dono: o que precisa de atenção hoje (com ação pronta), resumo diário e chat.
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, Bot, Info, Loader2, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { brl, type BriefItem, type OwnerMetrics } from '@shared/ownerBrief';

type Brief = { metrics: OwnerMetrics; items: BriefItem[]; summary: string; daily: boolean; lastSent: string | null; aiEnabled: boolean };
type Msg = { role: 'user' | 'assistant'; content: string };

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir.');
const LEVEL = { urgent: { label: 'Urgente', icon: AlertTriangle }, attention: { label: 'Atenção', icon: Bell }, info: { label: 'Para saber', icon: Info } } as const;
const QUESTIONS = ['Quanto entrou de assinatura este mês?', 'Quantos profissionais ativos eu tenho?', 'Tem pedido sem proposta?', 'Quem está com o teste grátis acabando?'];

export function OwnerCopilotSection({ onNavigate }: { onNavigate: (section: string) => void }) {
  const [data, setData] = useState<Brief | null>(null);
  const [busy, setBusy] = useState('');
  const [chat, setChat] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = async () => { try { setData(await api<Brief>('/admin/brief')); } catch (e) { toast.error(errText(e)); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [chat, asking]);

  const runAction = async (item: BriefItem) => {
    if (!item.action) return;
    setBusy(item.id);
    try {
      const r = await api<{ sent: number; skipped: number }>('/admin/brief/action', { method: 'POST', body: JSON.stringify({ action: item.action.id, ids: item.action.ids }) });
      toast.success(r.sent ? `Pronto: ${r.sent} aviso(s) enviado(s).${r.skipped ? ` ${r.skipped} já tinham sido avisados nas últimas 24 h.` : ''}` : 'Todos já foram avisados nas últimas 24 h.');
      await load();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  const toggleDaily = async (daily: boolean) => {
    try { await api('/admin/brief/settings', { method: 'POST', body: JSON.stringify({ daily }) }); setData(d => d && { ...d, daily }); toast.success(daily ? 'Resumo diário ligado.' : 'Resumo diário desligado.'); } catch (e) { toast.error(errText(e)); }
  };
  const sendNow = async () => {
    setBusy('send');
    try { await api('/admin/brief/send', { method: 'POST' }); toast.success('Resumo enviado (painel e, se ligados em Notificações, e-mail e WhatsApp).'); await load(); } catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  const ask = async (text = draft) => {
    const message = text.trim();
    if (!message || asking) return;
    const history = chat.slice(-10);
    setChat(c => [...c, { role: 'user', content: message }]); setDraft(''); setAsking(true);
    try {
      const r = await api<{ reply: string }>('/admin/brief/chat', { method: 'POST', body: JSON.stringify({ message, history }) });
      setChat(c => [...c, { role: 'assistant', content: r.reply }]);
    } catch (e) { toast.error(errText(e)); setChat(c => c.slice(0, -1)); setDraft(message); } finally { setAsking(false); }
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void ask(); };

  if (!data) return <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div>;
  const m = data.metrics;
  const todo = data.items.filter(i => i.level !== 'info').length;

  return <div className="adm-stack">
    <div className="adm-stats oc-stats">
      <div><span>Profissionais ativos</span><strong>{m.activeProviders}</strong></div>
      <div className={m.eventsNoProposal.length ? 'is-alert' : ''}><span>Pedidos abertos</span><strong>{m.openEvents}</strong></div>
      <div><span>Assinaturas no mês</span><strong>{brl(m.revenueMonthCents)}</strong></div>
    </div>

    <section className="adm-card">
      <header className="adm-card-head"><h3 className="adm-auto-title"><Sparkles size={18}/>{todo ? `Hoje: ${todo} ${todo === 1 ? 'coisa precisa' : 'coisas precisam'} de você` : 'Tudo em dia ✅'}</h3></header>
      {!data.items.length && <p className="adm-muted">Nenhum alerta agora. O Copilot continua de olho e avisa no resumo diário.</p>}
      <ul className="oc-list">
        {data.items.map(item => { const L = LEVEL[item.level]; return <li key={item.id} className={`oc-item oc-${item.level}`}>
          <span className="oc-level"><L.icon size={14}/> {L.label}</span>
          <strong>{item.title}</strong>
          <p>{item.detail}</p>
          <div className="oc-actions">
            {item.action && <button type="button" className="ob-btn ob-btn-primary" disabled={!!busy} onClick={() => void runAction(item)}>{busy === item.id ? <Loader2 className="ob-spin" size={15}/> : <Send size={15}/>} {item.action.label}</button>}
            {item.section && <button type="button" className="ob-btn ob-btn-outline" onClick={() => onNavigate(item.section!.id)}>{item.section.label} <ArrowRight size={15}/></button>}
          </div>
        </li>; })}
      </ul>
      <p className="adm-hint">Os lembretes vão pelo painel e WhatsApp de cada pessoa e nunca se repetem em menos de 24 h. Aprovar, excluir e mudar preços continua sendo decisão sua.</p>
    </section>

    <section className="adm-card">
      <header className="adm-card-head"><h3 className="adm-auto-title"><Bell size={18}/>Resumo diário</h3><button type="button" className="ob-btn ob-btn-outline" disabled={!!busy} onClick={() => void sendNow()}>{busy === 'send' ? <Loader2 className="ob-spin" size={15}/> : <Send size={15}/>} Enviar agora</button></header>
      <pre className="oc-summary">{data.summary}</pre>
      <label className="adm-check"><input type="checkbox" checked={data.daily} onChange={e => void toggleDaily(e.target.checked)}/> Receber todo dia às 8h (painel; e-mail e WhatsApp conforme a aba Notificações)</label>
      {data.lastSent && <p className="adm-hint">Último envio: {data.lastSent.split('-').reverse().join('/')}</p>}
    </section>

    <section className="adm-card">
      <header className="adm-card-head"><h3 className="adm-auto-title"><Bot size={18}/>Pergunte ao Copilot</h3></header>
      {!data.aiEnabled && <p className="adm-hint">Respondendo pelas regras (números exatos). Com a IA grátis da Groq configurada, ele conversa de forma mais natural.</p>}
      <div className="oc-chat">
        {chat.map((msg, i) => <div key={i} className={`oc-msg oc-msg-${msg.role}`}>{msg.content}</div>)}
        {asking && <div className="oc-msg oc-msg-assistant"><Loader2 className="ob-spin" size={14}/> Pensando…</div>}
        <div ref={end}/>
      </div>
      {!chat.length && <div className="oc-chips">{QUESTIONS.map(q => <button key={q} type="button" onClick={() => void ask(q)}>{q}</button>)}</div>}
      <form className="oc-composer" onSubmit={onSubmit}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ex.: quantos clientes novos essa semana?" aria-label="Pergunta para o Copilot"/>
        <button type="submit" className="ob-btn ob-btn-primary" disabled={!draft.trim() || asking} aria-label="Perguntar"><Send size={15}/></button>
      </form>
    </section>
  </div>;
}
