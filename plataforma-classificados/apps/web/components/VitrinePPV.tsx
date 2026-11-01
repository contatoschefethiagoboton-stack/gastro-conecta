'use client';
/** Vitrine de conteúdo exclusivo: compra rápida sem cadastro (e-mail + PIX). */
import { useEffect, useRef, useState } from 'react';
import VisualizadorPPV from './VisualizadorPPV';
import { api, brl } from '@/lib/api';

interface Item {
  id: string; title: string; description: string | null; kind: 'photo' | 'video'; price_cents: number;
  teaser_url: string | null; view_mode: 'single_view' | 'time_limited'; max_views: number; view_window_seconds: number; access_valid_days: number;
}
interface Checkout { purchaseId: string; statusToken: string; pix?: { copyPaste: string; qrCodeBase64?: string; expiresAt: string } }

function Comprar({ item }: { item: Item }) {
  const [email, setEmail] = useState('');
  const [adult, setAdult] = useState(false);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();

  // Consulta o status a cada 3 s até o PIX compensar
  useEffect(() => {
    if (!checkout || accessToken) return;
    timer.current = setInterval(async () => {
      const s = await api<{ status: string; accessToken?: string }>(`/ppv/purchases/${checkout.purchaseId}/status`, {
        headers: { 'x-status-token': checkout.statusToken },
      }).catch(() => null);
      if (s?.accessToken) setAccessToken(s.accessToken);
    }, 3000);
    return () => clearInterval(timer.current);
  }, [checkout, accessToken]);

  if (accessToken) return <VisualizadorPPV token={accessToken} />;

  if (checkout?.pix) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <strong>Pague com PIX para liberar</strong>
        {checkout.pix.qrCodeBase64 && <img src={`data:image/png;base64,${checkout.pix.qrCodeBase64}`} alt="QR Code PIX" width={200} height={200} />}
        <div className="pix">{checkout.pix.copyPaste}</div>
        <button className="btn" onClick={() => navigator.clipboard?.writeText(checkout.pix!.copyPaste)}>Copiar código PIX</button>
        <span className="muted">Aguardando pagamento… o link de acesso também será enviado para {email}.</span>
      </div>
    );
  }

  return (
    <form style={{ display: 'grid', gap: 8 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          setCheckout(await api<Checkout>('/ppv/checkout', { method: 'POST', body: JSON.stringify({ itemId: item.id, email, confirmAdult: true }) }));
        } catch (err) {
          setError((err as Error).message);
        }
      }}>
      <label>Seu e-mail (para receber o acesso)<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={adult} onChange={(e) => setAdult(e.target.checked)} required />
        Declaro ter 18 anos ou mais
      </label>
      {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      <button className="btn primary" type="submit" disabled={!adult}>Comprar por {brl(item.price_cents)}</button>
    </form>
  );
}

export default function VitrinePPV({ adId }: { adId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    api<Item[]>(`/ads/${adId}/ppv`).then(setItems).catch(() => setItems([]));
  }, [adId]);

  if (!items.length) return null;
  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Conteúdo exclusivo</h2>
      <div className="grid">
        {items.map((it) => (
          <div key={it.id} className="card" style={{ display: 'grid', gap: 8 }}>
            {it.teaser_url ? <img src={it.teaser_url} alt="" style={{ borderRadius: 8 }} /> : <div style={{ aspectRatio: '1', background: 'var(--surface-2)', borderRadius: 8, display: 'grid', placeItems: 'center' }}>🔒 {it.kind === 'video' ? 'Vídeo' : 'Foto'}</div>}
            <strong>{it.title}</strong>
            <span className="muted">
              {it.view_mode === 'single_view' ? 'Visualização única' : `${it.max_views} visualização(ões)`} · {it.view_window_seconds}s por abertura · abrir em até {it.access_valid_days} dias
            </span>
            {buying === it.id ? <Comprar item={it} /> : <button className="btn primary" onClick={() => setBuying(it.id)}>Desbloquear · {brl(it.price_cents)}</button>}
          </div>
        ))}
      </div>
    </section>
  );
}
