import { lazy, Suspense, useEffect } from 'react';
import { Route, Switch, useLocation, Link } from 'wouter';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import { Header, Footer } from './components/SiteLayout';
import Home from './pages/Home';
import Professionals from './pages/Professionals';
import ProfessionalDetail from './pages/ProfessionalDetail';
import Quote from './pages/Quote';
import Account from './pages/Account';
import { useSite } from './lib/site';
import { trackVisit } from './lib/attribution';
import { useQuery } from '@tanstack/react-query';
import { api, type CurrentUser } from '@/lib/api';
import { copilotAllowed } from '@shared/content';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Copilot = lazy(() => import('./components/Copilot'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminConsole = lazy(() => import('./pages/AdminConsole'));
import SupportButton from './components/SupportButton';
import { About, HowItWorks, ForProfessionals, LegalPage } from './pages/InfoPages';
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const SeoLanding = lazy(() => import('./pages/SeoLanding'));
import { isSeoPath } from '@shared/seo';

const titles: Record<string,string> = {'/':'Eventos Conecta | Chef, garçom, barman e buffet para eventos','/profissionais':'Encontre profissionais | Eventos Conecta','/orcamento':'Planeje seu evento | Eventos Conecta','/conta':'Sua conta | Eventos Conecta','/painel':'Meu painel | Eventos Conecta','/sobre':'Criado por quem vive a gastronomia | Eventos Conecta','/como-funciona':'Como funciona | Eventos Conecta','/para-profissionais':'Oportunidades na gastronomia | Eventos Conecta','/redefinir-senha':'Redefinir senha | Eventos Conecta','/seguranca':'Segurança e privacidade | Eventos Conecta','/termos':'Termos da plataforma | Eventos Conecta','/admin':'Administração | Eventos Conecta','/admin/painel':'Administração | Eventos Conecta'};
function NavigationEffects(){const [location]=useLocation();useEffect(()=>{window.scrollTo(0,0);if(!isSeoPath(location))document.title=titles[location]||'Profissional | Eventos Conecta';},[location]);return null;}
function NotFound(){return <main className="wrap info-page empty-state"><span className="eyebrow">404</span><h1>Essa conexão<br/>não foi encontrada.</h1><p>Que tal começar pela página inicial?</p><Link href="/" className="btn btn-primary">Voltar ao início</Link></main>;}
function PageLoading(){return <main className="wrap info-page empty-state"><p>Carregando…</p></main>;}
function Shell(){const [location]=useLocation();const site=useSite();const me=useQuery({queryKey:['gastro-me-header'],queryFn:()=>api<{user:CurrentUser|null}>('/me'),retry:false,staleTime:15000});const isAdmin=location.startsWith('/admin');return <><NavigationEffects/>{!isAdmin&&<Header/>}<Suspense fallback={<PageLoading/>}><Switch><Route path="/" component={Home}/><Route path="/profissionais" component={Professionals}/><Route path="/profissionais/:id" component={ProfessionalDetail}/><Route path="/orcamento" component={Quote}/><Route path="/conta" component={Account}/><Route path="/painel" component={Dashboard}/><Route path="/admin" component={AdminLogin}/><Route path="/admin/painel" component={AdminConsole}/><Route path="/sobre" component={About}/><Route path="/como-funciona" component={HowItWorks}/><Route path="/para-profissionais" component={ForProfessionals}/><Route path="/redefinir-senha" component={ResetPassword}/><Route path="/seguranca"><LegalPage privacy/></Route><Route path="/termos"><LegalPage/></Route><Route path="/servicos" component={SeoLanding}/><Route path="/servicos/*" component={SeoLanding}/><Route path="/trabalhe-como" component={SeoLanding}/><Route path="/trabalhe-como/*" component={SeoLanding}/><Route path="/:uf/:cidade" component={SeoLanding}/><Route path="/:uf/:cidade/:servico" component={SeoLanding}/><Route component={NotFound}/></Switch></Suspense>{!isAdmin&&<Footer/>}{!isAdmin&&<SupportButton/>}{site.aiEnabled&&!isAdmin&&copilotAllowed(site.c('copilot.visibility'),me.data?.user??null)&&<Suspense fallback={null}><Copilot/></Suspense>}</>;}
export default function App(){useEffect(()=>{trackVisit();},[]);return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster position="top-right"/><Shell/></TooltipProvider></ThemeProvider></ErrorBoundary>;}
