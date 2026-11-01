import type { Metadata } from 'next';
import Link from 'next/link';
import AgeGate from '@/components/AgeGate';
import './globals.css';

export const metadata: Metadata = {
  title: 'Classificados Adultos',
  description: 'Acompanhantes e massagistas verificados. Conteúdo exclusivo para maiores de 18 anos.',
  other: { rating: 'RTA-5042-1996-1400-1577-RTA' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AgeGate />
        <header className="top">
          <div className="container">
            <Link href="/" className="brand">
              Classi<span>+18</span>
            </Link>
            <nav style={{ display: 'flex', gap: 8 }}>
              <Link href="/painel/verificacao" className="btn">Anunciar</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
