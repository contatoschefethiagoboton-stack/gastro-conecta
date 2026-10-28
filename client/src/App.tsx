import { useEffect } from 'react';
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
import Dashboard from './pages/Dashboard';
import Copilot from './components/Copilot';
import WhatsAppButton from './components/WhatsAppButton';
import { About, HowItWorks, ForProfessionals, LegalPage, Jobs } from './pages/InfoPages';

const titles: Record<string,string> = {'/':'GastroConecta | Chefs, buffets e boas conexões','/profissionais':'Encontre chefs e buffets | GastroConecta','/orcamento':'Planeje seu evento | GastroConecta','/conta':'Sua conta | GastroConecta','/painel':'Meu painel | GastroConecta','/sobre':'Criado por quem vive a gastronomia | GastroConecta','/como-funciona':'Como funciona | GastroConecta','/para-profissionais':'Oportunidades na gastronomia | GastroConecta','/vagas':'Diárias e vagas freelance | GastroConecta','/seguranca':'Segurança e privacidade | GastroConecta','/termos':'Termos da plataforma | GastroConecta'};
function NavigationEffects(){const [location]=useLocation();useEffect(()=>{window.scrollTo(0,0);document.title=titles[location]||'Profissional | GastroConecta';},[location]);return null;}
function NotFound(){return <main className="wrap info-page empty-state"><span className="eyebrow">404</span><h1>Essa conexão<br/>não foi encontrada.</h1><p>Que tal começar pela página inicial?</p><Link href="/" className="btn btn-primary">Voltar ao início</Link></main>;}
export default function App(){return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster position="top-right"/><NavigationEffects/><Header/><Switch><Route path="/" component={Home}/><Route path="/profissionais" component={Professionals}/><Route path="/profissionais/:id" component={ProfessionalDetail}/><Route path="/orcamento" component={Quote}/><Route path="/conta" component={Account}/><Route path="/painel" component={Dashboard}/><Route path="/sobre" component={About}/><Route path="/como-funciona" component={HowItWorks}/><Route path="/para-profissionais" component={ForProfessionals}/><Route path="/vagas" component={Jobs}/><Route path="/seguranca"><LegalPage privacy/></Route><Route path="/termos"><LegalPage/></Route><Route component={NotFound}/></Switch><Footer/><WhatsAppButton/><Copilot/></TooltipProvider></ThemeProvider></ErrorBoundary>;}
