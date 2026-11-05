import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Bot, BadgePercent, ShieldCheck, UserPlus, Check, ChevronRight, Copy, CreditCard, Download, ExternalLink, FileSignature, FileText, Gift, ScanFace, Image as ImageIcon, KeyRound, LayoutDashboard, Loader2, LogOut, Menu, Megaphone, PenLine, Plus, RotateCcw, ScrollText, Search, Trash2, Upload, Users, Wallet, X, TrendingUp, PlugZap, EyeOff, Bell, Sparkles, AlertTriangle, Lightbulb, Link2, BriefcaseBusiness } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { uploadFile } from '@/lib/upload';
import type { ContentField } from '@shared/content';
import { EVENT_TYPES } from '@shared/promotions';
import { formatCEP, formatCNPJ, formatCPF, formatPhone } from '@shared/validators';
import { serviceCatalogFrom, serviceLabel, REQUEST_CATEGORIES, SERVICE_ICONS, type ServiceCategory, type ServiceIcon } from '@shared/services';
import { useSite } from '@/lib/site';
import NotificationBell from '@/components/NotificationBell';
import { NotificationsSection, MarketingSection, PricingCard, BenefitProductsCard, TrialCard } from './admin/EngageSections';
import { TRIAL_UNITS, type TrialUnit } from '@shared/subscription';
import { demosFrom, type DemoProfessional, type Professional } from '@shared/catalog';
import { SERVICE_ICON_LABELS, serviceIcon } from '@/lib/serviceIcons';
import { canManageRole, isFullAccess, PERMISSIONS, ROLE_DEFAULTS, STAFF_ROLE_LABELS, type Permission, type StaffRole } from '@shared/staff';
import { draftServiceFromName, draftToCategory, findServiceArea, type ServiceDraft } from '@shared/serviceAreas';
import { AutomationSection } from './admin/AutomationSection';
import { OwnerCopilotSection } from './admin/OwnerCopilotSection';
import '../admin.css';

type Section = 'overview' | 'copilot' | 'notifications' | 'marketing' | 'automation' | 'clients' | 'providers' | 'subscriptions' | 'payments' | 'contracts' | 'content' | 'media' | 'promotions' | 'benefits' | 'coupons' | 'audit' | 'staff' | 'account';
type StaffMe = { name: string; email: string; role: StaffRole; permissions: Permission[]; mustChangePassword: boolean };
type AdminUser = { id: number; name: string; email: string; accountType: 'client' | 'provider'; role: string; status: string; city?: string; vip: boolean; discountPercent: number; featured: boolean; profileComplete?: boolean; createdAt?: string; code?: string; specialty?: string; whatsapp?: string; source?: string; subscriptionFree?: boolean; requestCount?: number };
type Promo = { id: number; badge: string; title: string; text: string; cta: string; whatsappMessage: string; eventType?: string; imageUrl?: string; start: string; end: string; active: boolean; sortOrder: number; providerFeeCents?: number; runningNow?: boolean };
type Benefit = { id: number; userId: number; userName?: string; userEmail?: string; kind: string; title: string; description: string; amountCents: number; percent: number; expiresAt: string | null; active: boolean; createdAt: string };
type Media = { id: number; kind: string; filename: string; size: number; url: string; createdAt: string };

const NAV: Array<{ id: Section; label: string; icon: typeof Users; perm?: Permission }> = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard, perm: 'overview.view' },
  { id: 'copilot', label: 'Copilot do dono', icon: Sparkles, perm: 'overview.view' },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'marketing', label: 'Marketing e crescimento', icon: TrendingUp, perm: 'marketing.view' },
  { id: 'automation', label: 'Automação e Google', icon: Bot, perm: 'marketing.view' },
  { id: 'providers', label: 'Fornecedores (profissionais)', icon: BriefcaseBusiness, perm: 'users.view' },
  { id: 'clients', label: 'Clientes', icon: Users, perm: 'users.view' },
  { id: 'subscriptions', label: 'Assinaturas', icon: CreditCard, perm: 'subscriptions.view' },
  { id: 'payments', label: 'Pagamentos (Mercado Pago)', icon: Wallet, perm: 'payments.view' },
  { id: 'contracts', label: 'Contratos (auditoria)', icon: FileSignature, perm: 'contracts.view' },
  { id: 'content', label: 'Textos do site', icon: PenLine, perm: 'content.edit' },
  { id: 'media', label: 'Imagens', icon: ImageIcon, perm: 'content.edit' },
  { id: 'promotions', label: 'Promoções', icon: Megaphone, perm: 'promotions.manage' },
  { id: 'benefits', label: 'Bônus e benefícios', icon: Gift, perm: 'benefits.manage' },
  { id: 'coupons', label: 'Cupons', icon: BadgePercent, perm: 'benefits.manage' },
  { id: 'audit', label: 'Histórico (auditoria)', icon: ScrollText, perm: 'audit.view' },
  { id: 'staff', label: 'Equipe e acessos', icon: ShieldCheck, perm: 'staff.manage' },
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
  const [me, setMe] = useState<StaffMe | null | undefined>(undefined);
  const [section, setSection] = useState<Section>(() => { const s = new URLSearchParams(window.location.search).get('secao'); const sec = s === 'users' ? 'providers' : s; return sec && NAV.some(n => n.id === sec) ? sec as Section : 'overview'; });
  const [navOpen, setNavOpen] = useState(false);
  const loadMe = () => api<{ staff: StaffMe }>('/admin/me').then(r => setMe(r.staff)).catch(() => setMe(null));
  useEffect(() => { void loadMe(); }, []);
  if (me === undefined) return <main className="adm-page"><div className="adm-center"><Loader2 className="ob-spin" size={22}/> Carregando…</div></main>;
  if (!me) return <main className="adm-page"><div className="adm-center"><p>Acesso restrito à administração.</p><Link href="/admin" className="ob-btn ob-btn-primary">Entrar como administrador</Link></div></main>;
  const logout = () => { void api('/logout', { method: 'POST' }).finally(() => window.location.assign('/')); };
  if (me.mustChangePassword) return <FirstPassword me={me} onDone={() => void loadMe()} onLogout={logout}/>;
  const can = (perm?: Permission) => !perm || isFullAccess(me.role) || me.permissions.includes(perm);
  const nav = NAV.filter(n => can(n.perm));
  const go = (s: Section) => { setSection(s); setNavOpen(false); window.scrollTo(0, 0); };
  const current = nav.find(n => n.id === section) ?? nav[0];
  return <main className="adm-page">
    <div className={`adm-layout ${navOpen ? 'nav-open' : ''}`}>
      <button type="button" className="adm-backdrop" aria-label="Fechar menu" onClick={() => setNavOpen(false)}/>
      <aside className="adm-sidebar">
        <div className="adm-brand"><span>E</span><div><strong>Eventos Conecta</strong><small>Administração</small></div><button type="button" className="adm-close" onClick={() => setNavOpen(false)} aria-label="Fechar"><X size={18}/></button></div>
        <nav>{nav.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={current.id === item.id ? 'is-active' : ''} onClick={() => go(item.id)}><Icon size={17}/><span>{item.label}</span>{current.id === item.id && <ChevronRight size={15}/>}</button>; })}</nav>
        <div className="adm-sidebar-foot"><span className="adm-whoami"><strong>{me.name}</strong><small>{STAFF_ROLE_LABELS[me.role]}</small></span><a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Ver o site</a><button type="button" onClick={logout}><LogOut size={15}/> Sair</button></div>
      </aside>
      <section className="adm-main">
        <header className="adm-topbar"><button type="button" className="adm-menu" onClick={() => setNavOpen(true)} aria-label="Abrir menu"><Menu size={20}/></button><div><small>Administração /</small><strong>{current.label}</strong></div><span className="adm-top-actions"><NotificationBell admin onNavigate={link => { const s = new URL(link, window.location.origin).searchParams.get('secao'); go(s && NAV.some(n => n.id === s) ? s as Section : 'notifications'); }}/><span className="adm-who">{me.name}</span></span></header>
        <div className="adm-content">
          {current.id === 'overview' && <Overview go={go}/>}
          {current.id === 'providers' && <UsersSection key="providers" kind="provider"/>}
          {current.id === 'clients' && <UsersSection key="clients" kind="client"/>}
          {current.id === 'notifications' && <NotificationsSection/>}
          {current.id === 'marketing' && <MarketingSection/>}
          {current.id === 'automation' && <AutomationSection/>}
          {current.id === 'copilot' && <OwnerCopilotSection onNavigate={s => { if (NAV.some(n => n.id === s)) go(s as Section); }}/>}
          {current.id === 'subscriptions' && <SubscriptionsSection/>}
          {current.id === 'payments' && <PaymentsSection/>}
          {current.id === 'contracts' && <ContractsSection/>}
          {current.id === 'content' && <ContentSection/>}
          {current.id === 'media' && <MediaSection/>}
          {current.id === 'promotions' && <PromotionsSection/>}
          {current.id === 'benefits' && <BenefitsSection/>}
          {current.id === 'coupons' && <CouponsSection/>}
          {current.id === 'audit' && <AuditSection/>}
          {current.id === 'staff' && <StaffSection me={me}/>}
          {current.id === 'account' && <AccountSection/>}
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
      <button type="button" onClick={() => go('clients')}><span>Usuários</span><strong>{data?.users ?? '—'}</strong></button>
      <button type="button" onClick={() => go('providers')} className={data?.pending ? 'is-alert' : ''}><span>Cadastros em análise</span><strong>{data?.pending ?? '—'}</strong></button>
      <div><span>Pedidos</span><strong>{data?.events ?? '—'}</strong></div>
      <button type="button" onClick={() => go('subscriptions')}><span>Assinaturas vigentes</span><strong>{data?.activeSubscriptions ?? '—'}</strong></button>
      <div><span>Receita de assinaturas (30 dias)</span><strong>{data ? money(data.subscriptionRevenue30dCents) : '—'}</strong></div>
      <button type="button" onClick={() => go('contracts')}><span>Contratos gerados</span><strong>{data?.contracts ?? '—'}</strong></button>
    </div>
    <Card title="Atalhos">
      <div className="adm-shortcuts">
        <button type="button" onClick={() => go('providers')}><Users size={18}/> Aprovar cadastros</button>
        <button type="button" onClick={() => go('content')}><PenLine size={18}/> Editar textos e fotos</button>
        <button type="button" onClick={() => go('promotions')}><Megaphone size={18}/> Criar promoção</button>
        <button type="button" onClick={() => go('benefits')}><Gift size={18}/> Dar bônus a um usuário</button>
      </div>
    </Card>
  </div>;
}

const SIGNUP_SOURCE_LABEL: Record<string, string> = { google: 'Google', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', whatsapp: 'WhatsApp', indicacao: 'Indicação', direto: 'Direto', outros: 'Outros sites' };

/** Lista de clientes ou de fornecedores (abas separadas no menu). */
function UsersSection({ kind }: { kind: 'client' | 'provider' }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const load = () => api<{ users: AdminUser[] }>('/admin/users').then(r => setUsers(r.users)).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const provider = kind === 'provider';
  const ofKind = useMemo(() => (users ?? []).filter(u => u.accountType === kind), [users, kind]);
  const toApprove = ofKind.filter(u => u.status === 'pending' && u.profileComplete).length;
  const list = useMemo(() => ofKind.filter(u => (!status || (status === 'to-approve' ? u.status === 'pending' && u.profileComplete : u.status === status)) && (!search || `${u.name} ${u.email} ${u.city ?? ''} ${u.code ?? ''} ${u.specialty ?? ''} ${u.whatsapp ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [ofKind, search, status]);
  return <div className="adm-stack">
    <div className="adm-kind-head">
      <div className={`adm-kind-badge ${provider ? 'is-provider' : 'is-client'}`}>{provider ? <BriefcaseBusiness size={18}/> : <Users size={18}/>} {provider ? 'Fornecedores (profissionais)' : 'Clientes'}</div>
      <div className="adm-kind-stats"><span><strong>{ofKind.length}</strong> no total</span><span><strong>{ofKind.filter(u => u.status === 'active').length}</strong> ativos</span>{provider && <button type="button" className={toApprove ? 'is-alert' : ''} onClick={() => setStatus('to-approve')}><strong>{toApprove}</strong> para aprovar</button>}</div>
    </div>
    <div className="adm-filters">
      <label className="adm-search"><Search size={16}/><input placeholder={provider ? 'Nome, e-mail, cidade, profissão ou código GC-' : 'Nome, e-mail, cidade ou WhatsApp'} value={search} onChange={e => setSearch(e.target.value)}/></label>
      <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Situação"><option value="">Todas as situações</option>{provider && <option value="to-approve">Prontos para aprovar</option>}{Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    </div>
    <Card>
      {!users ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !list.length ? <Empty text={provider ? 'Nenhum fornecedor encontrado.' : 'Nenhum cliente encontrado.'}/> :
        <div className="adm-list">{list.map(u => <button type="button" key={u.id} className={`adm-row adm-row-${kind}`} onClick={() => setOpenId(u.id)}>
          <div className="adm-row-main"><strong>{u.name || '(sem nome)'}</strong><span>{[provider ? u.code : null, provider ? u.specialty : null, u.city, u.email].filter(Boolean).join(' · ')}</span><span>{[u.whatsapp ? `WhatsApp ${formatPhone(u.whatsapp)}` : null, u.source ? `veio por ${SIGNUP_SOURCE_LABEL[u.source] ?? u.source}` : null, !provider && u.requestCount ? `${u.requestCount} pedido(s)` : null, u.createdAt ? `desde ${new Date(u.createdAt).toLocaleDateString('pt-BR')}` : null].filter(Boolean).join(' · ')}</span></div>
          <div className="adm-row-tags"><span className={`adm-tag adm-st-${u.status}`}>{statusLabel[u.status] ?? u.status}</span>{provider && <span className={`adm-tag ${u.profileComplete ? 'adm-ok' : 'adm-warn'}`}>{u.profileComplete ? 'Cadastro completo' : 'Cadastro incompleto'}</span>}{provider && u.subscriptionFree && <span className="adm-tag adm-vip">Assinatura grátis</span>}{u.vip && <span className="adm-tag adm-vip">VIP</span>}{u.featured && <span className="adm-tag adm-vip">Destaque</span>}</div>
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
          {u.role !== 'admin' && u.status !== 'deleted' && <button type="button" className="ob-btn ob-btn-danger" disabled={!!busy} onClick={() => { if (confirm('Excluir esta conta de forma definitiva? Os dados pessoais são apagados e fica só o registro no histórico. Para voltar, a pessoa terá de se cadastrar de novo.')) void patch({ status: 'deleted' }, 'delete'); }}>Excluir</button>}
        </div>
        {u.accountType === 'provider' && !data.profileComplete && <p className="adm-alert">Este profissional ainda não completou o cadastro obrigatório (logo, foto do rosto, fotos de trabalhos, documento e Pix). A aprovação fica bloqueada até lá.</p>}
        <ResetLink userId={u.id} disabled={u.role === 'admin'}/>
        {u.accountType === 'provider' && <ProviderGrowth userId={u.id}/>}
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
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= value.length) return; const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; setAutoIndex(null); onChange(next); };
  const removeCategory = (i: number) => {
    if (value.length <= 1) { toast.error('Mantenha pelo menos uma categoria.'); return; }
    if (!confirm(`Excluir a categoria “${value[i].name || 'sem nome'}” e todas as profissões dela? Profissionais cadastrados nessas profissões deixam de receber pedidos delas até escolherem outra.`)) return;
    setAutoIndex(null);
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
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [autoIndex, setAutoIndex] = useState<number | null>(null);
  const allLabels = () => value.flatMap(c => c.services.map(sv => sv.label));
  /** Cria a categoria só com o nome: ícone, frase, cálculo e profissões derivadas da área. */
  const createService = async () => {
    const name = newName.trim();
    if (name.length < 2) { toast.error('Digite o nome do serviço (ex.: Confeitaria, DJ, Fotografia).'); return; }
    if (value.some(c => c.name.trim().toLowerCase() === name.toLowerCase())) { toast.error('Já existe um serviço com esse nome.'); return; }
    setCreating(true);
    let draft: ServiceDraft; let source = 'base';
    try { const r = await api<{ draft: ServiceDraft; source: string }>('/admin/service-draft', { method: 'POST', body: JSON.stringify({ name, existing: allLabels() }) }); draft = r.draft; source = r.source; }
    catch { const local = draftServiceFromName(name, allLabels()); draft = local.draft; source = local.matched ? 'base' : 'generico'; }
    finally { setCreating(false); }
    onChange([...value, draftToCategory(draft)]);
    setAutoIndex(value.length);
    setNewName('');
    toast.success(source === 'generico' ? 'Serviço criado. Confira a frase, o ícone e as profissões.' : `Serviço criado com ${draft.services.length} profissões${source === 'ia' ? ' sugeridas pela IA' : ''}. Confira e clique em Salvar e publicar.`);
  };
  /** Acrescenta as profissões da área que ainda não existem nesta categoria. */
  const suggestServices = (i: number) => {
    const area = findServiceArea(value[i].name);
    const taken = new Set(allLabels().map(l => l.toLowerCase()));
    const extra = (area?.services ?? []).filter(l => !taken.has(l.toLowerCase()));
    if (!extra.length) { toast.info(area ? 'Todas as profissões sugeridas para esta área já existem.' : 'Não reconheci a área pelo nome. Adicione as profissões à mão.'); return; }
    set(i, { services: [...value[i].services, ...extra.map(label => ({ id: '', label }))], ...(value[i].icon === 'utensils' && area ? { icon: area.icon } : {}) });
    toast.success(`${extra.length} ${extra.length === 1 ? 'profissão adicionada' : 'profissões adicionadas'}.`);
  };
  return <div className="adm-svc">
    <p className="adm-muted">Cada categoria vira um card na página inicial e aparece no pedido de orçamento. As profissões são o que o profissional escolhe no cadastro e o que o cliente pode pedir. Depois de mudar, clique em <strong>Salvar e publicar</strong>.</p>
    {value.map((cat, i) => { const Icon = serviceIcon(cat.icon); return <div className="adm-svc-card" key={cat.id || `novo-${i}`}>
      {autoIndex === i && <div className="adm-svc-auto"><Sparkles size={15}/><span>Criado automaticamente. Confira o ícone, a frase e as profissões, envie uma foto de capa e clique em <strong>Salvar e publicar</strong>. As páginas do Google deste serviço são criadas ao publicar.</span></div>}
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
        <div className="adm-svc-add"><input value={drafts[i] ?? ''} placeholder="Nova profissão (ex.: Confeiteiro(a))" maxLength={100} onChange={e => setDrafts(d => ({ ...d, [i]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addService(i); } }}/><button type="button" className="ob-btn ob-btn-outline" onClick={() => addService(i)}><Plus size={16}/> Adicionar profissão</button><button type="button" className="ob-btn ob-btn-outline" onClick={() => suggestServices(i)} title="Acrescenta profissões comuns desta área"><Sparkles size={16}/> Sugerir profissões</button></div>
        {!cat.services.length && <small className="adm-svc-warn">Adicione pelo menos uma profissão antes de salvar.</small>}
      </div>
    </div>; })}
    <div className="adm-svc-create">
      <strong>Criar novo serviço</strong>
      <p className="adm-muted">Digite só o nome. A plataforma cria a categoria, escolhe o ícone, a forma de calcular o valor e as profissões da área.</p>
      <div className="adm-svc-add"><input value={newName} placeholder="Ex.: Confeitaria, DJ, Fotografia, Churrasco, Decoração" maxLength={80} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void createService(); } }}/><button type="button" className="ob-btn ob-btn-primary" disabled={creating} onClick={() => void createService()}>{creating ? <Loader2 className="ob-spin" size={16}/> : <Plus size={16}/>} Criar serviço</button></div>
    </div>
  </div>;
}

const safeDemos = (raw: string, values: Record<string, string>): DemoProfessional[] => {
  try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; } catch { /* volta à lista salva */ }
  return demosFrom(values);
};

/** Portfólios demonstrativos: adicionar, editar e excluir. */
function DemoEditor({ value, categories, onChange }: { value: DemoProfessional[]; categories: ServiceCategory[]; onChange: (list: DemoProfessional[]) => void }) {
  const set = (i: number, patch: Partial<DemoProfessional>) => onChange(value.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= value.length) return; const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };
  const remove = (i: number) => { if (confirm(`Excluir o portfólio demonstrativo “${value[i].name || 'sem nome'}”?`)) onChange(value.filter((_, idx) => idx !== i)); };
  const add = () => onChange([...value, { id: '', name: 'Novo portfólio', categoryId: categories[0]?.id ?? '', category: '', city: '', description: '', image: '', tags: [] }]);
  return <div className="adm-svc">
    <p className="adm-muted">Exemplos ilustrativos mostrados na página inicial e no catálogo (sempre com o selo “Portfólio ilustrativo”). Para escondê-los do site, use a aba <strong>Catálogo</strong>.</p>
    {!value.length && <Empty text="Nenhum portfólio demonstrativo."/>}
    {value.map((d, i) => <div className="adm-svc-card" key={d.id || `novo-${i}`}>
      <div className="adm-svc-head">
        <input className="adm-svc-name" value={d.name} aria-label="Nome do portfólio" placeholder="Nome (ex.: Ateliê da Mesa)" maxLength={100} onChange={e => set(i, { name: e.target.value })}/>
        <div className="adm-row-actions">
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover para cima">↑</button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Mover para baixo">↓</button>
          <button type="button" className="danger" onClick={() => remove(i)}><Trash2 size={14}/> Excluir</button>
        </div>
      </div>
      <div className="adm-svc-grid">
        <label className="adm-content-field"><span className="adm-content-label">Especialidade (linha acima do nome)</span><input value={d.category} maxLength={100} placeholder="Ex.: Italiana contemporânea" onChange={e => set(i, { category: e.target.value })}/></label>
        <label className="adm-content-field"><span className="adm-content-label">Serviço</span><select value={d.categoryId} onChange={e => set(i, { categoryId: e.target.value })}><option value="">—</option>{categories.map(c => <option key={c.id || c.name} value={c.id}>{c.name}</option>)}</select></label>
        <label className="adm-content-field"><span className="adm-content-label">Cidade</span><input value={d.city} maxLength={100} placeholder="Ex.: Campinas, SP" onChange={e => set(i, { city: e.target.value })}/></label>
      </div>
      <label className="adm-content-field"><span className="adm-content-label">Descrição</span><textarea rows={3} maxLength={1000} value={d.description} onChange={e => set(i, { description: e.target.value })}/></label>
      <label className="adm-content-field"><span className="adm-content-label">Etiquetas (separadas por vírgula)</span><input value={d.tags.join(', ')} placeholder="Ex.: Chef executivo, Jantar em casa" onChange={e => set(i, { tags: e.target.value.split(',').map(t => t.trimStart()) })}/></label>
      <div className="adm-content-field"><span className="adm-content-label">Foto de capa</span><ImagePicker value={d.image} onChange={url => set(i, { image: url })}/></div>
    </div>)}
    <button type="button" className="ob-btn ob-btn-primary adm-svc-new" onClick={add}><Plus size={16}/> Adicionar portfólio</button>
  </div>;
}

/** Cards da seção de profissionais da página inicial: excluir ou mostrar de novo. */
function ShowcaseEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [items, setItems] = useState<Professional[] | null>(null);
  useEffect(() => { api<{ professionals: Professional[] }>('/professionals').then(r => setItems(r.professionals)).catch(() => setItems([])); }, []);
  const hidden = value.split(',').filter(Boolean);
  const toggle = (id: string) => onChange((hidden.includes(id) ? hidden.filter(h => h !== id) : [...hidden, id]).join(','));
  if (!items) return <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div>;
  const shown = items.filter(p => !hidden.includes(p.id)).slice(0, 3).map(p => p.id);
  if (!items.length) return <Empty text="Nenhum profissional ou portfólio para mostrar."/>;
  return <div className="adm-list">
    <p className="adm-muted">A página inicial mostra os 3 primeiros cards não excluídos. Ao excluir um, o próximo da lista entra no lugar. Excluir daqui não apaga o profissional do catálogo; para apagar um portfólio demonstrativo, use a aba Serviços e capas.</p>
    {items.map(p => { const off = hidden.includes(p.id); return <div className="adm-row adm-row-static" key={p.id}>
      {p.image ? <img className="adm-row-thumb" src={p.image} alt=""/> : <span className="adm-row-thumb"><ImageIcon size={18}/></span>}
      <div className="adm-row-main"><strong>{p.name}</strong><span>{p.type} · {p.city}{p.demo ? ' · portfólio ilustrativo' : ''}</span></div>
      <div className="adm-row-tags">{off ? <span className="adm-tag adm-warn">Excluído da página inicial</span> : shown.includes(p.id) ? <span className="adm-tag adm-ok">Na página inicial</span> : <span className="adm-tag">Na fila</span>}</div>
      <div className="adm-row-actions">{off ? <button type="button" onClick={() => toggle(p.id)}><RotateCcw size={14}/> Mostrar de novo</button> : <button type="button" className="danger" onClick={() => toggle(p.id)}><Trash2 size={14}/> Excluir</button>}</div>
    </div>; })}
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
          : f.type === 'select' ? <select className="adm-select" value={values[f.key] ?? f.default} onChange={e => setValues({ ...values, [f.key]: e.target.value })}>{(f.options ?? []).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>
          : f.type === 'boolean' ? <label className="adm-switch"><input type="checkbox" checked={values[f.key] === 'true'} onChange={e => setValues({ ...values, [f.key]: e.target.checked ? 'true' : 'false' })}/> {values[f.key] === 'true' ? 'Ligado' : 'Desligado'}</label>
          : f.type === 'image' ? <ImagePicker value={values[f.key] ?? ''} onChange={url => setValues({ ...values, [f.key]: url })}/>
          : f.type === 'showcase' ? <ShowcaseEditor value={values[f.key] ?? ''} onChange={v => setValues({ ...values, [f.key]: v })}/>
          : f.type === 'demos' ? <DemoEditor value={values[f.key] ? safeDemos(values[f.key], values) : demosFrom(values)} categories={values['services.catalog'] ? safeCatalog(values['services.catalog'], values) : serviceCatalogFrom(values)} onChange={list => setValues({ ...values, [f.key]: JSON.stringify(list) })}/>
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

const emptyPromo = { badge: '', title: '', text: '', cta: 'Ver fornecedores', whatsappMessage: '', eventType: '', imageUrl: '', start: '01-01', end: '12-31', active: true, sortOrder: 0, providerFeeCents: 0 };

function PromotionsSection() {
  const [list, setList] = useState<Promo[] | null>(null);
  const [editing, setEditing] = useState<(typeof emptyPromo & { id?: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ promotions: Promo[] }>('/admin/promotions').then(r => setList(r.promotions)).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const toPayload = (p: typeof emptyPromo) => ({ ...p, eventType: p.eventType || null, imageUrl: p.imageUrl || null, sortOrder: Number(p.sortOrder) || 0, providerFeeCents: Math.max(0, Math.round(Number(p.providerFeeCents) || 0)) });
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
      <p className="adm-muted">Cada promoção aparece sozinha no período escolhido (todo ano). Quando o cliente clica, vê os fornecedores participantes e escolhe com quem fechar. Fornecedores nível ALTO entram pagando o adicional que você define; VIPs entram sem pagar.</p>
      {!list ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !list.length ? <Empty text="Nenhuma promoção cadastrada."/> :
        <div className="adm-list">{list.map(p => <div className="adm-row adm-row-static" key={p.id}>
          {p.imageUrl ? <img className="adm-row-thumb" src={p.imageUrl} alt=""/> : <span className="adm-row-thumb"><Megaphone size={18}/></span>}
          <div className="adm-row-main"><strong>{p.title}</strong><span>{p.badge} · {md(p.start)} a {md(p.end)} · adicional do fornecedor {p.providerFeeCents ? brl(p.providerFeeCents) : 'grátis'}</span></div>
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
          <label className="ob-field"><span>Adicional para o fornecedor participar (R$)</span><input inputMode="decimal" value={String((editing.providerFeeCents ?? 0) / 100).replace('.', ',')} onChange={e => setEditing({ ...editing, providerFeeCents: Math.round((Number(e.target.value.replace(/\./g, '').replace(',', '.')) || 0) * 100) })} placeholder="0,00"/><small className="adm-muted">0 = sem custo. Esse valor aparece para o fornecedor no painel dele.</small></label>
          <label className="ob-field"><span>Começa em (dia/mês)</span><input type="text" inputMode="numeric" value={md(editing.start)} onChange={e => { const [d = '', m = ''] = e.target.value.split('/'); setEditing({ ...editing, start: `${m.padStart(2, '0').slice(0, 2)}-${d.padStart(2, '0').slice(0, 2)}` }); }} placeholder="01/11"/></label>
          <label className="ob-field"><span>Termina em (dia/mês)</span><input type="text" inputMode="numeric" value={md(editing.end)} onChange={e => { const [d = '', m = ''] = e.target.value.split('/'); setEditing({ ...editing, end: `${m.padStart(2, '0').slice(0, 2)}-${d.padStart(2, '0').slice(0, 2)}` }); }} placeholder="06/01"/></label>
          <label className="ob-field"><span>Ordem</span><input type="number" min={0} value={editing.sortOrder} onChange={e => setEditing({ ...editing, sortOrder: Number(e.target.value) })}/></label>
          <label className="adm-switch"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })}/> Promoção ligada</label>
        </div>
        <button type="button" className="ob-btn ob-btn-primary adm-full" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="ob-spin" size={16}/> : <Check size={16}/>} Salvar promoção</button>
        {editing.id ? <PromoParticipants promotionId={editing.id}/> : <p className="adm-muted">Salve a promoção para incluir fornecedores.</p>}
      </div>
    </div></div>}
  </div>;
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Participant = { userId: number; name: string; email: string; source: string; validUntil: string | null; code: string };
const SOURCE_LABEL: Record<string, string> = { paid: 'Pagou o adicional', admin: 'Incluído por você (VIP)', vip: 'VIP', free: 'Sem custo' };

/** Fornecedores de uma promoção: incluir (VIP, sem cobrança) ou remover. */
function PromoParticipants({ promotionId }: { promotionId: number }) {
  const [data, setData] = useState<{ participants: Participant[]; providers: Array<{ id: number; name: string; email: string; promoVip: boolean }> } | null>(null);
  const [pick, setPick] = useState('');
  const load = () => api<NonNullable<typeof data>>(`/admin/promotions/${promotionId}/participants`).then(setData).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, [promotionId]);
  const add = async () => { if (!pick) return; try { await api(`/admin/promotions/${promotionId}/participants`, { method: 'POST', body: JSON.stringify({ userId: Number(pick) }) }); setPick(''); toast.success('Fornecedor incluído na promoção.'); await load(); } catch (e) { toast.error(errText(e)); } };
  const remove = async (p: Participant) => { if (!confirm(`Tirar ${p.name} desta promoção?`)) return; try { await api(`/admin/promotions/${promotionId}/participants/${p.userId}`, { method: 'DELETE' }); await load(); } catch (e) { toast.error(errText(e)); } };
  if (!data) return <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div>;
  const inList = new Set(data.participants.map(p => p.userId));
  return <div className="adm-promo-participants">
    <div className="adm-section-title">Fornecedores nesta promoção ({data.participants.length})</div>
    {!data.participants.length ? <Empty text="Nenhum fornecedor participando ainda."/> : <div className="adm-list">{data.participants.map(p => <div className="adm-row adm-row-static" key={p.userId}>
      <div className="adm-row-main"><strong>{p.name}</strong><span>{p.code} · {p.email}{p.validUntil ? ` · até ${new Date(p.validUntil).toLocaleDateString('pt-BR')}` : ''}</span></div>
      <div className="adm-row-tags"><span className={`adm-tag ${p.source === 'paid' ? 'adm-ok' : 'adm-vip'}`}>{SOURCE_LABEL[p.source] ?? p.source}</span></div>
      <div className="adm-row-actions"><button type="button" className="danger" onClick={() => void remove(p)} aria-label="Remover"><Trash2 size={15}/></button></div>
    </div>)}</div>}
    <div className="adm-svc-add"><select value={pick} onChange={e => setPick(e.target.value)} aria-label="Fornecedor"><option value="">Incluir fornecedor sem cobrança (VIP)…</option>{data.providers.filter(p => !inList.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.name} — {p.email}{p.promoVip ? ' (VIP)' : ''}</option>)}</select><button type="button" className="ob-btn ob-btn-outline" disabled={!pick} onClick={() => void add()}><Plus size={16}/> Incluir</button></div>
  </div>;
}

type Payment = { id: number; userId: number; code: string; name: string; email: string; kind: string; status: string; amountCents: number; mpPaymentId: string; reference: string; createdAt: string; approvedAt: string | null };
type MpStatus = { accessToken: { configured: boolean; source: string; hint: string; test: boolean }; webhookSecret: { configured: boolean; source: string; hint: string }; descriptor: string; webhookUrl: string };
const PAY_STATUS: Record<string, string> = { approved: 'Pago', pending: 'Aguardando', rejected: 'Recusado', expired: 'Expirado', cancelled: 'Cancelado' };

/** Chaves do Mercado Pago e pagamentos recebidos pelo site (com a referência que aparece no extrato). */
function PaymentsSection() {
  const [status, setStatus] = useState<MpStatus | null>(null);
  const [form, setForm] = useState({ accessToken: '', webhookSecret: '', descriptor: '' });
  const [busy, setBusy] = useState('');
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    api<MpStatus>('/admin/payments/settings').then(r => { setStatus(r); setForm(f => ({ ...f, descriptor: r.descriptor })); }).catch(e => toast.error(errText(e)));
    api<{ payments: Payment[] }>('/admin/payments').then(r => setPayments(r.payments)).catch(e => toast.error(errText(e)));
  }, []);
  const save = async (patch: Partial<typeof form>, label: string) => {
    setBusy(label);
    try { const r = await api<MpStatus>('/admin/payments/settings', { method: 'PUT', body: JSON.stringify(patch) }); setStatus(r); setForm({ accessToken: '', webhookSecret: '', descriptor: r.descriptor }); toast.success('Chaves salvas.'); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  const test = async () => {
    setBusy('test');
    try { const r = await api<{ account: { id: number; nickname: string; email: string } }>('/admin/payments/test', { method: 'POST' }); toast.success(`Conectado à conta ${r.account.nickname || r.account.email || r.account.id}.`); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success('Copiado.'); } catch { toast.error('Não foi possível copiar.'); } };
  const q = filter.trim().toLowerCase();
  const list = (payments ?? []).filter(p => !q || `${p.code} ${p.name} ${p.email} ${p.reference} ${p.mpPaymentId} ${p.kind}`.toLowerCase().includes(q));
  const csv = () => {
    const rows = [['Data', 'Código do assinante', 'Nome', 'E-mail', 'Tipo', 'Valor (R$)', 'Situação', 'ID no Mercado Pago', 'Referência externa'], ...list.map(p => [new Date(p.createdAt).toLocaleString('pt-BR'), p.code, p.name, p.email, p.kind, (p.amountCents / 100).toFixed(2).replace('.', ','), PAY_STATUS[p.status] ?? p.status, p.mpPaymentId, p.reference])];
    const text = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `pagamentos-eventosconecta-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const keyState = (k: { configured: boolean; source: string; hint: string }) => k.configured ? <span className="adm-tag adm-ok">Cadastrada {k.hint}{k.source === 'render' ? ' (variável do Render)' : ''}</span> : <span className="adm-tag adm-warn">Não cadastrada</span>;
  return <div className="adm-stack">
    <TrialCard/>
    <PricingCard/>
    <BenefitProductsCard/>
    <Card title="Chaves do Mercado Pago" action={status?.accessToken.configured ? <button type="button" className="ob-btn ob-btn-outline" disabled={busy === 'test'} onClick={() => void test()}>{busy === 'test' ? <Loader2 className="ob-spin" size={16}/> : <PlugZap size={16}/>} Testar conexão</button> : undefined}>
      {!status ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : <div className="adm-content-fields">
        <p className="adm-muted">Pegue as chaves em <strong>Mercado Pago → Seu negócio → Configurações → Suas integrações → Credenciais de produção</strong>. Por segurança, a chave salva nunca é mostrada de novo (só os 4 últimos caracteres).</p>
        {status.accessToken.test && <p className="adm-alert">Você está usando uma chave de TESTE (TEST-…). Pagamentos reais só funcionam com a chave de produção (APP_USR-…).</p>}
        <div className="adm-content-field"><div className="adm-content-label"><span>Access Token (produção)</span>{keyState(status.accessToken)}</div>
          <div className="adm-svc-add"><input type="password" autoComplete="off" value={form.accessToken} placeholder="APP_USR-…" onChange={e => setForm({ ...form, accessToken: e.target.value })}/><button type="button" className="ob-btn ob-btn-primary" disabled={!form.accessToken || busy === 'token'} onClick={() => void save({ accessToken: form.accessToken.trim() }, 'token')}>{busy === 'token' ? <Loader2 className="ob-spin" size={16}/> : <Check size={16}/>} Salvar</button>{status.accessToken.source === 'painel' && <button type="button" className="ob-btn ob-btn-danger" onClick={() => { if (confirm('Remover o Access Token salvo no painel?')) void save({ accessToken: '' }, 'token'); }}>Remover</button>}</div></div>
        <div className="adm-content-field"><div className="adm-content-label"><span>Assinatura secreta do webhook</span>{keyState(status.webhookSecret)}</div>
          <div className="adm-svc-add"><input type="password" autoComplete="off" value={form.webhookSecret} placeholder="Chave secreta das notificações" onChange={e => setForm({ ...form, webhookSecret: e.target.value })}/><button type="button" className="ob-btn ob-btn-primary" disabled={!form.webhookSecret || busy === 'secret'} onClick={() => void save({ webhookSecret: form.webhookSecret.trim() }, 'secret')}>{busy === 'secret' ? <Loader2 className="ob-spin" size={16}/> : <Check size={16}/>} Salvar</button></div>
          <small className="adm-muted">Em Suas integrações → Webhooks, cadastre a URL abaixo e marque os eventos “Pagamentos” e “Planos e assinaturas”. Depois copie a “assinatura secreta” para cá.</small>
          <div className="adm-svc-add"><input readOnly value={status.webhookUrl} aria-label="URL do webhook"/><button type="button" className="ob-btn ob-btn-outline" onClick={() => void copy(status.webhookUrl)}><Copy size={16}/> Copiar URL</button></div></div>
        <div className="adm-content-field"><div className="adm-content-label"><span>Nome na fatura do cartão (até 22 letras)</span></div>
          <div className="adm-svc-add"><input value={form.descriptor} maxLength={22} onChange={e => setForm({ ...form, descriptor: e.target.value })}/><button type="button" className="ob-btn ob-btn-outline" disabled={busy === 'desc'} onClick={() => void save({ descriptor: form.descriptor }, 'desc')}>Salvar</button></div></div>
      </div>}
    </Card>
    <Card title="Como achar os pagamentos do site no extrato">
      <p className="adm-muted">Toda cobrança do Eventos Conecta vai para o Mercado Pago com:</p>
      <ul className="adm-help-list">
        <li><strong>Referência externa</strong> começando com <code>GASTROCONECTA-</code>, por exemplo <code>GASTROCONECTA-ASSINATURA-U12-P45</code> (U12 = assinante nº 12; P45 = pagamento nº 45 desta lista) ou <code>GASTROCONECTA-PROMOCAO-U12-P46</code>.</li>
        <li><strong>Descrição</strong> no formato <code>Eventos Conecta · Assinatura mensal · GC-00012 · Nome do profissional</code>.</li>
        <li>No relatório do Mercado Pago (Relatórios → Vendas/Liberações), filtre ou procure por <code>GASTROCONECTA</code>: o que não tiver essa marca veio das suas outras plataformas.</li>
      </ul>
    </Card>
    <Card title="Pagamentos recebidos pelo site" action={<button type="button" className="ob-btn ob-btn-outline" disabled={!list.length} onClick={csv}><Download size={16}/> Baixar planilha</button>}>
      <label className="adm-search"><Search size={16}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar por código GC-, nome, e-mail, referência ou ID do Mercado Pago"/></label>
      {!payments ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !list.length ? <Empty text="Nenhum pagamento encontrado."/> :
        <div className="adm-list">{list.map(p => <div className="adm-row adm-row-static" key={p.id}>
          <div className="adm-row-main"><strong>{p.code} · {p.name}</strong><span>{p.kind} · {new Date(p.createdAt).toLocaleString('pt-BR')}</span><span>{p.reference ? <>Ref.: <code>{p.reference}</code></> : 'Sem referência (pagamento antigo ou cortesia)'}{p.mpPaymentId ? ` · ID MP ${p.mpPaymentId}` : ''}</span></div>
          <div className="adm-row-tags"><strong>{brl(p.amountCents)}</strong><span className={`adm-tag ${p.status === 'approved' ? 'adm-ok' : p.status === 'pending' ? '' : 'adm-warn'}`}>{PAY_STATUS[p.status] ?? p.status}</span></div>
        </div>)}</div>}
    </Card>
  </div>;
}

/** Nível (BAIXO/MÉDIO/ALTO) e acesso VIP às promoções — o VIP só aparece para o admin. */
function ProviderGrowth({ userId }: { userId: number }) {
  const [data, setData] = useState<{ level: { level: string; label: string; automatic: string; override: string | null; average: number; count: number }; promoVip: boolean; subscriberCode: string; promotions: Array<{ id: number; title: string; source: string; validUntil: string | null }> } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<NonNullable<typeof data>>(`/admin/users/${userId}/growth`).then(setData).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, [userId]);
  const patch = async (body: Record<string, unknown>) => { setBusy(true); try { await api(`/admin/users/${userId}/growth`, { method: 'PATCH', body: JSON.stringify(body) }); toast.success('Atualizado.'); await load(); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); } };
  if (!data) return null;
  const names: Record<string, string> = { baixo: 'BAIXO', medio: 'MÉDIO', alto: 'ALTO' };
  return <>
    <div className="adm-section-title"><TrendingUp size={15}/> Nível e promoções</div>
    <Field label="Código do assinante (aparece no Mercado Pago)" value={data.subscriberCode}/>
    <Field label="Nível atual" value={<span className={`adm-tag adm-level-${data.level.level}`}>{data.level.label}</span>}/>
    <Field label="Avaliações" value={data.level.count ? `média ${data.level.average.toLocaleString('pt-BR')} em ${data.level.count} avaliação(ões) · pelas regras seria ${names[data.level.automatic]}` : `sem avaliações · pelas regras seria ${names[data.level.automatic]}`}/>
    <label className="ob-field"><span>Definir nível</span><select value={data.level.override ?? 'auto'} disabled={busy} onChange={e => void patch({ levelOverride: e.target.value })}><option value="auto">Automático (pelas avaliações)</option><option value="baixo">Fixar BAIXO</option><option value="medio">Fixar MÉDIO</option><option value="alto">Fixar ALTO</option></select></label>
    <label className="adm-switch"><input type="checkbox" checked={data.promoVip} disabled={busy} onChange={e => void patch({ promoVip: e.target.checked })}/> <EyeOff size={14}/> Acesso VIP às promoções (entra sem pagar e sem precisar do nível ALTO). O profissional não vê que é VIP.</label>
    {data.promotions.length > 0 && <Field label="Participando agora" value={data.promotions.map(p => p.title).join(', ')}/>}
  </>;
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

type SubRow = { userId: number; name: string; email: string; accountStatus: string; phase: string; label: string; periodEnd: string | null; autoRenew: string | null; lastPaidAt: string | null; trialUntil: string | null; trialActive: boolean };
function SubscriptionsSection() {
  const [data, setData] = useState<{ priceCents: number; paymentsConfigured: boolean; subscriptions: SubRow[] } | null>(null);
  const [phase, setPhase] = useState('');
  const [trialFor, setTrialFor] = useState<{ userId: number; amount: string; unit: TrialUnit } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<NonNullable<typeof data>>('/admin/subscriptions').then(setData).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const giveTrial = async () => {
    if (!trialFor) return;
    setBusy(true);
    try { const r = await api<{ trialUntil: string | null }>(`/admin/subscriptions/${trialFor.userId}/trial`, { method: 'POST', body: JSON.stringify({ amount: Math.max(1, Math.floor(Number(trialFor.amount) || 1)), unit: trialFor.unit }) }); toast.success(r.trialUntil ? `Teste liberado até ${new Date(r.trialUntil).toLocaleDateString('pt-BR')}.` : 'Teste liberado.'); setTrialFor(null); await load(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const list = (data?.subscriptions ?? []).filter(s => !phase || s.phase === phase);
  return <div className="adm-stack">
    {data && !data.paymentsConfigured && <p className="adm-alert">Mercado Pago não configurado: defina MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET no Render. Até lá, libere assinaturas manualmente no cadastro de cada profissional.</p>}
    <div className="adm-filters"><select value={phase} onChange={e => setPhase(e.target.value)} aria-label="Situação"><option value="">Todas as situações</option><option value="active">Em dia</option><option value="renewal">Em renovação</option><option value="manual">Aguardando Pix manual</option><option value="blocked">Vencidas (ocultos)</option><option value="inactive">Nunca ativadas</option></select>{data && <span className="adm-muted">Mensalidade: {money(data.priceCents)}</span>}</div>
    <Card>{!data ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !list.length ? <Empty text="Nenhum profissional nesta situação."/> : <div className="adm-list">{list.map(s => <div className="adm-row" key={s.userId}><div className="adm-row-main"><strong>{s.name || s.email}</strong><span>{s.email} · vence {s.periodEnd ? new Date(s.periodEnd).toLocaleDateString('pt-BR') : '—'}{s.lastPaidAt ? ` · último pagamento ${new Date(s.lastPaidAt).toLocaleDateString('pt-BR')}` : ''}</span></div><div className="adm-row-tags"><span className={`adm-tag ${s.phase === 'active' || s.phase === 'renewal' ? 'adm-ok' : 'adm-warn'}`}>{s.label}</span>{s.autoRenew === 'authorized' && <span className="adm-tag">Pix automático</span>}{s.trialActive && s.trialUntil && <span className="adm-tag adm-vip">Teste até {new Date(s.trialUntil).toLocaleDateString('pt-BR')}</span>}<button type="button" className="adm-tag adm-tag-btn" onClick={() => setTrialFor(trialFor?.userId === s.userId ? null : { userId: s.userId, amount: '7', unit: 'days' })}>Dar período de teste</button><span className={`adm-tag adm-st-${s.accountStatus}`}>{statusLabel[s.accountStatus] ?? s.accountStatus}</span></div>{trialFor?.userId === s.userId && <div className="adm-trial-row adm-trial-inline"><label className="adm-content-field"><span className="adm-content-label">Duração</span><input type="number" min={1} max={365} value={trialFor.amount} onChange={e => setTrialFor({ ...trialFor, amount: e.target.value })}/></label><label className="adm-content-field"><span className="adm-content-label">Unidade</span><select value={trialFor.unit} onChange={e => setTrialFor({ ...trialFor, unit: e.target.value as TrialUnit })}>{TRIAL_UNITS.map(u => <option key={u.id} value={u.id}>{u.many}</option>)}</select></label><button type="button" className="ob-btn ob-btn-primary" disabled={busy} onClick={() => void giveTrial()}>Liberar teste</button><button type="button" className="ob-btn ob-btn-outline" onClick={() => setTrialFor(null)}>Cancelar</button></div>}</div>)}</div>}</Card>
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
      const a = document.createElement('a'); a.href = url; a.download = `contrato-eventosconecta-${id}.pdf`; document.body.appendChild(a); a.click(); a.remove();
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

type AuditLog = { id: number; action: string; details: string; createdAt: string; actorId: number; actorName: string; actorEmail?: string; actorRole?: StaffRole; targetId?: number; targetName?: string };
/** Nome amigável das ações registradas. */
function actionLabel(action: string): string {
  const http = /^http\.(\w+) (.*)$/.exec(action);
  if (http) return `${({ POST: 'Enviou', PUT: 'Salvou', PATCH: 'Alterou', DELETE: 'Apagou', GET: 'Consultou' } as Record<string, string>)[http[1]] ?? http[1]} ${http[2]}`;
  const names: Record<string, string> = { 'admin.login': 'Entrou na administração', 'admin.login_failed': 'Tentativa de login recusada', 'staff.created': 'Criou acesso da equipe', 'staff.updated': 'Alterou acesso da equipe', 'staff.password_reset': 'Gerou nova senha temporária', 'staff.first_password': 'Criou a própria senha', 'account.deleted': 'Conta excluída', 'proposal.edited': 'Editou proposta', 'admin.user_update': 'Alterou conta', 'admin.content_update': 'Editou textos do site', 'account.password_reset': 'Redefiniu a senha', 'account.password_change': 'Trocou a senha' };
  return names[action] ?? action;
}

function AuditSection() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [q, setQ] = useState('');
  const load = (query = q) => { setLogs(null); api<{ logs: AuditLog[] }>(`/admin/audit?limit=1000${query ? `&q=${encodeURIComponent(query)}` : ''}`).then(r => setLogs(r.logs)).catch(e => toast.error(errText(e))); };
  useEffect(() => { load(''); }, []);
  return <Card title="Histórico de tudo o que foi feito na plataforma" action={<a className="ob-btn ob-btn-outline" href="/api/gastro/report/pdf" target="_blank" rel="noopener noreferrer"><FileText size={16}/> Relatório em PDF</a>}>
    <p className="adm-muted">Toda ação que altera dados fica registrada com quem fez, quando, o IP e o resultado. Ninguém da equipe consegue apagar este histórico.</p>
    <form className="adm-search" onSubmit={e => { e.preventDefault(); load(); }}><Search size={16}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome, e-mail, ação (ex.: excluída, proposta, login)"/><button type="submit" className="ob-btn ob-btn-outline">Buscar</button></form>
    {!logs ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : !logs.length ? <Empty text="Nada encontrado."/> :
      <div className="adm-audit">{logs.map(l => { let details: any = {}; try { details = JSON.parse(l.details); } catch { details = {}; } return <div key={l.id}>
        <time>{new Date(l.createdAt).toLocaleString('pt-BR')}</time>
        <strong>{actionLabel(l.action)}</strong>
        <span className="adm-audit-who">{l.actorName}{l.actorRole ? ` (${STAFF_ROLE_LABELS[l.actorRole]})` : ''}{l.targetName && l.targetId !== l.actorId ? ` → ${l.targetName}` : ''}{details.status ? ` · resultado ${details.status}` : ''}{details.ip ? ` · IP ${details.ip}` : ''}</span>
        {!/^http\./.test(l.action) && l.details !== '{}' && <code>{l.details.slice(0, 300)}</code>}
      </div>; })}</div>}
  </Card>;
}

type StaffRow = { id: number; name: string; email: string; role: StaffRole; permissions: Permission[]; status: string; mustChangePassword: boolean; lastSeenAt?: string };

function PermissionPicker({ value, onChange, role, me }: { value: Permission[]; onChange: (v: Permission[]) => void; role: StaffRole; me: StaffMe }) {
  if (isFullAccess(role)) return <p className="adm-muted">Administradores têm acesso a tudo, menos alterar o dono e outros administradores.</p>;
  const groups = [...new Set(PERMISSIONS.map(p => p.group))];
  const grantable = (p: Permission) => (isFullAccess(me.role) || me.permissions.includes(p)) && !(p === 'staff.manage' && (role === 'operator' || !isFullAccess(me.role)));
  return <div className="adm-perms">{groups.map(g => <fieldset key={g}><legend>{g}</legend>{PERMISSIONS.filter(p => p.group === g).map(p => <label key={p.key} className={grantable(p.key) ? '' : 'is-disabled'}><input type="checkbox" disabled={!grantable(p.key)} checked={value.includes(p.key)} onChange={e => onChange(e.target.checked ? [...value, p.key] : value.filter(x => x !== p.key))}/> {p.label}</label>)}</fieldset>)}</div>;
}

function TempPasswordNotice({ result }: { result: { emailed: boolean; temporaryPassword?: string; mailError?: string } }) {
  return result.emailed ? <div className="adm-ok"><Check size={16}/> Senha temporária enviada por e-mail. No primeiro acesso a pessoa cria a própria senha.</div>
    : <div className="adm-warn"><AlertTriangle size={16}/><div><strong>O e-mail não foi enviado.</strong> {result.mailError} Passe esta senha temporária à pessoa por um canal seguro (ela só aparece agora): <code>{result.temporaryPassword}</code></div></div>;
}

/** Equipe e acessos: criar operadores, gerentes e administradores e decidir o que cada um pode fazer. */
function StaffSection({ me }: { me: StaffMe }) {
  const [list, setList] = useState<StaffRow[] | null>(null);
  const roles = (['admin', 'manager', 'operator'] as StaffRole[]).filter(r => canManageRole(me.role, r));
  const [form, setForm] = useState<{ name: string; email: string; role: StaffRole; permissions: Permission[] }>({ name: '', email: '', role: roles.includes('operator') ? 'operator' : roles[0], permissions: ROLE_DEFAULTS.operator });
  const [editing, setEditing] = useState<{ id: number; role: StaffRole; permissions: Permission[] } | null>(null);
  const [result, setResult] = useState<{ emailed: boolean; temporaryPassword?: string; mailError?: string } | null>(null);
  const [busy, setBusy] = useState('');
  const load = () => api<{ staff: StaffRow[] }>('/admin/staff').then(r => setList(r.staff)).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => { setBusy(key); try { await fn(); if (ok) toast.success(ok); await load(); return true; } catch (e) { toast.error(errText(e)); return false; } finally { setBusy(''); } };
  const create = async () => {
    if (form.name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(form.email.trim())) { toast.error('Informe nome e e-mail.'); return; }
    setBusy('create');
    try { const r = await api<{ emailed: boolean; temporaryPassword?: string; mailError?: string }>('/admin/staff', { method: 'POST', body: JSON.stringify(form) }); setResult(r); setForm({ ...form, name: '', email: '' }); toast.success('Acesso criado.'); await load(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  if (!roles.length) return <Card title="Equipe e acessos"><Empty text="Seu acesso não permite criar pessoas na equipe."/></Card>;
  return <div className="adm-stack">
    <Card title="Liberar novo acesso">
      <p className="adm-muted">A pessoa recebe por e-mail uma senha temporária e cria a própria senha no primeiro acesso. Se esquecer a senha, ela mesma redefine em “Esqueci minha senha”. Você (dono) sempre tem acesso a tudo e ninguém pode alterar ou excluir a sua conta.</p>
      <div className="adm-form-grid">
        <label className="adm-content-field"><span className="adm-content-label">Nome</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={160}/></label>
        <label className="adm-content-field"><span className="adm-content-label">E-mail</span><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} maxLength={320}/></label>
        <label className="adm-content-field"><span className="adm-content-label">Papel</span><select value={form.role} onChange={e => { const role = e.target.value as StaffRole; setForm({ ...form, role, permissions: role === 'admin' ? [] : ROLE_DEFAULTS[role as 'manager' | 'operator'] }); }}>{roles.map(r => <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>)}</select></label>
      </div>
      <span className="adm-content-label">O que esta pessoa pode ver e fazer</span>
      <PermissionPicker value={form.permissions} onChange={permissions => setForm({ ...form, permissions })} role={form.role} me={me}/>
      <button type="button" className="ob-btn ob-btn-primary" disabled={busy === 'create'} onClick={() => void create()}>{busy === 'create' ? <Loader2 className="ob-spin" size={16}/> : <UserPlus size={16}/>} Criar acesso e enviar senha</button>
      {result && <TempPasswordNotice result={result}/>}
    </Card>
    <Card title="Equipe">
      {!list ? <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div> : <div className="adm-staff">{list.map(m => { const locked = m.role === 'owner' || !canManageRole(me.role, m.role); return <article key={m.id} className="adm-staff-row">
        <div><strong>{m.name}</strong> <span className={`adm-badge adm-role-${m.role}`}>{STAFF_ROLE_LABELS[m.role]}</span>{m.status !== 'active' && <span className="adm-badge adm-badge-off">Suspenso</span>}{m.mustChangePassword && <span className="adm-badge">Aguardando 1º acesso</span>}
          <p className="adm-muted">{m.email}{m.lastSeenAt ? ` · último acesso ${new Date(m.lastSeenAt).toLocaleString('pt-BR')}` : ''}</p>
          {!isFullAccess(m.role) && editing?.id !== m.id && <p className="adm-perm-summary">{m.permissions.length ? m.permissions.map(p => PERMISSIONS.find(x => x.key === p)?.label).join(' · ') : 'Sem permissões'}</p>}
          {m.role === 'owner' && <p className="adm-perm-summary">Acesso total e permanente. Não pode ser alterado nem excluído.</p>}
        </div>
        {!locked && editing?.id !== m.id && <div className="adm-row-actions">
          <button type="button" onClick={() => setEditing({ id: m.id, role: m.role, permissions: m.permissions })}><PenLine size={14}/> Permissões</button>
          <button type="button" disabled={!!busy} onClick={() => void act(`st-${m.id}`, () => api(`/admin/staff/${m.id}`, { method: 'PATCH', body: JSON.stringify({ status: m.status === 'active' ? 'suspended' : 'active' }) }), m.status === 'active' ? 'Acesso suspenso.' : 'Acesso reativado.')}>{m.status === 'active' ? 'Suspender' : 'Reativar'}</button>
          <button type="button" disabled={!!busy} onClick={() => { setBusy(`pw-${m.id}`); api<{ emailed: boolean; temporaryPassword?: string; mailError?: string }>(`/admin/staff/${m.id}/reset-password`, { method: 'POST' }).then(r => { setResult(r); toast.success('Nova senha temporária gerada.'); return load(); }).catch(e => toast.error(errText(e))).finally(() => setBusy('')); }}><KeyRound size={14}/> Nova senha</button>
          <button type="button" className="danger" disabled={!!busy} onClick={() => { if (confirm(`Excluir o acesso de ${m.name}? Os dados pessoais são apagados e fica só o registro no histórico. Para voltar, a pessoa precisa de um acesso novo.`)) void act(`del-${m.id}`, () => api(`/admin/staff/${m.id}`, { method: 'DELETE' }), 'Acesso excluído.'); }}><Trash2 size={14}/> Excluir</button>
        </div>}
        {editing?.id === m.id && <div className="adm-staff-edit">
          <label className="adm-content-field"><span className="adm-content-label">Papel</span><select value={editing.role} onChange={e => { const role = e.target.value as StaffRole; setEditing({ ...editing, role, permissions: role === 'admin' ? [] : editing.permissions }); }}>{roles.map(r => <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>)}</select></label>
          <PermissionPicker value={editing.permissions} onChange={permissions => setEditing({ ...editing, permissions })} role={editing.role} me={me}/>
          <div className="adm-row-actions"><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" className="ob-btn ob-btn-primary" disabled={!!busy} onClick={() => void act(`ed-${m.id}`, () => api(`/admin/staff/${m.id}`, { method: 'PATCH', body: JSON.stringify({ role: editing.role, permissions: editing.permissions }) }), 'Permissões salvas.').then(ok => { if (ok) setEditing(null); })}>Salvar permissões</button></div>
        </div>}
      </article>; })}</div>}
    </Card>
  </div>;
}

/** Primeiro acesso de quem recebeu senha temporária: cria a própria senha. */
function FirstPassword({ me, onDone, onLogout }: { me: StaffMe; onDone: () => void; onLogout: () => void }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.next !== form.confirm) { toast.error('A confirmação não confere.'); return; }
    setBusy(true);
    try { await api('/admin/first-password', { method: 'POST', body: JSON.stringify({ current: form.current, next: form.next }) }); toast.success('Senha criada. Bem-vindo(a)!'); onDone(); }
    catch (err) { toast.error(errText(err)); } finally { setBusy(false); }
  };
  return <main className="adm-page"><div className="adm-center"><form className="adm-card adm-first-password" onSubmit={save}>
    <h2>Crie a sua senha</h2>
    <p className="adm-muted">Olá, {me.name}. Você entrou com uma senha temporária como <strong>{STAFF_ROLE_LABELS[me.role]}</strong>. Crie agora a sua própria senha (10+ caracteres, com maiúscula, minúscula, número e símbolo).</p>
    <label className="adm-content-field"><span className="adm-content-label">Senha temporária (do e-mail)</span><input type="password" autoComplete="current-password" value={form.current} onChange={e => setForm({ ...form, current: e.target.value })}/></label>
    <label className="adm-content-field"><span className="adm-content-label">Nova senha</span><input type="password" autoComplete="new-password" value={form.next} onChange={e => setForm({ ...form, next: e.target.value })}/></label>
    <label className="adm-content-field"><span className="adm-content-label">Repita a nova senha</span><input type="password" autoComplete="new-password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })}/></label>
    <button className="ob-btn ob-btn-primary" type="submit" disabled={busy}>{busy ? <Loader2 className="ob-spin" size={16}/> : <KeyRound size={16}/>} Salvar e entrar</button>
    <button type="button" className="ob-link-danger" onClick={onLogout}>Sair</button>
  </form></div></main>;
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
