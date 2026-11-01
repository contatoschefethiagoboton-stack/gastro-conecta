import Link from 'next/link';

/** Modelo das páginas institucionais. O texto final deve ser redigido com assessoria jurídica. */
export default function PaginaInstitucional({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article style={{ maxWidth: 760, padding: '48px 0', display: 'grid', gap: 16 }}>
      <Link href="/" className="muted" style={{ fontSize: 13 }}>← Voltar</Link>
      <h1 style={{ margin: 0, fontSize: 36, letterSpacing: '-0.03em' }}>{title}</h1>
      <div className="muted" style={{ fontSize: 16, lineHeight: 1.7, display: 'grid', gap: 12 }}>{children}</div>
    </article>
  );
}
