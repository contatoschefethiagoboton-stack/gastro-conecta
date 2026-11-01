'use client';
/** Link enviado por e-mail ao comprador do PPV. */
import VisualizadorPPV from '@/components/VisualizadorPPV';

export default function ConteudoPage({ params }: { params: { token: string } }) {
  return (
    <section className="card" style={{ margin: '24px 0', display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Seu conteúdo exclusivo</h1>
      <VisualizadorPPV token={decodeURIComponent(params.token)} />
    </section>
  );
}
