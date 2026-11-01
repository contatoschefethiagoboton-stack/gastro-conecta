'use client';
/**
 * Visualizador de conteúdo PPV com autodestruição local:
 *  - foto: baixada uma única vez para um Blob em memória (nunca vai para cache/disco — servidor envia no-store);
 *  - ao fim do tempo, o Blob é revogado e a referência descartada (o conteúdo some do dispositivo);
 *  - sem menu de contexto, sem arrastar, sem botão de download, sem picture-in-picture;
 *  - conteúdo desfocado quando a aba perde o foco (dificulta gravação/print em segundo plano);
 *  - marca d'água com o código da compra sobreposta (e já embutida no servidor).
 * Limite honesto: nenhuma página web impede uma foto da tela com outro aparelho.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, api } from '@/lib/api';

interface Session { sessionId: string; kind: 'photo' | 'video'; expiresInSeconds: number; remainingViews: number; watermarkCode: string }

export default function VisualizadorPPV({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'viewing' | 'ended' | 'error'>('idle');
  const [src, setSrc] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [left, setLeft] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState('');
  const blobUrl = useRef<string | null>(null);

  const destroy = useCallback(() => {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = null;
    setSrc(null);
    setState('ended');
  }, []);

  useEffect(() => {
    const onHide = () => setHidden(document.visibilityState !== 'visible' || !document.hasFocus());
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', onHide);
    window.addEventListener('focus', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onHide);
      window.removeEventListener('focus', onHide);
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, []);

  useEffect(() => {
    if (state !== 'viewing') return;
    if (left <= 0) return destroy();
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [state, left, destroy]);

  const open = async () => {
    setState('loading');
    try {
      const s = await api<Session>(`/ppv/access/${encodeURIComponent(token)}/open`, { method: 'POST', body: '{}' });
      setSession(s);
      const streamUrl = `${API_URL}/ppv/stream/${s.sessionId}`;
      if (s.kind === 'photo') {
        const res = await fetch(streamUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error('Conteúdo indisponível.');
        blobUrl.current = URL.createObjectURL(await res.blob());
        setSrc(blobUrl.current);
      } else {
        setSrc(streamUrl); // vídeo em streaming; a sessão expira no servidor junto com o cronômetro
      }
      setLeft(s.expiresInSeconds);
      setState('viewing');
    } catch (e) {
      setMessage((e as Error).message);
      setState('error');
    }
  };

  if (state === 'idle') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <span className="muted">Pagamento confirmado. Ao abrir, o cronômetro começa e o conteúdo se autodestrói ao final.</span>
        <button className="btn primary" onClick={open}>Abrir agora</button>
      </div>
    );
  }
  if (state === 'loading') return <span className="muted">Carregando…</span>;
  if (state === 'error') return <span style={{ color: 'var(--danger)' }}>{message}</span>;
  if (state === 'ended') {
    return <span className="muted">Conteúdo encerrado e removido deste dispositivo.{session && session.remainingViews > 0 ? ` Restam ${session.remainingViews} visualização(ões) pelo link do e-mail.` : ''}</span>;
  }

  return (
    <div className={`ppv-viewer${hidden ? ' hidden-content' : ''}`} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      {session?.kind === 'photo' && src && <img src={src} alt="" draggable={false} />}
      {session?.kind === 'video' && src && (
        <video src={src} autoPlay playsInline controls={false} disablePictureInPicture controlsList="nodownload noplaybackrate noremoteplayback" onEnded={destroy} />
      )}
      <div className="ppv-overlay">{session?.watermarkCode}</div>
      <div className="ppv-timer">{left}s</div>
    </div>
  );
}
