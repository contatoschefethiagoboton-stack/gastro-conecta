import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import Link from 'next/link';
import AgeGate from '@/components/AgeGate';
import './globals.css';

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Classi+18 · Acompanhantes e massagistas verificados', template: '%s · Classi+18' },
  description: 'Perfis com identidade e idade verificadas por documento e vídeo. Conteúdo exclusivo para maiores de 18 anos.',
  other: { rating: 'RTA-5042-1996-1400-1577-RTA' },
};

export const viewport: Viewport = { themeColor: '#08070b', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={sans.variable}>
      <body>
        <AgeGate />
        <header className="site-header">
          <div className="container">
            <Link href="/" className="logo" aria-label="Classi+18 — início">
              <span className="logo-mark">18+</span>
              <span>Classi<span className="gradient-text">+18</span></span>
            </Link>
            <nav className="nav" aria-label="Principal">
              <Link href="/?categoria=acompanhante">Acompanhantes</Link>
              <Link href="/?categoria=massagem">Massagens</Link>
              <Link href="/?ppv=1">Conteúdo exclusivo</Link>
            </nav>
            <div className="header-actions">
              <Link href="/painel/verificacao" className="btn ghost sm">Entrar</Link>
              <Link href="/painel/verificacao" className="btn primary sm">Anunciar</Link>
            </div>
          </div>
        </header>

        <main className="container">{children}</main>

        <footer className="site-footer">
          <div className="container cols">
            <div style={{ maxWidth: 420, display: 'grid', gap: 8 }}>
              <span className="logo"><span className="logo-mark">18+</span>Classi+18</span>
              <span>Todos os anunciantes passam por verificação de identidade e idade com documento oficial e vídeo.
                Site destinado exclusivamente a maiores de 18 anos.</span>
            </div>
            <nav aria-label="Rodapé">
              <Link href="/termos">Termos de uso</Link>
              <Link href="/privacidade">Privacidade (LGPD)</Link>
              <Link href="/seguranca">Segurança e denúncias</Link>
              <Link href="/painel/verificacao">Anuncie aqui</Link>
            </nav>
          </div>
          <div className="container subtle" style={{ marginTop: 24 }}>
            Exploração sexual infantil é crime — denuncie: Disque 100 · Risco imediato: 190
          </div>
        </footer>
      </body>
    </html>
  );
}
