import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Plus_Jakarta_Sans } from 'next/font/google';
import Link from 'next/link';
import AgeGate from '@/components/AgeGate';
import Logo from '@/components/Logo';
import './globals.css';

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sans', display: 'swap' });
const serif = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'], style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Belíssima VIP · Acompanhantes e massagistas verificadas', template: '%s · Belíssima VIP' },
  applicationName: 'Belíssima VIP',
  description: 'Perfis com identidade e idade verificadas por documento e vídeo. Conteúdo exclusivo para maiores de 18 anos.',
  other: { rating: 'RTA-5042-1996-1400-1577-RTA' },
};

export const viewport: Viewport = { themeColor: '#08070b', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <AgeGate />
        <header className="site-header">
          <div className="container">
            <Link href="/" className="logo" aria-label="Belíssima VIP — início">
              <Logo />
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
              <span className="logo"><Logo /></span>
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
