import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Building2, Calculator, CalendarDays, ChevronRight, Clock3, CreditCard, FileText, Home, KeyRound, LayoutDashboard, Loader2, LogOut, Menu, Send, ShieldCheck, Star, TrendingUp, UserCircle2, Wallet, X } from "lucide-react";
import { api } from "@/lib/api";
import "../dashboard.css";
import Onboarding from "@/components/Onboarding";
import MyBenefits from "@/components/MyBenefits";
import { ContractsPanel, GrowthPrompt, initials, ReviewLockBanner, ReviewsPanel, SecurityPanel, type DashboardUser } from "./dashboard/common";
import { ClientHome, ClientRequests } from "./dashboard/ClientPanels";
import { FinancePanel, ProviderJobs, ProviderOverview, ProviderProposals, RadarPanel, SubscriptionBanner, SubscriptionPanel } from "./dashboard/ProviderPanels";
import { CalculatorsPanel } from "./dashboard/CopilotTools";
import { GrowthPanel } from "./dashboard/GrowthPanel";

type Tab = { id: string; label: string; icon: typeof LayoutDashboard };

const CLIENT_TABS: Tab[] = [
  { id: "home", label: "Início", icon: Home },
  { id: "requests", label: "Pedidos e propostas", icon: Send },
  { id: "reviews", label: "Avaliações", icon: Star },
  { id: "contracts", label: "Contratos", icon: FileText },
  { id: "data", label: "Meus dados", icon: UserCircle2 },
  { id: "security", label: "Senha", icon: KeyRound },
];
const PROVIDER_TABS: Tab[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "radar", label: "Radar de pedidos", icon: Activity },
  { id: "proposals", label: "Minhas propostas", icon: Send },
  { id: "jobs", label: "Serviços fechados", icon: CalendarDays },
  { id: "calculators", label: "Copilot / calculadoras", icon: Calculator },
  { id: "finance", label: "Financeiro", icon: Wallet },
  { id: "contracts", label: "Contratos", icon: FileText },
  { id: "reviews", label: "Avaliações", icon: Star },
  { id: "growth", label: "Nível e promoções", icon: TrendingUp },
  { id: "subscription", label: "Assinatura", icon: CreditCard },
  { id: "profile", label: "Meu perfil", icon: UserCircle2 },
  { id: "security", label: "Senha", icon: KeyRound },
];

export default function Dashboard() {
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["gastro-me-dashboard"], queryFn: () => api<{ user: DashboardUser | null }>("/me"), retry: false, refetchInterval: 60_000 });
  const user = me.data?.user ?? null;
  const tabs = user?.accountType === "provider" ? PROVIDER_TABS : CLIENT_TABS;
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("aba") ?? "");
  const [navOpen, setNavOpen] = useState(false);
  const active = tabs.find(t => t.id === tab) ?? tabs[0];
  const go = (id: string) => { setTab(id); setNavOpen(false); window.scrollTo(0, 0); };

  useEffect(() => { if (user?.role === "admin") window.location.replace("/admin/painel"); }, [user?.role]);
  const signOut = () => { void api("/logout", { method: "POST" }).finally(() => { client.clear(); window.location.assign("/"); }); };
  const renderTab = (user: DashboardUser) => {
    switch (active.id) {
      case "home": return <><GrowthPrompt user={user}/><ClientHome user={user} onTab={go}/><MyBenefits/></>;
      case "requests": return <ClientRequests user={user} onTab={go}/>;
      case "data": return <Onboarding mode="edit" onDone={() => void me.refetch()}/>;
      case "overview": return <><GrowthPrompt user={user}/><ProviderOverview user={user} onTab={go}/><MyBenefits/></>;
      case "radar": return <RadarPanel user={user}/>;
      case "proposals": return <ProviderProposals/>;
      case "jobs": return <ProviderJobs/>;
      case "calculators": return <CalculatorsPanel/>;
      case "finance": return <FinancePanel/>;
      case "growth": return <GrowthPanel/>;
      case "subscription": return <SubscriptionPanel/>;
      case "profile": return <Onboarding mode="edit" onDone={() => void me.refetch()}/>;
      case "reviews": return <ReviewsPanel/>;
      case "contracts": return <ContractsPanel/>;
      case "security": return <SecurityPanel user={user}/>;
      default: return null;
    }
  };

  if (me.isLoading) return <main className="dash-page"><div className="dash-auth-loading"><Loader2 className="dash-spinner" size={24}/> Verificando sua sessão…</div></main>;
  if (!user) return <main className="dash-page dash-logged-out"><section className="dash-login-card"><span className="dash-kicker">GastroConecta / painel</span><div className="dash-empty-mark"><LayoutDashboard size={22}/></div><h1>Seu painel começa com uma conexão.</h1><p>Entre na sua conta para acessar pedidos, propostas e contratos.</p><Link className="dash-primary-button" href="/conta">Entrar <ChevronRight size={17}/></Link></section></main>;
  if (user.accountType === "provider" && !user.profileComplete) return <main className="dash-page ob-page"><div className="ob-page-top"><button type="button" className="ob-link" onClick={signOut}><LogOut size={15}/> Sair</button></div><Onboarding mode="required" onDone={() => void me.refetch()}/></main>;

  const isProvider = user.accountType === "provider";
  return <main className="dash-page">
    <div className={`dash-layout ${navOpen ? "nav-open" : ""}`}>
      <button className="dash-mobile-backdrop" aria-label="Fechar menu" type="button" onClick={() => setNavOpen(false)}/>
      <aside className="dash-sidebar">
        <div className="dash-sidebar-brand"><span className="dash-brand-mark">G</span><div><strong>Gastro</strong><span>Conecta</span></div><button className="dash-close-mobile" type="button" onClick={() => setNavOpen(false)} aria-label="Fechar navegação"><X size={18}/></button></div>
        <div className="dash-profile-mini"><span className="dash-avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><span>{isProvider ? "Profissional" : "Cliente · VIP grátis"}</span></div></div>
        <nav className="dash-nav" aria-label="Navegação do painel"><span className="dash-nav-label">Seu espaço</span>{tabs.map(item => { const Icon = item.icon; return <button type="button" key={item.id} className={`dash-nav-item ${active.id === item.id ? "is-active" : ""}`} onClick={() => go(item.id)}><Icon size={17}/><span>{item.label}</span>{item.id === "reviews" && Boolean(user.pendingReviews) && <span className="dash-nav-badge">{user.pendingReviews}</span>}{active.id === item.id && <ChevronRight className="dash-nav-arrow" size={15}/>}</button>; })}</nav>
        <div className="dash-sidebar-bottom"><div className="dash-safety-note"><ShieldCheck size={16}/><span>{isProvider ? "Sem comissão: 100% do valor negociado é seu." : "Conta de cliente 100% gratuita."}</span></div><button className="dash-signout" type="button" onClick={signOut}><LogOut size={16}/> Sair da conta</button></div>
      </aside>
      <section className="dash-main">
        <header className="dash-topbar"><button className="dash-menu-button" type="button" onClick={() => setNavOpen(true)} aria-label="Abrir navegação"><Menu size={20}/></button><div><span className="dash-breadcrumb">Painel /</span><strong>{active.label}</strong></div><div className="dash-topbar-actions"><span className="dash-avatar dash-avatar-small">{initials(user.name)}</span></div></header>
        <div className="dash-content">
          <div className="dash-heading-row"><div><span className="dash-kicker">{isProvider ? "Profissional" : "Cliente"}</span><h1>{active.label}</h1></div><span className="dash-city"><Building2 size={15}/> {user.city || "Cidade não informada"}</span></div>
          {isProvider && user.status === "pending" && <div className="dash-alert dash-alert-warning" role="status"><Clock3 size={17}/> Cadastro recebido e em análise pela administração. Depois da aprovação, ative a assinatura para aparecer no catálogo e enviar propostas.</div>}
          {isProvider && user.status === "active" && active.id !== "subscription" && <SubscriptionBanner user={user} onGo={() => go("subscription")}/>}
          {active.id !== "reviews" && <ReviewLockBanner user={user} onGo={() => go("reviews")}/>}
          {renderTab(user)}
        </div>
      </section>
    </div>
  </main>;
}
