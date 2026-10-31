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
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Copilot = lazy(() => import('./components/Copilot'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminConsole = lazy(() => import('./pages/AdminConsole'));
import SupportButton from './components/SupportButton';
import { About, HowItWorks, ForProfessionals, LegalPage } from './pages/InfoPages';
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

const titles: Record<string,string> = {'/':'GastroConecta | Chefs e profissionais para o seu evento','/profissionais':'Encontre profissionais | GastroConecta','/orcamento':'Planeje seu evento | GastroConecta','/conta':'Sua conta | GastroConecta','/painel':'Meu painel | GastroConecta','/sobre':'Criado por quem vive a gastronomia | GastroConecta','/como-funciona':'Como funciona | GastroConecta','/para-profissionais':'Oportunidades na gastronomia | GastroConecta','/redefinir-senha':'Redefinir senha | GastroConecta','/seguranca':'Segurança e privacidade | GastroConecta','/termos':'Termos da plataforma | GastroConecta','/admin':'Administração | GastroConecta','/admin/painel':'Administração | GastroConecta'};
function NavigationEffects(){const [location]=useLocation();useEffect(()=>{window.scrollTo(0,0);document.title=titles[location]||'Profissional | GastroConecta';},[location]);return null;}
function NotFound(){return <main className="wrap info-page empty-state"><span className="eyebrow">404</span><h1>Essa conexão<br/>não foi encontrada.</h1><p>Que tal começar pela página inicial?</p><Link href="/" className="btn btn-primary">Voltar ao início</Link></main>;}
function PageLoading(){return <main className="wrap info-page empty-state"><p>Carregando…</p></main>;}
function Shell(){const [location]=useLocation();const site=useSite();const isAdmin=location.startsWith('/admin');return <><NavigationEffects/>{!isAdmin&&<Header/>}<Suspense fallback={<PageLoading/>}><Switch><Route path="/" component={Home}/><Route path="/profissionais" component={Professionals}/><Route path="/profissionais/:id" component={ProfessionalDetail}/><Route path="/orcamento" component={Quote}/><Route path="/conta" component={Account}/><Route path="/painel" component={Dashboard}/><Route path="/admin" component={AdminLogin}/><Route path="/admin/painel" component={AdminConsole}/><Route path="/sobre" component={About}/><Route path="/como-funciona" component={HowItWorks}/><Route path="/para-profissionais" component={ForProfessionals}/><Route path="/redefinir-senha" component={ResetPassword}/><Route path="/seguranca"><LegalPage privacy/></Route><Route path="/termos"><LegalPage/></Route><Route component={NotFound}/></Switch></Suspense>{!isAdmin&&<Footer/>}{!isAdmin&&<SupportButton/>}{site.aiEnabled&&!isAdmin&&<Suspense fallback={null}><Copilot/></Suspense>}</>;}
export default function App(){useEffect(()=>{trackVisit();},[]);return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster position="top-right"/><Shell/></TooltipProvider></ThemeProvider></ErrorBoundary>;}
