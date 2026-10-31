import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, Link2, Lightbulb, Loader2, Plus, Search, Send, Sparkles, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir.');
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const toCents = (value: string) => Math.max(0, Math.round((Number(value.replace(/\./g, '').replace(',', '.')) || 0) * 100));
const centsText = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success('Copiado.'); } catch { toast.error('Não foi possível copiar.'); } };

function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="adm-card">{(title || action) && <header className="adm-card-head">{title && <h3>{title}</h3>}{action}</header>}{children}</section>;
}
const Empty = ({ text }: { text: string }) => <p className="adm-empty">{text}</p>;
const Spinner = () => <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div>;

// ------------------------------------------------------------------ Notificações

type Notice = { id: number; type: string; title: string; body: string; link: string; read: boolean; createdAt: string };
type NotifyStatus = { whatsapp: { configured: boolean; token: string; phoneNumberId: string; template: string; lang: string }; email: { configured: boolean; adminEmails: string; on: boolean }; adminWhatsappOn: boolean; origin: string };
const TYPE_LABEL: Record<string, string> = {
  'signup.client': 'Novo cliente', 'signup.provider': 'Novo profissional', 'provider.profile_completed': 'Aprovar cadastro', 'event.created': 'Pedido de orçamento',
  'proposal.new': 'Proposta', 'proposal.accepted': 'Serviço fechado', 'payment.subscription': 'Assinatura paga', 'payment.promotion': 'Promoção paga', 'payment.benefit': 'Benefício pago', 'review.new': 'Avaliação',
};

export function NotificationsSection() {
  const [list, setList] = useState<Notice[] | null>(null);
  const [status, setStatus] = useState<NotifyStatus | null>(null);
  const [form, setForm] = useState({ waToken: '', waPhoneNumberId: '', waTemplate: '', waLang: 'pt_BR', adminEmails: '' });
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState('');
  const load = () => api<{ notifications: Notice[] }>('/admin/notifications').then(r => setList(r.notifications)).catch(e => toast.error(errText(e)));
  useEffect(() => {
    void load();
    api<NotifyStatus>('/admin/notifications/settings').then(r => { setStatus(r); setForm(f => ({ ...f, waPhoneNumberId: r.whatsapp.phoneNumberId, waTemplate: r.whatsapp.template, waLang: r.whatsapp.lang || 'pt_BR', adminEmails: r.email.adminEmails })); }).catch(e => toast.error(errText(e)));
    void api('/admin/notifications/read', { method: 'POST' }).catch(() => undefined);
  }, []);
  const save = async (patch: Record<string, unknown>, label: string) => {
    setBusy(label);
    try { const r = await api<NotifyStatus>('/admin/notifications/settings', { method: 'PUT', body: JSON.stringify(patch) }); setStatus(r); setForm(f => ({ ...f, waToken: '' })); toast.success('Configuração salva.'); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  const test = async () => {
    setBusy('test');
    try { const r = await api<{ whatsapp: boolean; email: boolean }>('/admin/notifications/test', { method: 'POST' }); toast[r.whatsapp || r.email ? 'success' : 'error'](`WhatsApp: ${r.whatsapp ? 'enviado' : 'não enviado'} · E-mail: ${r.email ? 'enviado' : 'não enviado'}`); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  const types = useMemo(() => [...new Set((list ?? []).map(n => n.type))], [list]);
  const shown = (list ?? []).filter(n => !filter || n.type === filter);
  return <div className="adm-stack">
    <Card title="Tudo o que acontece na plataforma" action={<select className="adm-select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filtrar"><option value="">Todos os avisos</option>{types.map(t => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}</select>}>
      <p className="adm-muted">Novos clientes e profissionais, cadastros para aprovar, pedidos de orçamento, propostas, serviços fechados, avaliações e pagamentos. O sino no topo mostra os avisos novos.</p>
      {!list ? <Spinner/> : !shown.length ? <Empty text="Nenhum aviso ainda."/> : <div className="adm-list">{shown.map(n => <div className="adm-row adm-row-static" key={n.id}>
        <div className="adm-row-main"><strong>{n.title}</strong><span className="adm-wrap">{n.body}</span></div>
        <div className="adm-row-tags"><span className="adm-tag">{TYPE_LABEL[n.type] ?? n.type}</span><small className="adm-muted">{new Date(n.createdAt).toLocaleString('pt-BR')}</small></div>
      </div>)}</div>}
    </Card>
    <Card title="Como você e os usuários recebem os avisos" action={<button type="button" className="ob-btn ob-btn-outline" disabled={busy === 'test'} onClick={() => void test()}>{busy === 'test' ? <Loader2 className="ob-spin" size={16}/> : <Send size={16}/>} Enviar teste para mim</button>}>
      {!status ? <Spinner/> : <div className="adm-content-fields">
        <div className="adm-content-field"><div className="adm-content-label"><span>E-mail para a administração</span>{status.email.configured ? <span className="adm-tag adm-ok">Envio de e-mail ligado</span> : <span className="adm-tag adm-warn">Falta RESEND_API_KEY e MAIL_FROM no Render</span>}</div>
          <div className="adm-svc-add"><input value={form.adminEmails} placeholder="seu@email.com (separe vários por vírgula)" onChange={e => setForm({ ...form, adminEmails: e.target.value })}/><button type="button" className="ob-btn ob-btn-outline" onClick={() => void save({ adminEmails: form.adminEmails }, 'emails')}>Salvar</button></div>
          <label className="adm-switch"><input type="checkbox" checked={status.email.on} onChange={e => void save({ adminEmailOn: e.target.checked }, 'emailOn')}/> Receber os avisos por e-mail</label></div>
        <div className="adm-content-field"><div className="adm-content-label"><span>WhatsApp (API oficial do WhatsApp Business)</span>{status.whatsapp.configured ? <span className="adm-tag adm-ok">Ligado {status.whatsapp.token}</span> : <span className="adm-tag adm-warn">Não configurado</span>}</div>
          <p className="adm-muted">Com o WhatsApp ligado: clientes recebem propostas e respostas, profissionais recebem novos pedidos, e cada mensagem traz um link que <strong>entra direto no site já logado</strong> (vale 7 dias). Você recebe os avisos no WhatsApp da administração (Textos do site → Contato).</p>
          <ol className="adm-help-list">
            <li>Em <strong>business.facebook.com → WhatsApp Manager</strong>, cadastre um número só para a plataforma.</li>
            <li>Crie um <strong>modelo de mensagem</strong> (categoria “Utilidade”, idioma Português (BR)) com o texto:<br/><code>{'Olá! {{1}}\n{{2}}\nAcesse: {{3}}'}</code></li>
            <li>Depois de aprovado, copie o <strong>token permanente</strong>, o <strong>ID do número de telefone</strong> e o <strong>nome do modelo</strong> para cá.</li>
          </ol>
          <div className="adm-grid-3">
            <label className="ob-field"><span>Token de acesso</span><input type="password" autoComplete="off" value={form.waToken} placeholder={status.whatsapp.token || 'EAAG…'} onChange={e => setForm({ ...form, waToken: e.target.value })}/></label>
            <label className="ob-field"><span>ID do número de telefone</span><input inputMode="numeric" value={form.waPhoneNumberId} onChange={e => setForm({ ...form, waPhoneNumberId: e.target.value.replace(/\D/g, '') })}/></label>
            <label className="ob-field"><span>Nome do modelo</span><input value={form.waTemplate} placeholder="aviso_gastroconecta" onChange={e => setForm({ ...form, waTemplate: e.target.value.toLowerCase() })}/></label>
          </div>
          <div className="adm-svc-add"><button type="button" className="ob-btn ob-btn-primary" disabled={busy === 'wa'} onClick={() => void save({ ...(form.waToken ? { waToken: form.waToken.trim() } : {}), waPhoneNumberId: form.waPhoneNumberId, waTemplate: form.waTemplate.trim(), waLang: form.waLang }, 'wa')}>{busy === 'wa' ? <Loader2 className="ob-spin" size={16}/> : <Check size={16}/>} Salvar WhatsApp</button></div>
          <label className="adm-switch"><input type="checkbox" checked={status.adminWhatsappOn} onChange={e => void save({ adminWhatsappOn: e.target.checked }, 'waOn')}/> Também receber os avisos da administração no WhatsApp</label></div>
      </div>}
    </Card>
  </div>;
}

// ------------------------------------------------------------------ Marketing

type Report = {
  days: number;
  totals: { visits: number; visitors: number; clients: number; providers: number; requests: number; proposals: number; closed: number; revenueCents: number; signupConversion: number; referrals: number; growth: { visits: number | null; signups: number | null; requests: number | null } };
  series: Array<{ day: string; visits: number; clients: number; providers: number; requests: number; proposals: number; revenueCents: number }>;
  sources: Array<{ channel: string; channelLabel: string; medium: string; mediumLabel: string; visits: number; visitors: number; clients: number; providers: number; conversion: number }>;
  campaigns: Array<{ name: string; count: number }>;
  hours: Array<{ hour: number; visits: number; requests: number }>;
  weekdays: Array<{ name: string; visits: number; requests: number }>;
  terms: Array<{ term: string; count: number }>; categories: Array<{ name: string; count: number }>; requested: Array<{ name: string; count: number }>;
  cities: Array<{ city: string; demand: number; providers: number }>;
  critical: Array<{ level: 'alto' | 'medio'; title: string; detail: string }>;
  suggestions: Array<{ area: string; title: string; detail: string }>;
};

function Kpi({ label, value, growth }: { label: string; value: string; growth?: number | null }) {
  return <div className="mk-kpi"><span>{label}</span><strong>{value}</strong>{growth !== undefined && growth !== null && <small className={growth >= 0 ? 'up' : 'down'}>{growth >= 0 ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} {growth > 0 ? '+' : ''}{growth}% vs. período anterior</small>}</div>;
}
const shortDay = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
const COLORS = { a: '#df572f', b: '#2f6f4f', c: '#c99a2e', d: '#4f6bb0' };

export function MarketingSection() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Report | null>(null);
  const [plan, setPlan] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setData(null); api<Report>(`/admin/marketing?dias=${days}`).then(setData).catch(e => toast.error(errText(e))); }, [days]);
  const ai = async () => {
    setBusy(true);
    try { const r = await api<{ plan: string }>('/admin/marketing/ai', { method: 'POST' }); setPlan(r.plan); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const origin = window.location.origin;
  const links = [
    { name: 'Bio do Instagram', url: `${origin}/?utm_source=instagram&utm_medium=organico&utm_campaign=bio` },
    { name: 'Posts e Stories do Instagram', url: `${origin}/orcamento?utm_source=instagram&utm_medium=organico&utm_campaign=post` },
    { name: 'Página do Facebook', url: `${origin}/?utm_source=facebook&utm_medium=organico&utm_campaign=pagina` },
    { name: 'Anúncio Meta (Facebook/Instagram)', url: `${origin}/orcamento?utm_source=instagram&utm_medium=paid_social&utm_campaign=anuncio-clientes` },
    { name: 'Anúncio para atrair profissionais', url: `${origin}/para-profissionais?utm_source=facebook&utm_medium=paid_social&utm_campaign=anuncio-profissionais` },
    { name: 'Google Ads (link patrocinado)', url: `${origin}/orcamento?utm_source=google&utm_medium=cpc&utm_campaign=pesquisa` },
    { name: 'Google Meu Negócio', url: `${origin}/?utm_source=google&utm_medium=organico&utm_campaign=meu-negocio` },
    { name: 'Grupos de WhatsApp', url: `${origin}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=grupos` },
  ];
  const series = data?.series.map(s => ({ ...s, label: shortDay(s.day), cadastros: s.clients + s.providers, receita: s.revenueCents / 100 })) ?? [];
  const sourceChart = data?.sources.slice(0, 8).map(s => ({ name: `${s.channelLabel.split(' (')[0]} · ${s.mediumLabel.split(' /')[0]}`, Visitas: s.visits, Cadastros: s.clients + s.providers })) ?? [];
  return <div className="adm-stack">
    <div className="mk-toolbar"><div className="adm-tabs">{[7, 30, 90].map(d => <button key={d} type="button" className={d === days ? 'is-active' : ''} onClick={() => setDays(d)}>Últimos {d} dias</button>)}</div></div>
    {!data ? <Spinner/> : <>
      <div className="mk-kpis">
        <Kpi label="Visitas" value={data.totals.visits.toLocaleString('pt-BR')} growth={data.totals.growth.visits}/>
        <Kpi label="Novos clientes" value={String(data.totals.clients)} growth={data.totals.growth.signups}/>
        <Kpi label="Novos profissionais" value={String(data.totals.providers)}/>
        <Kpi label="Pedidos de orçamento" value={String(data.totals.requests)} growth={data.totals.growth.requests}/>
        <Kpi label="Serviços fechados" value={String(data.totals.closed)}/>
        <Kpi label="Receita (assinaturas e extras)" value={brl(data.totals.revenueCents)}/>
        <Kpi label="Visitantes que se cadastram" value={`${data.totals.signupConversion}%`}/>
        <Kpi label="Cadastros por indicação" value={String(data.totals.referrals)}/>
      </div>

      <Card title="Pontos críticos">
        {!data.critical.length ? <p className="mk-ok"><Check size={16}/> Nenhum ponto crítico agora.</p> : <ul className="mk-alerts">{data.critical.map((c, i) => <li key={i} className={`mk-${c.level}`}><AlertTriangle size={17}/><div><strong>{c.title}</strong><span>{c.detail}</span></div></li>)}</ul>}
      </Card>

      <Card title="Sugestões automáticas" action={<button type="button" className="ob-btn ob-btn-primary" disabled={busy} onClick={() => void ai()}>{busy ? <Loader2 className="ob-spin" size={16}/> : <Sparkles size={16}/>} Gerar plano de marketing com IA</button>}>
        <ul className="mk-tips">{data.suggestions.map((s, i) => <li key={i}><Lightbulb size={17}/><div><span className="adm-tag">{s.area}</span><strong>{s.title}</strong><span>{s.detail}</span></div></li>)}</ul>
        {plan && <div className="mk-plan"><header><strong><Sparkles size={15}/> Plano sugerido pela IA (com base nos seus números)</strong><button type="button" onClick={() => setPlan('')} aria-label="Fechar"><X size={16}/></button></header><pre>{plan}</pre></div>}
      </Card>

      <Card title="Crescimento da plataforma">
        <div className="mk-chart"><ResponsiveContainer width="100%" height={260}><LineChart data={series}><CartesianGrid strokeDasharray="3 3" stroke="#eee8dd"/><XAxis dataKey="label" fontSize={11} minTickGap={16}/><YAxis fontSize={11} allowDecimals={false}/><Tooltip/><Legend/><Line type="monotone" dataKey="visits" name="Visitas" stroke={COLORS.d} dot={false}/><Line type="monotone" dataKey="cadastros" name="Cadastros" stroke={COLORS.a} dot={false}/><Line type="monotone" dataKey="requests" name="Pedidos" stroke={COLORS.b} dot={false}/><Line type="monotone" dataKey="proposals" name="Propostas" stroke={COLORS.c} dot={false}/></LineChart></ResponsiveContainer></div>
      </Card>

      <Card title="De onde vêm os clientes e profissionais">
        {!data.sources.length ? <Empty text="Ainda sem visitas registradas. Use os links marcados abaixo nas suas divulgações."/> : <>
          <div className="mk-chart"><ResponsiveContainer width="100%" height={Math.max(180, sourceChart.length * 38)}><BarChart data={sourceChart} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#eee8dd"/><XAxis type="number" fontSize={11} allowDecimals={false}/><YAxis type="category" dataKey="name" width={170} fontSize={11}/><Tooltip/><Legend/><Bar dataKey="Visitas" fill={COLORS.d}/><Bar dataKey="Cadastros" fill={COLORS.a}/></BarChart></ResponsiveContainer></div>
          <div className="mk-table" role="table"><div role="row" className="mk-tr mk-th"><span>Canal</span><span>Tipo</span><span>Visitas</span><span>Clientes</span><span>Profissionais</span><span>Conversão</span></div>{data.sources.map(s => <div role="row" className="mk-tr" key={s.channel + s.medium}><span>{s.channelLabel}</span><span>{s.mediumLabel}</span><span>{s.visits}</span><span>{s.clients}</span><span>{s.providers}</span><span>{s.conversion}%</span></div>)}</div>
          {data.campaigns.length > 0 && <p className="adm-muted">Campanhas: {data.campaigns.map(c => `${c.name} (${c.count})`).join(' · ')}</p>}
        </>}
      </Card>

      <div className="mk-two">
        <Card title="Melhores horários">
          <div className="mk-chart"><ResponsiveContainer width="100%" height={220}><BarChart data={data.hours.map(h => ({ hora: `${String(h.hour).padStart(2, '0')}h`, Visitas: h.visits, Pedidos: h.requests }))}><CartesianGrid strokeDasharray="3 3" stroke="#eee8dd"/><XAxis dataKey="hora" fontSize={10} interval={2}/><YAxis fontSize={11} allowDecimals={false}/><Tooltip/><Bar dataKey="Visitas" fill={COLORS.d}/><Bar dataKey="Pedidos" fill={COLORS.b}/></BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Melhores dias da semana">
          <div className="mk-chart"><ResponsiveContainer width="100%" height={220}><BarChart data={data.weekdays.map(w => ({ dia: w.name.slice(0, 3), Visitas: w.visits, Pedidos: w.requests }))}><CartesianGrid strokeDasharray="3 3" stroke="#eee8dd"/><XAxis dataKey="dia" fontSize={11}/><YAxis fontSize={11} allowDecimals={false}/><Tooltip/><Bar dataKey="Visitas" fill={COLORS.d}/><Bar dataKey="Pedidos" fill={COLORS.b}/></BarChart></ResponsiveContainer></div>
        </Card>
      </div>

      <div className="mk-two">
        <Card title="O que as pessoas estão buscando">
          {!data.terms.length && !data.categories.length ? <Empty text="Ainda sem buscas no período."/> : <ul className="mk-rank">{[...data.categories.map(c => ({ label: c.name, count: c.count, kind: 'serviço' })), ...data.terms.map(t => ({ label: `“${t.term}”`, count: t.count, kind: 'busca' }))].slice(0, 14).map((t, i) => <li key={i}><span>{t.label} <small>{t.kind}</small></span><strong>{t.count}</strong></li>)}</ul>}
        </Card>
        <Card title="Serviços mais pedidos">
          {!data.requested.length ? <Empty text="Ainda sem pedidos no período."/> : <ul className="mk-rank">{data.requested.map(r => <li key={r.name}><span>{r.name}</span><strong>{r.count}</strong></li>)}</ul>}
        </Card>
      </div>

      <Card title="Procura x profissionais por cidade">
        {!data.cities.length ? <Empty text="Ainda sem pedidos ou buscas com cidade."/> : <ul className="mk-rank">{data.cities.map(c => <li key={c.city} className={c.providers === 0 ? 'mk-missing' : ''}><span>{c.city.replace(/\b\p{L}/gu, l => l.toUpperCase())} <small>{c.providers} profissional(is) ativo(s)</small></span><strong>{c.demand} procura(s)</strong></li>)}</ul>}
      </Card>
    </>}

    <Card title="Links marcados para divulgação (saber de onde vem cada cliente)">
      <p className="adm-muted">Use estes links nas suas publicações e anúncios. O painel separa automaticamente Google, Facebook, Instagram, WhatsApp, anúncio (patrocinado) e orgânico. Profissionais e clientes também têm o próprio link de divulgação no painel deles.</p>
      <ul className="mk-links">{links.map(l => <li key={l.name}><span><Link2 size={14}/> {l.name}</span><code>{l.url}</code><button type="button" className="ob-btn ob-btn-outline" onClick={() => void copy(l.url)}><Copy size={14}/> Copiar</button></li>)}</ul>
    </Card>
  </div>;
}

// ------------------------------------------------------------------ Pagamentos: valor da assinatura e cortesias

type PricingRow = { id: number; name: string; email: string; code: string; discountPercent: number; free: boolean };

export function PricingCard() {
  const [data, setData] = useState<{ priceCents: number; providers: PricingRow[] } | null>(null);
  const [price, setPrice] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const load = () => api<{ priceCents: number; providers: PricingRow[] }>('/admin/payments/pricing').then(r => { setData(r); setPrice(centsText(r.priceCents)); }).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const savePrice = async () => {
    setBusy('price');
    try { await api('/admin/payments/pricing', { method: 'PUT', body: JSON.stringify({ priceCents: toCents(price) }) }); toast.success('Valor da assinatura atualizado para todos.'); await load(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  const patch = async (row: PricingRow, body: { free?: boolean; discountPercent?: number }) => {
    setBusy(`p-${row.id}`);
    try { await api(`/admin/users/${row.id}/subscription-pricing`, { method: 'PATCH', body: JSON.stringify(body) }); setData(d => d && ({ ...d, providers: d.providers.map(p => p.id === row.id ? { ...p, ...body } : p) })); toast.success('Atualizado.'); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  const q = search.trim().toLowerCase();
  const list = (data?.providers ?? []).filter(p => !q || `${p.name} ${p.email} ${p.code}`.toLowerCase().includes(q));
  const special = (data?.providers ?? []).filter(p => p.free || p.discountPercent > 0).length;
  return <Card title="Valor da assinatura dos profissionais">
    {!data ? <Spinner/> : <div className="adm-content-fields">
      <p className="adm-muted">Só profissionais e fornecedores pagam. Clientes usam de graça. O valor abaixo vale para todos; você pode dar <strong>acesso grátis</strong> ou <strong>desconto</strong> para quem quiser.</p>
      <div className="adm-content-field"><div className="adm-content-label"><span>Assinatura mensal (R$)</span></div>
        <div className="adm-svc-add"><input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)}/><button type="button" className="ob-btn ob-btn-primary" disabled={busy === 'price'} onClick={() => void savePrice()}>{busy === 'price' ? <Loader2 className="ob-spin" size={16}/> : <Check size={16}/>} Salvar valor</button></div>
        <small className="adm-muted">Vale para as próximas cobranças. Quem já autorizou o Pix automático continua no valor autorizado até renovar a autorização.</small></div>
      <div className="adm-content-field"><div className="adm-content-label"><span>Acesso grátis ou desconto por profissional ({special} com condição especial)</span></div>
        <label className="adm-search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar profissional por nome, e-mail ou código GC-"/></label>
        {!list.length ? <Empty text="Nenhum profissional encontrado."/> : <div className="adm-list mk-scroll">{list.map(p => <div className="adm-row adm-row-static" key={p.id}>
          <div className="adm-row-main"><strong>{p.name}</strong><span>{p.code} · {p.email}</span></div>
          <div className="adm-row-tags"><span className={`adm-tag ${p.free ? 'adm-ok' : p.discountPercent ? 'adm-vip' : ''}`}>{p.free ? 'Grátis' : p.discountPercent ? `${p.discountPercent}% de desconto → ${brl(Math.round(data.priceCents * (1 - p.discountPercent / 100)))}` : brl(data.priceCents)}</span></div>
          <div className="adm-row-actions mk-price-actions">
            <label className="adm-switch"><input type="checkbox" checked={p.free} disabled={busy === `p-${p.id}`} onChange={e => void patch(p, { free: e.target.checked })}/> Grátis</label>
            {!p.free && <select value={p.discountPercent} disabled={busy === `p-${p.id}`} onChange={e => void patch(p, { discountPercent: Number(e.target.value) })} aria-label="Desconto">{[0, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90].map(v => <option key={v} value={v}>{v ? `${v}% desc.` : 'Sem desconto'}</option>)}</select>}
          </div>
        </div>)}</div>}</div>
    </div>}
  </Card>;
}

// ------------------------------------------------------------------ Pagamentos: benefícios extras pagos

type Product = { id: number; title: string; description: string; priceCents: number; days: number; effect: 'featured' | 'none'; active: boolean; sortOrder: number };
const emptyProduct = { title: '', description: '', price: '', days: '30', effect: 'featured' as Product['effect'], active: true, sortOrder: 0 };

export function BenefitProductsCard() {
  const [list, setList] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<(typeof emptyProduct & { id?: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ products: Product[] }>('/admin/benefit-products').then(r => setList(r.products)).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const payload = (p: typeof emptyProduct) => ({ title: p.title.trim(), description: p.description.trim(), priceCents: toCents(p.price), days: Math.max(1, Number(p.days) || 30), effect: p.effect, active: p.active, sortOrder: Number(p.sortOrder) || 0 });
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try { const { id, ...rest } = editing; await api(id ? `/admin/benefit-products/${id}` : '/admin/benefit-products', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload(rest)) }); toast.success('Benefício salvo.'); setEditing(null); await load(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const remove = async (p: Product) => { if (!confirm(`Excluir o benefício “${p.title}”?`)) return; try { await api(`/admin/benefit-products/${p.id}`, { method: 'DELETE' }); await load(); } catch (e) { toast.error(errText(e)); } };
  return <Card title="Benefícios extras (valores adicionais para profissionais)" action={<button type="button" className="ob-btn ob-btn-primary" onClick={() => setEditing({ ...emptyProduct })}><Plus size={16}/> Novo benefício</button>}>
    <p className="adm-muted">Vantagens que o profissional compra à parte pelo painel dele (Pix), como <strong>destaque no catálogo</strong> por alguns dias. A promoção da temporada tem o adicional próprio na aba Promoções.</p>
    {!list ? <Spinner/> : !list.length ? <Empty text="Nenhum benefício extra cadastrado."/> : <div className="adm-list">{list.map(p => <div className="adm-row adm-row-static" key={p.id}>
      <div className="adm-row-main"><strong>{p.title}</strong><span>{brl(p.priceCents)} · {p.days} dia(s) · {p.effect === 'featured' ? 'destaque no catálogo' : 'benefício manual'}</span></div>
      <div className="adm-row-tags"><span className={`adm-tag ${p.active ? 'adm-ok' : 'adm-warn'}`}>{p.active ? 'À venda' : 'Pausado'}</span></div>
      <div className="adm-row-actions"><button type="button" onClick={() => setEditing({ id: p.id, title: p.title, description: p.description, price: centsText(p.priceCents), days: String(p.days), effect: p.effect, active: p.active, sortOrder: p.sortOrder })}>Editar</button><button type="button" className="danger" onClick={() => void remove(p)} aria-label="Excluir"><Trash2 size={15}/></button></div>
    </div>)}</div>}
    {editing && <div className="mk-form">
      <div className="adm-grid-3">
        <label className="ob-field"><span>Nome</span><input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Ex.: Destaque no catálogo por 7 dias"/></label>
        <label className="ob-field"><span>Valor (R$)</span><input inputMode="decimal" value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} placeholder="29,90"/></label>
        <label className="ob-field"><span>Duração (dias)</span><input inputMode="numeric" value={editing.days} onChange={e => setEditing({ ...editing, days: e.target.value.replace(/\D/g, '') })}/></label>
        <label className="ob-field"><span>O que acontece ao pagar</span><select value={editing.effect} onChange={e => setEditing({ ...editing, effect: e.target.value as Product['effect'] })}><option value="featured">Fica em destaque no catálogo (automático)</option><option value="none">Benefício combinado (você aplica manualmente)</option></select></label>
        <label className="ob-field ob-wide"><span>Descrição para o profissional</span><textarea rows={2} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })}/></label>
        <label className="adm-switch"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })}/> À venda</label>
      </div>
      <div className="adm-svc-add"><button type="button" className="ob-btn ob-btn-primary" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="ob-spin" size={16}/> : <Check size={16}/>} Salvar benefício</button><button type="button" className="ob-btn ob-btn-outline" onClick={() => setEditing(null)}>Cancelar</button></div>
    </div>}
  </Card>;
}
