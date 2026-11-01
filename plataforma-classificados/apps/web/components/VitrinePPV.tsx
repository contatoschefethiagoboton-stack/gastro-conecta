'use client';
/** Vitrine de conteúdo exclusivo: compra rápida sem cadastro (e-mail + PIX). */
import { useEffect, useRef, useState } from 'react';
import { IconEye, IconLock } from './Icons';
import VisualizadorPPV from './VisualizadorPPV';
import { api, brl } from '@/lib/api';

interface Item {
  id: string; title: string; description: string | null; kind: 'photo' | 'video'; price_cents: number;
  teaser_url: string | null; view_mode: 'single_view' | 'time_limited'; max_views: number; view_window_seconds: number; access_valid_days: number;
}
interface Checkout { purchaseId: string; statusToken: string; pix?: { copyPaste: string; qrCodeBase64?: string; expiresAt: string } }

function Comprar({ item, onCancel }: { item: Item; onCancel: () => void }) {
  const [email, setEmail] = useState('');
  const [adult, setAdult] = useState(false);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
      <div style={{ display: 'grid', gap: 10 }}>
        <strong>Pague com PIX para liberar</strong>
        {checkout.pix.qrCodeBase64 && <img src={`data:image/png;base64,${checkout.pix.qrCodeBase64}`} alt="QR Code PIX" width={200} height={200} style={{ borderRadius: 12, background: '#fff', padding: 8 }} />}
        <div className="pix">{checkout.pix.copyPaste}</div>
        <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(checkout.pix!.copyPaste); setCopied(true); }}>
          {copied ? 'Copiado ✓' : 'Copiar código PIX'}
        </button>
        <span className="subtle" style={{ fontSize: 12 }}>Aguardando pagamento… o link também será enviado para {email}.</span>
      </div>
    );
  }

  return (
    <form style={{ display: 'grid', gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          setCheckout(await api<Checkout>('/ppv/checkout', { method: 'POST', body: JSON.stringify({ itemId: item.id, email, confirmAdult: true }) }));
        } catch (err) {
          setError((err as Error).message);
        }
      }}>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail para receber o acesso" aria-label="E-mail" />
      <label className="switch-row" style={{ fontSize: 13, justifyContent: 'flex-start' }}>
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} required />
        Declaro ter 18 anos ou mais
      </label>
      {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn ghost sm" type="button" onClick={onCancel}>Voltar</button>
        <button className="btn primary sm block" type="submit" disabled={!adult}>Pagar {brl(item.price_cents)} com PIX</button>
      </div>
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
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h2 className="section-title">Conteúdo <span className="gradient-text">exclusivo</span></h2>
        <span className="subtle" style={{ fontSize: 13 }}>Sem cadastro · pagamento por PIX</span>
      </div>
      <div className="ppv-grid">
        {items.map((it) => (
          <div key={it.id} className="ppv-card">
            <div className="ppv-cover">
              {it.teaser_url && <img src={it.teaser_url} alt="" />}
              <span className="lock"><IconLock /></span>
              <span className="badge glass" style={{ position: 'absolute', top: 10, left: 10 }}>{it.kind === 'video' ? 'Vídeo' : 'Foto'}</span>
            </div>
            <div className="ppv-body">
              <strong>{it.title}</strong>
              <span className="subtle" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                <IconEye width={14} height={14} />
                {it.view_mode === 'single_view' ? 'Visualização única' : (it.max_views === 1 ? '1 visualização' : `${it.max_views} visualizações`)} · {it.view_window_seconds}s
              </span>
              {buying === it.id ? (
                <Comprar item={it} onCancel={() => setBuying(null)} />
              ) : (
                <button className="btn primary sm block" onClick={() => setBuying(it.id)}>Desbloquear · {brl(it.price_cents)}</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
