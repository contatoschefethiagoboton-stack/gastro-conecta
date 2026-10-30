import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { BadgePercent, Check, ChevronRight, Copy, CreditCard, Download, ExternalLink, FileSignature, FileText, Gift, ScanFace, Image as ImageIcon, KeyRound, LayoutDashboard, Loader2, LogOut, Menu, Megaphone, PenLine, Plus, RotateCcw, ScrollText, Search, Trash2, Upload, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { uploadFile } from '@/lib/upload';
import type { ContentField } from '@shared/content';
import { EVENT_TYPES } from '@shared/promotions';
import { formatCEP, formatCNPJ, formatCPF, formatPhone } from '@shared/validators';
import { serviceCatalogFrom, serviceLabel, REQUEST_CATEGORIES, SERVICE_ICONS, type ServiceCategory, type ServiceIcon } from '@shared/services';
import { useSite } from '@/lib/site';
import { SERVICE_ICON_LABELS, serviceIcon } from '@/lib/serviceIcons';
import '../admin.css';

type Section = 'overview' | 'users' | 'subscriptions' | 'contracts' | 'content' | 'media' | 'promotions' | 'benefits' | 'coupons' | 'audit' | 'account';
type AdminUser = { id: number; name: string; email: string; accountType: 'client' | 'provider'; role: string; status: string; city?: string; vip: boolean; discountPercent: number; featured: boolean; profileComplete?: boolean; createdAt?: string };
type Promo = { id: number; badge: string; title: string; text: string; cta: string; whatsappMessage: string; eventType?: string; imageUrl?: string; start: string; end: string; active: boolean; sortOrder: number; runningNow?: boolean };
type Benefit = { id: number; userId: number; userName?: string; userEmail?: string; kind: string; title: string; description: string; amountCents: number; percent: number; expiresAt: string | null; active: boolean; createdAt: string };
type Media = { id: number; kind: string; filename: string; size: number; url: string; createdAt: string };

const NAV: Array<{ id: Section; label: string; icon: typeof Users }> = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'users', label: 'Usuários e aprovações', icon: Users },
  { id: 'subscriptions', label: 'Assinaturas', icon: CreditCard },
  { id: 'contracts', label: 'Contratos (auditoria)', icon: FileSignature },
  { id: 'content', label: 'Textos do site', icon: PenLine },
  { id: 'media', label: 'Imagens', icon: ImageIcon },
  { id: 'promotions', label: 'Promoções', icon: Megaphone },
  { id: 'benefits', label: 'Bônus e benefícios', icon: Gift },
  { id: 'coupons', label: 'Cupons', icon: BadgePercent },
  { id: 'audit', label: 'Auditoria', icon: ScrollText },
  { id: 'account', label: 'Minha senha', icon: KeyRound },
];
const typeLabel = { client: 'Cliente', provider: 'Profissional' } as const;
const statusLabel: Record<string, string> = { active: 'Ativo', pending: 'Em análise', suspended: 'Suspenso', blocked: 'Bloqueado', deleted: 'Excluído' };
const kindLabel: Record<string, string> = { bonus: 'Bônus', credit: 'Crédito', discount: 'Desconto', vip: 'VIP', featured: 'Destaque', custom: 'Outro' };
const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir.');
const toCents = (value: string) => Math.max(0, Math.round((Number(value.replace(/\./g, '').replace(',', '.')) || 0) * 100));

function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="adm-card">{(title || action) && <header className="adm-card-head">{title && <h3>{title}</h3>}{action}</header>}{children}</section>;
}
function Empty({ text }: { text: string }) { return <p className="adm-empty">{text}</p>; }

export default function AdminConsole() {
  const [me, setMe] = useState<{ name: string; role: string } | null | undefined>(undefined);
  const [section, setSection] = useState<Section>('overview');
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { api<{ user: { name: string; role: string } | null }>('/me').then(r => setMe(r.user)).catch(() => setMe(null)); }, []);
  if (me === undefined) return <main className="adm-page"><div className="adm-center"><Loader2 className="ob-spin" size={22}/> Carregando…</div></main>;
  if (!me || me.role !== 'admin') return <main className="adm-page"><div className="adm-center"><p>Acesso restrito à administração.</p><Link href="/admin" className="ob-btn ob-btn-primary">Entrar como administrador</Link></div></main>;
  const go = (s: Section) => { setSection(s); setNavOpen(false); window.scrollTo(0, 0); };
  const logout = () => { void api('/logout', { method: 'POST' }).finally(() => window.location.assign('/')); };
  const current = NAV.find(n => n.id === section)!;
  return <main className="adm-page">
    <div className={`adm-layout ${navOpen ? 'nav-open' : ''}`}>
      <button type="button" className="adm-backdrop" aria-label="Fechar menu" onClick={() => setNavOpen(false)}/>
      <aside className="adm-sidebar">
        <div className="adm-brand"><span>G</span><div><strong>GastroConecta</strong><small>Administração</small></div><button type="button" className="adm-close" onClick={() => setNavOpen(false)} aria-label="Fechar"><X size={18}/></button></div>
        <nav>{NAV.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={section === item.id ? 'is-active' : ''} onClick={() => go(item.id)}><Icon size={17}/><span>{item.label}</span>{section === item.id && <ChevronRight size={15}/>}</button>; })}</nav>
        <div className="adm-sidebar-foot"><a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Ver o site</a><button type="button" onClick={logout}><LogOut size={15}/> Sair</button></div>
      </aside>
      <section className="adm-main">
        <header className="adm-topbar"><button type="button" className="adm-menu" onClick={() => setNavOpen(true)} aria-label="Abrir menu"><Menu size={20}/></button><div><small>Administração /</small><strong>{current.label}</strong></div><span className="adm-who">{me.name}</span></header>
        <div className="adm-content">
          {section === 'overview' && <Overview go={go}/>}
          {section === 'users' && <UsersSection/>}
          {section === 'subscriptions' && <SubscriptionsSection/>}
          {section === 'contracts' && <ContractsSection/>}
          {section === 'content' && <ContentSection/>}
          {section === 'media' && <MediaSection/>}
          {section === 'promotions' && <PromotionsSection/>}
          {section === 'benefits' && <BenefitsSection/>}
          {section === 'coupons' && <CouponsSection/>}
          {section === 'audit' && <AuditSection/>}
          {section === 'account' && <AccountSection/>}
        </div>
      </section>
    </div>
  </main>;
}

function Overview({ go }: { go: (s: Section) => void }) {
  const [data, setData] = useState<{ users: number; events: number; pending: number; activeSubscriptions: number; contracts: number; subscriptionRevenue30dCents: number } | null>(null);
  useEffect(() => { api<NonNullable<typeof data>>('/admin/overview').then(setData).catch(e => toast.error(errText(e))); }, []);
  return <div className="adm-stack">
    <div className="adm-stats">
      <button type="button" onClick={() => go('users')}><span>Usuários</span><strong>{data?.users ?? '—'}</strong></button>
      <button type="button" onClick={() => go('users')} className={data?.pending ? 'is-alert' : ''}><span>Cadastros em análise</span><strong>{data?.pending ?? '—'}</strong></button>
      <div><span>Pedidos</span><strong>{data?.events ?? '—'}</strong></div>
      <button type="button" onClick={() => go('subscriptions')}><span>Assinaturas vigentes</span><strong>{data?.activeSubscriptions ?? '—'}</strong></button>
      <div><span>Receita de assinaturas (30 dias)</span><strong>{data ? money(data.subscriptionRevenue30dCents) : '—'}</strong></div>
      <button type="button" onClick={() => go('contracts')}><span>Contratos gerados</span><strong>{data?.contracts ?? '—'}</strong></button>
    </div>
    <Card title="Atalhos">
      <div className="adm-shortcuts">
        <button type="button" onClick={() => go('users')}><Users size={18}/> Aprovar cadastros</button>
        <button type="button" onClick={() => go('content')}><PenLine size={18}/> Editar textos e fotos</button>
        <button type="button" onClick={() => go('promotions')}><Megaphone size={18}/> Criar promoção</button>
        <button type="button" onClick={() => go('benefits')}><Gift size={18}/> Dar bônus a um usuário</button>
      </div>
    </Card>
  </div>;
}

function UsersSection() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const load = () => api<{ users: AdminUser[] }>('/admin/users').then(r => setUsers(r.users)).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const list = useMemo(() => (users ?? []).filter(u => (!type || u.accountType === type) && (!status || u.status === status) && (!search || `${u.name} ${u.email} ${u.city ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [users, search, type, status]);
  return <div className="adm-stack">
    <div className="adm-filters">
      <label className="adm-search"><Search size={16}/><input placeholder="Nome, e-mail ou cidade" value={search} onChange={e => setSearch(e.target.value)}/></label>
      <select value={type} onChange={e => setType(e.target.value)} aria-label="Tipo"><option value="">Todos os tipos</option><option value="client">Clientes</option><option value="provider">Profissionais</option></select>
      <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    </div>
    <Card>
      {!users ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !list.length ? <Empty text="Nenhum usuário encontrado."/> :
        <div className="adm-list">{list.map(u => <button type="button" key={u.id} className="adm-row" onClick={() => setOpenId(u.id)}>
          <div className="adm-row-main"><strong>{u.name || '(sem nome)'}</strong><span>{u.email}</span></div>
          <div className="adm-row-tags"><span className="adm-tag">{typeLabel[u.accountType]}</span><span className={`adm-tag adm-st-${u.status}`}>{statusLabel[u.status] ?? u.status}</span>{u.accountType === 'provider' && <span className={`adm-tag ${u.profileComplete ? 'adm-ok' : 'adm-warn'}`}>{u.profileComplete ? 'Cadastro completo' : 'Cadastro incompleto'}</span>}{u.vip && <span className="adm-tag adm-vip">VIP</span>}{u.featured && <span className="adm-tag adm-vip">Destaque</span>}{u.role === 'admin' && <span className="adm-tag">Admin</span>}</div>
          <ChevronRight size={16}/>
        </button>)}</div>}
    </Card>
    {openId !== null && <UserDrawer id={openId} onClose={() => setOpenId(null)} onChanged={() => void load()}/>}
  </div>;
}

function Field({ label, value }: { label: string; value?: ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return <div className="adm-kv"><span>{label}</span><strong>{value}</strong></div>;
}

function UserDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [discount, setDiscount] = useState('0');
  const load = () => api<any>(`/admin/users/${id}/details`).then(r => { setData(r); setDiscount(String(r.user.discountPercent ?? 0)); }).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, [id]);
  const patch = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try { await api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); toast.success('Atualizado.'); await load(); onChanged(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  const u = data?.user; const d = data?.details;
  return <div className="adm-drawer" role="dialog" aria-modal="true">
    <button type="button" className="adm-drawer-backdrop" onClick={onClose} aria-label="Fechar"/>
    <div className="adm-drawer-panel">
      <header><div><small>{u ? typeLabel[u.accountType as keyof typeof typeLabel] : ''}</small><h3>{u?.name ?? 'Carregando…'}</h3></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={20}/></button></header>
      {!data ? <div className="adm-center"><Loader2 className="ob-spin" size={20}/></div> : <div className="adm-drawer-body">
        <div className="adm-actions">
          <span className={`adm-tag adm-st-${u.status}`}>{statusLabel[u.status]}</span>
          {u.status !== 'active' && <button type="button" className="ob-btn ob-btn-primary" disabled={!!busy} onClick={() => void patch({ status: 'active' }, 'approve')}>{busy === 'approve' ? <Loader2 className="ob-spin" size={16}/> : <Check size={16}/>} {u.status === 'pending' ? 'Aprovar' : 'Reativar'}</button>}
          {u.status === 'active' && u.role !== 'admin' && <button type="button" className="ob-btn ob-btn-outline" disabled={!!busy} onClick={() => void patch({ status: 'suspended' }, 'suspend')}>Suspender</button>}
          {u.role !== 'admin' && u.status !== 'blocked' && <button type="button" className="ob-btn ob-btn-outline" disabled={!!busy} onClick={() => void patch({ status: 'blocked' }, 'block')}>Bloquear</button>}
          {u.role !== 'admin' && u.status !== 'deleted' && <button type="button" className="ob-btn ob-btn-danger" disabled={!!busy} onClick={() => { if (confirm('Excluir esta conta? Ela deixa de acessar a plataforma.')) void patch({ status: 'deleted' }, 'delete'); }}>Excluir</button>}
        </div>
        {u.accountType === 'provider' && !data.profileComplete && <p className="adm-alert">Este profissional ainda não completou o cadastro obrigatório (logo, foto do rosto, fotos de trabalhos, documento e Pix). A aprovação fica bloqueada até lá.</p>}
        <ResetLink userId={u.id} disabled={u.role === 'admin'}/>
        <div className="adm-section-title">Conta</div>
        <Field label="E-mail" value={u.email}/><Field label="Cidade" value={u.city}/><Field label="Criado em" value={new Date(u.createdAt).toLocaleString('pt-BR')}/>
        {d && <>
          <div className="adm-section-title">Cadastro</div>
          <div className="adm-face-row">
            {d.avatarUrl && <figure><img className="adm-avatar" src={d.avatarUrl} alt="Logo"/><figcaption>Logo</figcaption></figure>}
            {d.faceUrl && <figure><a href={d.faceUrl} target="_blank" rel="noopener noreferrer"><img className="adm-avatar" src={d.faceUrl} alt="Foto do rosto"/></a><figcaption>Rosto (privado)</figcaption></figure>}
            {d.faceUrl && <label className="adm-verify"><input type="checkbox" checked={Boolean(d.faceVerified)} onChange={e => void patch({ faceVerified: e.target.checked }, 'face')}/> <ScanFace size={15}/> Rosto conferido</label>}
          </div>
          <Field label="Documento" value={d.documentType === 'cnpj' ? `CNPJ${d.companyType ? ` (${d.companyType})` : ''}` : d.documentType === 'cpf' ? 'CPF (pessoa física)' : ''}/>
          <ServicesField ids={d.services}/>
          <Field label="Nome completo" value={d.fullName}/><Field label="CNPJ" value={d.cnpj ? formatCNPJ(d.cnpj) : ""}/><Field label="Razão social" value={d.companyName}/><Field label="Nome fantasia" value={d.tradeName}/><Field label="CPF" value={d.cpf ? formatCPF(d.cpf) : ""}/><Field label="Nascimento" value={d.birthDate ? d.birthDate.split("-").reverse().join("/") : ""}/><Field label="Telefone" value={d.phone ? formatPhone(d.phone) : ""}/>
          <Field label="Endereço" value={[d.street, d.number, d.complement, d.district, d.city && `${d.city}/${d.state}`, d.cep && formatCEP(d.cep)].filter(Boolean).join(', ')}/>
          <Field label="Categoria" value={d.category}/><Field label="Especialidade" value={d.specialty}/><Field label="Funções" value={Array.isArray(d.roles) ? d.roles.join(', ') : ''}/>
          <Field label="Apresentação / experiência" value={d.bio || d.experience}/>
          {d.resumeUrl && <a className="adm-file" href={d.resumeUrl} target="_blank" rel="noopener noreferrer"><FileText size={16}/> Abrir currículo</a>}
          {d.socials && <Field label="Redes sociais" value={<span className="adm-links">{Object.entries(d.socials as Record<string, string>).filter(([, v]) => v).map(([k, v]) => <a key={k} href={v} target="_blank" rel="noopener noreferrer">{k}</a>)}{d.website && <a href={d.website} target="_blank" rel="noopener noreferrer">site</a>}</span>}/>}
          {Array.isArray(d.serviceUrls) && d.serviceUrls.length > 0 && <div className="adm-thumbs">{d.serviceUrls.map((m: { id: number; url: string }) => <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer"><img src={m.url} alt=""/></a>)}</div>}
          {d.bank && <><div className="adm-section-title">Dados para pagamento</div><Field label="Titular" value={`${d.bank.holderName} (${d.bank.holderDocument?.length === 14 ? formatCNPJ(d.bank.holderDocument) : formatCPF(d.bank.holderDocument ?? '')})`}/><Field label="Banco" value={`${d.bank.bankName} · Ag. ${d.bank.agency} · Conta ${d.bank.account} (${d.bank.accountType})`}/><Field label="Pix" value={`${d.bank.pixKeyType}: ${d.bank.pixKey}`}/></>}
        </>}
        {data.subscription && <SubscriptionBox userId={u.id} summary={data.subscription} onChanged={() => void load()}/>}
        <div className="adm-section-title">Vantagens</div>
        <div className="adm-toggles">
          <label><input type="checkbox" checked={u.vip} onChange={e => void patch({ vip: e.target.checked }, 'vip')}/> VIP</label>
          <label><input type="checkbox" checked={u.featured} onChange={e => void patch({ featured: e.target.checked }, 'featured')}/> Destaque no catálogo</label>
          <label className="adm-inline">Desconto % <input type="number" min={0} max={100} value={discount} onChange={e => setDiscount(e.target.value)}/><button type="button" className="ob-btn ob-btn-outline" onClick={() => void patch({ discountPercent: Math.min(100, Math.max(0, Number(discount) || 0)) }, 'discount')}>Salvar</button></label>
        </div>
        <BenefitForm userId={u.id} onSaved={() => void load()}/>
        {data.benefits?.length > 0 && <div className="adm-mini-list">{data.benefits.map((b: Benefit) => <div key={b.id}><span className="adm-tag">{kindLabel[b.kind]}</span> {b.title} {b.amountCents > 0 && `· ${money(b.amountCents)}`} {b.percent > 0 && `· ${b.percent}%`} {!b.active && <em>(inativo)</em>}</div>)}</div>}
      </div>}
    </div>
  </div>;
}

function BenefitForm({ userId, onSaved }: { userId?: number; onSaved: () => void }) {
  const [form, setForm] = useState({ userId: userId ? String(userId) : '', kind: 'bonus', title: '', description: '', amount: '', percent: '', expiresAt: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.userId || !form.title.trim()) { toast.error('Informe o usuário e o título do benefício.'); return; }
    setBusy(true);
    try {
      await api('/admin/benefits', { method: 'POST', body: JSON.stringify({ userId: Number(form.userId), kind: form.kind, title: form.title.trim(), description: form.description.trim(), amountCents: toCents(form.amount), percent: Math.min(100, Math.max(0, Number(form.percent) || 0)), expiresAt: form.expiresAt || null }) });
      toast.success('Benefício concedido.');
      setForm(f => ({ ...f, title: '', description: '', amount: '', percent: '', expiresAt: '' }));
      onSaved();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  return <div className="adm-form">
    <div className="adm-section-title">Conceder bônus ou benefício</div>
    <div className="adm-grid">
      {!userId && <label className="ob-field"><span>ID do usuário</span><input inputMode="numeric" value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value.replace(/\D/g, '') })} placeholder="Veja em Usuários"/></label>}
      <label className="ob-field"><span>Tipo</span><select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{Object.entries(kindLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="ob-field ob-wide"><span>Título</span><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Bônus de boas-vindas"/></label>
      <label className="ob-field"><span>Valor (R$)</span><input inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0,00"/></label>
      <label className="ob-field"><span>Percentual (%)</span><input inputMode="numeric" value={form.percent} onChange={e => setForm({ ...form, percent: e.target.value.replace(/\D/g, '') })} placeholder="0"/></label>
      <label className="ob-field"><span>Válido até (opcional)</span><input type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })}/></label>
      <label className="ob-field ob-wide"><span>Descrição (o usuário vê no painel)</span><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label>
    </div>
    <button type="button" className="ob-btn ob-btn-primary" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="ob-spin" size={16}/> : <Gift size={16}/>} Conceder</button>
  </div>;
}

function ImagePicker({ value, onChange, kind = 'site' }: { value: string; onChange: (url: string) => void; kind?: 'site' | 'promo' }) {
  const [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { const media = await uploadFile(file, kind); onChange(media.url); toast.success('Imagem enviada. Lembre de salvar.'); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  return <div className="adm-image-picker">
    <div className="adm-image-preview">{value ? <img src={value} alt=""/> : <ImageIcon size={26}/>}</div>
    <label className="ob-btn ob-btn-outline">{busy ? <Loader2 className="ob-spin" size={16}/> : <Upload size={16}/>} Enviar imagem<input type="file" accept="image/*" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}/></label>
    {value && <button type="button" className="ob-link-danger" onClick={() => onChange('')}>Remover</button>}
  </div>;
}

function ServicesField({ ids }: { ids: unknown }) {
  const { serviceCatalog } = useSite();
  return <Field label="Serviços" value={Array.isArray(ids) ? ids.map(id => serviceLabel(id, serviceCatalog)).join(', ') : ''}/>;
}

const safeCatalog = (raw: string, values: Record<string, string>): ServiceCategory[] => {
  try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; } catch { /* volta ao catálogo salvo */ }
  return serviceCatalogFrom(values);
};

/** Categorias de serviço (cards da página inicial) e as profissões de cada uma. */
function ServiceCatalogEditor({ value, onChange }: { value: ServiceCategory[]; onChange: (list: ServiceCategory[]) => void }) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const set = (i: number, patch: Partial<ServiceCategory>) => onChange(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= value.length) return; const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };
  const removeCategory = (i: number) => {
    if (value.length <= 1) { toast.error('Mantenha pelo menos uma categoria.'); return; }
    if (!confirm(`Excluir a categoria “${value[i].name || 'sem nome'}” e todas as profissões dela? Profissionais cadastrados nessas profissões deixam de receber pedidos delas até escolherem outra.`)) return;
    onChange(value.filter((_, idx) => idx !== i));
  };
  const addService = (i: number) => {
    const label = (drafts[i] ?? '').trim();
    if (label.length < 2) { toast.error('Digite o nome da profissão.'); return; }
    if (value[i].services.some(s => s.label.toLowerCase() === label.toLowerCase())) { toast.error('Essa profissão já existe nesta categoria.'); return; }
    set(i, { services: [...value[i].services, { id: '', label }] });
    setDrafts(d => ({ ...d, [i]: '' }));
  };
  const removeService = (i: number, k: number) => {
    const svc = value[i].services[k];
    if (value[i].services.length <= 1) { toast.error('A categoria precisa de pelo menos uma profissão. Para tirar tudo, exclua a categoria.'); return; }
    if (svc.id && !confirm(`Excluir a profissão “${svc.label}”? Profissionais cadastrados nela deixam de receber pedidos dela.`)) return;
    set(i, { services: value[i].services.filter((_, idx) => idx !== k) });
  };
  const addCategory = () => onChange([...value, { id: '', name: 'Novo serviço', subtitle: '', icon: 'utensils', calculator: 'event', cover: '', services: [] }]);
  return <div className="adm-svc">
    <p className="adm-muted">Cada categoria vira um card na página inicial e aparece no pedido de orçamento. As profissões são o que o profissional escolhe no cadastro e o que o cliente pode pedir. Depois de mudar, clique em <strong>Salvar e publicar</strong>.</p>
    {value.map((cat, i) => { const Icon = serviceIcon(cat.icon); return <div className="adm-svc-card" key={cat.id || `novo-${i}`}>
      <div className="adm-svc-head">
        <span className="adm-svc-icon"><Icon size={20}/></span>
        <input className="adm-svc-name" value={cat.name} aria-label="Nome da categoria" placeholder="Nome do serviço (ex.: Confeitaria)" maxLength={80} onChange={e => set(i, { name: e.target.value })}/>
        <div className="adm-row-actions">
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover para cima">↑</button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Mover para baixo">↓</button>
          <button type="button" className="danger" onClick={() => removeCategory(i)}><Trash2 size={14}/> Excluir</button>
        </div>
      </div>
      <div className="adm-svc-grid">
        <label className="adm-content-field"><span className="adm-content-label">Frase do card</span><input value={cat.subtitle} maxLength={160} placeholder="Ex.: Bolos, doces e mesas de sobremesa" onChange={e => set(i, { subtitle: e.target.value })}/></label>
        <label className="adm-content-field"><span className="adm-content-label">Ícone</span><select value={cat.icon} onChange={e => set(i, { icon: e.target.value as ServiceIcon })}>{SERVICE_ICONS.map(ic => <option key={ic} value={ic}>{SERVICE_ICON_LABELS[ic]}</option>)}</select></label>
        <label className="adm-content-field"><span className="adm-content-label">Como a plataforma sugere o valor</span><select value={cat.calculator} onChange={e => set(i, { calculator: e.target.value as ServiceCategory['calculator'] })}>{REQUEST_CATEGORIES.map(rc => <option key={rc.id} value={rc.id}>{rc.label}</option>)}</select></label>
      </div>
      <div className="adm-content-field"><span className="adm-content-label">Foto de capa do card</span><ImagePicker value={cat.cover} onChange={url => set(i, { cover: url })}/></div>
      <div className="adm-content-field"><span className="adm-content-label">Profissões desta categoria</span>
        <div className="adm-svc-chips">{cat.services.map((svc, k) => <span className="adm-svc-chip" key={svc.id || `n-${k}`}><input value={svc.label} aria-label="Nome da profissão" maxLength={100} onChange={e => set(i, { services: cat.services.map((x, idx) => (idx === k ? { ...x, label: e.target.value } : x)) })}/><button type="button" aria-label={`Excluir ${svc.label}`} onClick={() => removeService(i, k)}><X size={14}/></button></span>)}</div>
        <div className="adm-svc-add"><input value={drafts[i] ?? ''} placeholder="Nova profissão (ex.: Confeiteiro(a))" maxLength={100} onChange={e => setDrafts(d => ({ ...d, [i]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addService(i); } }}/><button type="button" className="ob-btn ob-btn-outline" onClick={() => addService(i)}><Plus size={16}/> Adicionar profissão</button></div>
        {!cat.services.length && <small className="adm-svc-warn">Adicione pelo menos uma profissão antes de salvar.</small>}
      </div>
    </div>; })}
    <button type="button" className="ob-btn ob-btn-primary adm-svc-new" onClick={addCategory}><Plus size={16}/> Criar novo serviço</button>
  </div>;
}

function ContentSection() {
  const [fields, setFields] = useState<ContentField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [group, setGroup] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ fields: ContentField[]; values: Record<string, string> }>('/admin/content').then(r => { setFields(r.fields); setValues(r.values); setSaved(r.values); setGroup(r.fields[0]?.group ?? ''); }).catch(e => toast.error(errText(e))); }, []);
  const visible = fields.filter(f => !f.hidden);
  const groups = [...new Set(visible.map(f => f.group))];
  const changed = Object.keys(values).filter(k => values[k] !== saved[k]);
  const save = async () => {
    setBusy(true);
    try { const r = await api<{ values: Record<string, string> }>('/admin/content', { method: 'PUT', body: JSON.stringify({ values: Object.fromEntries(changed.map(k => [k, values[k]])) }) }); setValues(r.values); setSaved(r.values); toast.success('Site atualizado. As mudanças já aparecem para os visitantes.'); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const reset = async (key: string) => {
    try { const r = await api<{ values: Record<string, string> }>('/admin/content/reset', { method: 'POST', body: JSON.stringify({ key }) }); setValues(v => ({ ...v, [key]: r.values[key] })); setSaved(s => ({ ...s, [key]: r.values[key] })); toast.success('Texto original restaurado.'); }
    catch (e) { toast.error(errText(e)); }
  };
  if (!fields.length) return <div className="adm-center"><Loader2 className="ob-spin" size={20}/></div>;
  return <div className="adm-stack">
    <div className="adm-tabs" role="tablist">{groups.map(g => <button key={g} type="button" className={g === group ? 'is-active' : ''} onClick={() => setGroup(g)}>{g}</button>)}</div>
    <Card>
      <div className="adm-content-fields">{visible.filter(f => f.group === group).map(f => <div className="adm-content-field" key={f.key}>
        <div className="adm-content-label"><span>{f.label}</span>{values[f.key] !== f.default && <button type="button" title="Voltar ao texto original" onClick={() => void reset(f.key)}><RotateCcw size={13}/> original</button>}</div>
        {f.type === 'textarea' ? <textarea rows={f.key.startsWith('legal.') ? 14 : 3} value={values[f.key] ?? ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })}/>
          : f.type === 'boolean' ? <label className="adm-switch"><input type="checkbox" checked={values[f.key] === 'true'} onChange={e => setValues({ ...values, [f.key]: e.target.checked ? 'true' : 'false' })}/> {values[f.key] === 'true' ? 'Ligado' : 'Desligado'}</label>
          : f.type === 'image' ? <ImagePicker value={values[f.key] ?? ''} onChange={url => setValues({ ...values, [f.key]: url })}/>
          : f.type === 'services' ? <ServiceCatalogEditor value={values[f.key] ? safeCatalog(values[f.key], values) : serviceCatalogFrom(values)} onChange={list => setValues({ ...values, [f.key]: JSON.stringify(list) })}/>
          : <input value={values[f.key] ?? ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })} inputMode={f.type === 'url' ? 'url' : undefined}/>}
      </div>)}</div>
    </Card>
    <div className="ob-savebar"><span>{changed.length ? `${changed.length} alteração(ões) não salva(s)` : 'Tudo salvo'}</span><button type="button" className="ob-btn ob-btn-primary" disabled={!changed.length || busy} onClick={() => void save()}>{busy ? <Loader2 className="ob-spin" size={16}/> : <Check size={16}/>} Salvar e publicar</button></div>
  </div>;
}

function MediaSection() {
  const [items, setItems] = useState<Media[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ media: Media[] }>('/admin/media').then(r => setItems(r.media)).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try { for (const file of Array.from(files)) await uploadFile(file, 'site'); toast.success('Imagens enviadas.'); await load(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    if (!confirm('Apagar esta imagem? Se ela estiver em uso no site, deixará de aparecer.')) return;
    try { await api(`/media/${id}`, { method: 'DELETE' }); await load(); } catch (e) { toast.error(errText(e)); }
  };
  const copy = (url: string) => { void navigator.clipboard?.writeText(window.location.origin + url).then(() => toast.success('Link copiado.')); };
  return <div className="adm-stack">
    <Card title="Biblioteca de imagens" action={<label className="ob-btn ob-btn-primary">{busy ? <Loader2 className="ob-spin" size={16}/> : <Upload size={16}/>} Enviar imagens<input type="file" accept="image/*" multiple hidden onChange={e => { void upload(e.target.files); e.target.value = ''; }}/></label>}>
      <p className="adm-muted">As imagens ficam guardadas no banco de dados da plataforma (não somem quando o Render reinicia). Para usar uma imagem no site, vá em <strong>Textos do site</strong> e use “Enviar imagem” no campo de foto, ou copie o link daqui.</p>
      {!items ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !items.length ? <Empty text="Nenhuma imagem enviada ainda."/> :
        <div className="adm-media-grid">{items.map(m => <figure key={m.id}><img src={m.url} alt={m.filename} loading="lazy"/><figcaption><span>{m.filename || `imagem-${m.id}`}</span><small>{(m.size / 1024).toFixed(0)} KB</small></figcaption><div><button type="button" onClick={() => copy(m.url)} aria-label="Copiar link"><Copy size={15}/></button><button type="button" onClick={() => void remove(m.id)} aria-label="Apagar"><Trash2 size={15}/></button></div></figure>)}</div>}
    </Card>
  </div>;
}

const emptyPromo = { badge: '', title: '', text: '', cta: 'Quero saber mais', whatsappMessage: 'Olá! Vi a promoção no site e quero saber mais.', eventType: '', imageUrl: '', start: '01-01', end: '12-31', active: true, sortOrder: 0 };

function PromotionsSection() {
  const [list, setList] = useState<Promo[] | null>(null);
  const [editing, setEditing] = useState<(typeof emptyPromo & { id?: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ promotions: Promo[] }>('/admin/promotions').then(r => setList(r.promotions)).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const toPayload = (p: typeof emptyPromo) => ({ ...p, eventType: p.eventType || null, imageUrl: p.imageUrl || null, sortOrder: Number(p.sortOrder) || 0 });
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const { id, ...rest } = editing;
      await api(id ? `/admin/promotions/${id}` : '/admin/promotions', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(toPayload(rest)) });
      toast.success('Promoção salva.'); setEditing(null); await load();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const toggle = async (p: Promo) => {
    try { const { id, runningNow, ...rest } = p; void runningNow; await api(`/admin/promotions/${id}`, { method: 'PATCH', body: JSON.stringify(toPayload({ ...emptyPromo, ...rest, eventType: rest.eventType ?? '', imageUrl: rest.imageUrl ?? '', active: !p.active })) }); await load(); }
    catch (e) { toast.error(errText(e)); }
  };
  const remove = async (p: Promo) => { if (!confirm(`Apagar a promoção "${p.title}"?`)) return; try { await api(`/admin/promotions/${p.id}`, { method: 'DELETE' }); await load(); } catch (e) { toast.error(errText(e)); } };
  const md = (v: string) => v.split('-').reverse().join('/');
  return <div className="adm-stack">
    <Card title="Promoções da página inicial" action={<button type="button" className="ob-btn ob-btn-primary" onClick={() => setEditing({ ...emptyPromo })}><Plus size={16}/> Nova promoção</button>}>
      <p className="adm-muted">Cada promoção aparece sozinha no período escolhido (todo ano). Promoções desligadas não aparecem.</p>
      {!list ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !list.length ? <Empty text="Nenhuma promoção cadastrada."/> :
        <div className="adm-list">{list.map(p => <div className="adm-row adm-row-static" key={p.id}>
          {p.imageUrl ? <img className="adm-row-thumb" src={p.imageUrl} alt=""/> : <span className="adm-row-thumb"><Megaphone size={18}/></span>}
          <div className="adm-row-main"><strong>{p.title}</strong><span>{p.badge} · {md(p.start)} a {md(p.end)}</span></div>
          <div className="adm-row-tags">{p.runningNow && <span className="adm-tag adm-ok">No ar agora</span>}<span className={`adm-tag ${p.active ? '' : 'adm-warn'}`}>{p.active ? 'Ligada' : 'Desligada'}</span></div>
          <div className="adm-row-actions"><button type="button" onClick={() => void toggle(p)}>{p.active ? 'Desligar' : 'Ligar'}</button><button type="button" onClick={() => setEditing({ ...emptyPromo, ...p, eventType: p.eventType ?? '', imageUrl: p.imageUrl ?? '' })}>Editar</button><button type="button" className="danger" onClick={() => void remove(p)} aria-label="Apagar"><Trash2 size={15}/></button></div>
        </div>)}</div>}
    </Card>
    {editing && <div className="adm-drawer" role="dialog" aria-modal="true"><button type="button" className="adm-drawer-backdrop" onClick={() => setEditing(null)} aria-label="Fechar"/><div className="adm-drawer-panel">
      <header><h3>{editing.id ? 'Editar promoção' : 'Nova promoção'}</h3><button type="button" onClick={() => setEditing(null)} aria-label="Fechar"><X size={20}/></button></header>
      <div className="adm-drawer-body">
        <div className="adm-section-title">Foto de capa da promoção</div>
        <ImagePicker kind="promo" value={editing.imageUrl} onChange={url => setEditing({ ...editing, imageUrl: url })}/>
        <div className="adm-grid">
          <label className="ob-field"><span>Etiqueta</span><input value={editing.badge} onChange={e => setEditing({ ...editing, badge: e.target.value })} placeholder="Ex.: Natal"/></label>
          <label className="ob-field ob-wide"><span>Título</span><input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })}/></label>
          <label className="ob-field ob-wide"><span>Texto</span><textarea rows={3} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })}/></label>
          <label className="ob-field"><span>Texto do botão</span><input value={editing.cta} onChange={e => setEditing({ ...editing, cta: e.target.value })}/></label>
          <label className="ob-field"><span>Ocasião no orçamento</span><select value={editing.eventType} onChange={e => setEditing({ ...editing, eventType: e.target.value })}><option value="">Nenhuma</option>{EVENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
          <label className="ob-field ob-wide"><span>Mensagem que chega no WhatsApp</span><textarea rows={2} value={editing.whatsappMessage} onChange={e => setEditing({ ...editing, whatsappMessage: e.target.value })}/></label>
          <label className="ob-field"><span>Começa em (dia/mês)</span><input type="text" inputMode="numeric" value={md(editing.start)} onChange={e => { const [d = '', m = ''] = e.target.value.split('/'); setEditing({ ...editing, start: `${m.padStart(2, '0').slice(0, 2)}-${d.padStart(2, '0').slice(0, 2)}` }); }} placeholder="01/11"/></label>
          <label className="ob-field"><span>Termina em (dia/mês)</span><input type="text" inputMode="numeric" value={md(editing.end)} onChange={e => { const [d = '', m = ''] = e.target.value.split('/'); setEditing({ ...editing, end: `${m.padStart(2, '0').slice(0, 2)}-${d.padStart(2, '0').slice(0, 2)}` }); }} placeholder="06/01"/></label>
          <label className="ob-field"><span>Ordem</span><input type="number" min={0} value={editing.sortOrder} onChange={e => setEditing({ ...editing, sortOrder: Number(e.target.value) })}/></label>
          <label className="adm-switch"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })}/> Promoção ligada</label>
        </div>
        <button type="button" className="ob-btn ob-btn-primary adm-full" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="ob-spin" size={16}/> : <Check size={16}/>} Salvar promoção</button>
      </div>
    </div></div>}
  </div>;
}

function BenefitsSection() {
  const [list, setList] = useState<Benefit[] | null>(null);
  const load = () => api<{ benefits: Benefit[] }>('/admin/benefits').then(r => setList(r.benefits)).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const toggle = async (b: Benefit) => { try { await api(`/admin/benefits/${b.id}`, { method: 'PATCH', body: JSON.stringify({ active: !b.active }) }); await load(); } catch (e) { toast.error(errText(e)); } };
  const remove = async (b: Benefit) => { if (!confirm('Apagar este benefício?')) return; try { await api(`/admin/benefits/${b.id}`, { method: 'DELETE' }); await load(); } catch (e) { toast.error(errText(e)); } };
  return <div className="adm-stack">
    <Card><BenefitForm onSaved={() => void load()}/><p className="adm-muted">Dica: o jeito mais fácil é abrir o usuário em <strong>Usuários e aprovações</strong> e conceder por lá. Benefícios do tipo VIP, Destaque e Desconto também ligam essas marcas no perfil.</p></Card>
    <Card title="Benefícios concedidos">
      {!list ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !list.length ? <Empty text="Nenhum benefício concedido ainda."/> :
        <div className="adm-list">{list.map(b => <div className="adm-row adm-row-static" key={b.id}>
          <div className="adm-row-main"><strong>{b.title}</strong><span>{b.userName} · {b.userEmail}</span></div>
          <div className="adm-row-tags"><span className="adm-tag">{kindLabel[b.kind]}</span>{b.amountCents > 0 && <span className="adm-tag">{money(b.amountCents)}</span>}{b.percent > 0 && <span className="adm-tag">{b.percent}%</span>}{b.expiresAt && <span className="adm-tag">até {new Date(`${b.expiresAt}T12:00:00`).toLocaleDateString('pt-BR')}</span>}<span className={`adm-tag ${b.active ? 'adm-ok' : 'adm-warn'}`}>{b.active ? 'Ativo' : 'Inativo'}</span></div>
          <div className="adm-row-actions"><button type="button" onClick={() => void toggle(b)}>{b.active ? 'Desativar' : 'Ativar'}</button><button type="button" className="danger" onClick={() => void remove(b)} aria-label="Apagar"><Trash2 size={15}/></button></div>
        </div>)}</div>}
    </Card>
  </div>;
}

function ResetLink({ userId, disabled }: { userId: number; disabled?: boolean }) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  if (disabled) return null;
  const create = async () => {
    setBusy(true);
    try { const r = await api<{ link: string }>(`/admin/users/${userId}/reset-link`, { method: 'POST' }); setLink(r.link); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  return <div className="adm-reset">
    <button type="button" className="ob-btn ob-btn-outline" disabled={busy} onClick={() => void create()}>{busy ? <Loader2 className="ob-spin" size={16}/> : <KeyRound size={16}/>} Gerar link de nova senha</button>
    {link && <div className="adm-reset-link"><code>{link}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(link).then(() => toast.success('Link copiado. Envie ao usuário pelo WhatsApp (válido por 1 hora).')); }}><Copy size={14}/> Copiar</button></div>}
  </div>;
}

type SubSummary = { label: string; phase: string; periodEnd: string | null; autoRenew: { authorized: boolean }; history: Array<{ id: number; method: string; status: string; amountCents: number; createdAt: string }> };
function SubscriptionBox({ userId, summary, onChanged }: { userId: number; summary: SubSummary; onChanged: () => void }) {
  const [months, setMonths] = useState('1');
  const [busy, setBusy] = useState(false);
  const grant = async () => {
    setBusy(true);
    try { await api(`/admin/subscriptions/${userId}/grant`, { method: 'POST', body: JSON.stringify({ months: Math.min(24, Math.max(1, Number(months) || 1)), note: 'Liberação manual pelo painel' }) }); toast.success('Assinatura liberada.'); onChanged(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  return <>
    <div className="adm-section-title">Assinatura</div>
    <Field label="Situação" value={summary.label}/>
    <Field label="Vencimento" value={summary.periodEnd ? new Date(summary.periodEnd).toLocaleDateString('pt-BR') : '—'}/>
    <Field label="Pix automático" value={summary.autoRenew.authorized ? 'Autorizado' : 'Não autorizado'}/>
    <label className="adm-inline">Liberar meses <input type="number" min={1} max={24} value={months} onChange={e => setMonths(e.target.value)}/><button type="button" className="ob-btn ob-btn-outline" disabled={busy} onClick={() => void grant()}>{busy ? <Loader2 className="ob-spin" size={16}/> : <Check size={16}/>} Liberar</button></label>
  </>;
}

type SubRow = { userId: number; name: string; email: string; accountStatus: string; phase: string; label: string; periodEnd: string | null; autoRenew: string | null; lastPaidAt: string | null };
function SubscriptionsSection() {
  const [data, setData] = useState<{ priceCents: number; paymentsConfigured: boolean; subscriptions: SubRow[] } | null>(null);
  const [phase, setPhase] = useState('');
  useEffect(() => { api<NonNullable<typeof data>>('/admin/subscriptions').then(setData).catch(e => toast.error(errText(e))); }, []);
  const list = (data?.subscriptions ?? []).filter(s => !phase || s.phase === phase);
  return <div className="adm-stack">
    {data && !data.paymentsConfigured && <p className="adm-alert">Mercado Pago não configurado: defina MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET no Render. Até lá, libere assinaturas manualmente no cadastro de cada profissional.</p>}
    <div className="adm-filters"><select value={phase} onChange={e => setPhase(e.target.value)} aria-label="Situação"><option value="">Todas as situações</option><option value="active">Em dia</option><option value="renewal">Em renovação</option><option value="manual">Aguardando Pix manual</option><option value="blocked">Vencidas (ocultos)</option><option value="inactive">Nunca ativadas</option></select>{data && <span className="adm-muted">Mensalidade: {money(data.priceCents)}</span>}</div>
    <Card>{!data ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !list.length ? <Empty text="Nenhum profissional nesta situação."/> : <div className="adm-list">{list.map(s => <div className="adm-row" key={s.userId}><div className="adm-row-main"><strong>{s.name || s.email}</strong><span>{s.email} · vence {s.periodEnd ? new Date(s.periodEnd).toLocaleDateString('pt-BR') : '—'}{s.lastPaidAt ? ` · último pagamento ${new Date(s.lastPaidAt).toLocaleDateString('pt-BR')}` : ''}</span></div><div className="adm-row-tags"><span className={`adm-tag ${s.phase === 'active' || s.phase === 'renewal' ? 'adm-ok' : 'adm-warn'}`}>{s.label}</span>{s.autoRenew === 'authorized' && <span className="adm-tag">Pix automático</span>}<span className={`adm-tag adm-st-${s.accountStatus}`}>{statusLabel[s.accountStatus] ?? s.accountStatus}</span></div></div>)}</div>}</Card>
  </div>;
}

type ContractRow = { id: number; title: string; createdAt: string; clientName?: string; providerName?: string; amountCents?: number };
function ContractsSection() {
  const [items, setItems] = useState<ContractRow[] | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => { api<{ contracts: ContractRow[] }>('/admin/contracts').then(r => setItems(r.contracts)).catch(e => toast.error(errText(e))); }, []);
  const download = async (id: number) => {
    try {
      const response = await fetch(`/api/gastro/contracts/${id}/pdf`, { credentials: 'include' });
      if (!response.ok) throw new Error('Não foi possível baixar o contrato.');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a'); a.href = url; a.download = `contrato-gastroconecta-${id}.pdf`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error(errText(e)); }
  };
  const list = (items ?? []).filter(c => !search || `${c.title} ${c.clientName ?? ''} ${c.providerName ?? ''} ${c.id}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="adm-stack">
    <div className="adm-filters"><label className="adm-search"><Search size={16}/><input placeholder="Cliente, profissional, pedido ou nº" value={search} onChange={e => setSearch(e.target.value)}/></label></div>
    <Card title="Contratos gerados automaticamente">{!items ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !list.length ? <Empty text="Nenhum contrato ainda."/> : <div className="adm-list">{list.map(c => <div className="adm-row" key={c.id}><div className="adm-row-main"><strong>GC-{String(c.id).padStart(6, '0')} · {c.title}</strong><span>{c.clientName} × {c.providerName}{c.amountCents ? ` · ${money(c.amountCents)}` : ''} · {new Date(c.createdAt).toLocaleString('pt-BR')}</span></div><button type="button" className="ob-btn ob-btn-outline" onClick={() => void download(c.id)}><Download size={15}/> PDF</button></div>)}</div>}</Card>
  </div>;
}

function CouponsSection() {
  const [list, setList] = useState<Array<{ id: number; code: string; discountPercent: number; cashbackPercent: number; active: boolean }> | null>(null);
  const [form, setForm] = useState({ code: '', discountPercent: '', cashbackPercent: '' });
  const load = () => api<{ coupons: NonNullable<typeof list> }>('/admin/coupons').then(r => setList(r.coupons)).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const create = async () => {
    try { await api('/admin/coupons', { method: 'POST', body: JSON.stringify({ code: form.code.trim(), discountPercent: Number(form.discountPercent) || 0, cashbackPercent: Number(form.cashbackPercent) || 0 }) }); setForm({ code: '', discountPercent: '', cashbackPercent: '' }); toast.success('Cupom criado.'); await load(); }
    catch (e) { toast.error(errText(e)); }
  };
  const toggle = async (id: number, active: boolean) => { try { await api(`/admin/coupons/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }); await load(); } catch (e) { toast.error(errText(e)); } };
  const remove = async (id: number) => { if (!confirm('Apagar este cupom?')) return; try { await api(`/admin/coupons/${id}`, { method: 'DELETE' }); await load(); } catch (e) { toast.error(errText(e)); } };
  return <div className="adm-stack">
    <Card title="Novo cupom">
      <div className="adm-grid">
        <label className="ob-field"><span>Código</span><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="NATAL10"/></label>
        <label className="ob-field"><span>Desconto %</span><input inputMode="numeric" value={form.discountPercent} onChange={e => setForm({ ...form, discountPercent: e.target.value.replace(/\D/g, '') })}/></label>
        <label className="ob-field"><span>Cashback %</span><input inputMode="numeric" value={form.cashbackPercent} onChange={e => setForm({ ...form, cashbackPercent: e.target.value.replace(/\D/g, '') })}/></label>
      </div>
      <button type="button" className="ob-btn ob-btn-primary" onClick={() => void create()}><Plus size={16}/> Criar cupom</button>
      <p className="adm-muted">Os cupons ficam registrados para você informar aos clientes; o desconto é aplicado no valor combinado, já que o pagamento é feito direto entre as partes.</p>
    </Card>
    <Card title="Cupons">
      {!list ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !list.length ? <Empty text="Nenhum cupom criado."/> :
        <div className="adm-list">{list.map(c => <div className="adm-row adm-row-static" key={c.id}><div className="adm-row-main"><strong>{c.code}</strong><span>{c.discountPercent}% desconto · {c.cashbackPercent}% cashback</span></div><div className="adm-row-tags"><span className={`adm-tag ${c.active ? 'adm-ok' : 'adm-warn'}`}>{c.active ? 'Ativo' : 'Inativo'}</span></div><div className="adm-row-actions"><button type="button" onClick={() => void toggle(c.id, !c.active)}>{c.active ? 'Desativar' : 'Ativar'}</button><button type="button" className="danger" onClick={() => void remove(c.id)} aria-label="Apagar"><Trash2 size={15}/></button></div></div>)}</div>}
    </Card>
  </div>;
}

function AuditSection() {
  const [logs, setLogs] = useState<Array<{ id: number; action: string; details: string; createdAt: string; actorId: number }> | null>(null);
  useEffect(() => { api<{ logs: NonNullable<typeof logs> }>('/admin/audit').then(r => setLogs(r.logs)).catch(e => toast.error(errText(e))); }, []);
  return <Card title="Últimas ações registradas">
    {!logs ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !logs.length ? <Empty text="Nada registrado ainda."/> :
      <div className="adm-audit">{logs.map(l => <div key={l.id}><time>{new Date(l.createdAt).toLocaleString('pt-BR')}</time><strong>{l.action}</strong><code>{l.details.slice(0, 200)}</code></div>)}</div>}
    <a className="ob-btn ob-btn-outline" href="/api/gastro/report/pdf" target="_blank" rel="noopener noreferrer"><FileText size={16}/> Relatório em PDF</a>
  </Card>;
}

function AccountSection() {
  const [form, setForm] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api('/admin/password', { method: 'POST', body: JSON.stringify(form) }); setForm({ current: '', next: '' }); toast.success('Senha alterada.'); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  return <Card title="Trocar senha de administrador">
    <div className="adm-grid">
      <label className="ob-field"><span>Senha atual</span><input type="password" autoComplete="current-password" value={form.current} onChange={e => setForm({ ...form, current: e.target.value })}/></label>
      <label className="ob-field"><span>Nova senha</span><input type="password" autoComplete="new-password" value={form.next} onChange={e => setForm({ ...form, next: e.target.value })}/></label>
    </div>
    <p className="adm-hint">Mínimo de 10 caracteres, com maiúscula, minúscula, número e símbolo.</p>
    <button type="button" className="ob-btn ob-btn-primary" disabled={busy || !form.current || !form.next} onClick={() => void save()}>{busy ? <Loader2 className="ob-spin" size={16}/> : <KeyRound size={16}/>} Salvar nova senha</button>
  </Card>;
}
