'use client';
/**
 * Verificação de identidade do anunciante (+18):
 * documento (frente/verso) + selfie + vídeo com código-desafio.
 * Os arquivos vão direto ao bucket privado; nada passa pelo servidor web.
 */
import { useEffect, useState } from 'react';
import LoginForm from '@/components/LoginForm';
import { api, session, uploadPresigned } from '@/lib/api';

type Upload = { key: string; url: string; fields: Record<string, string> };
interface Start { verificationId: string; challengeCode: string; instructions: string[]; uploads: Record<'document_front' | 'document_back' | 'selfie' | 'video', Upload> }

const STATUS: Record<string, string> = {
  not_started: 'Não iniciada',
  awaiting_upload: 'Aguardando envio dos arquivos',
  processing: 'Em análise automática',
  pending_review: 'Em revisão pela equipe',
  approved: 'Aprovada ✔',
  rejected: 'Reprovada',
};

export default function VerificacaoPage() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<{ status: string; rejection_reason?: string } | null>(null);
  const [start, setStart] = useState<Start | null>(null);
  const [docType, setDocType] = useState<'rg' | 'cnh' | 'passport'>('rg');
  const [files, setFiles] = useState<Partial<Record<keyof Start['uploads'], File>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setToken(session.get()), []);
  useEffect(() => {
    if (token) api<{ status: string }>('/me/verification', { token }).then(setStatus).catch(() => setToken(null));
  }, [token]);

  if (!token) return <LoginForm title="Área do anunciante" onLogin={(t) => setToken(t)} />;

  const begin = async () => {
    setError(null);
    try {
      setStart(await api<Start>('/me/verification/start', { method: 'POST', body: '{}', token }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = async () => {
    if (!start || !files.document_front || !files.selfie || !files.video) return setError('Envie documento (frente), selfie e vídeo.');
    setBusy(true);
    setError(null);
    try {
      const parts = (['document_front', 'document_back', 'selfie', 'video'] as const).filter((p) => files[p]);
      for (const p of parts) await uploadPresigned(start.uploads[p], files[p]!);
      await api('/me/verification/submit', {
        method: 'POST',
        token,
        body: JSON.stringify({
          verificationId: start.verificationId,
          documentType: docType,
          documentFrontKey: start.uploads.document_front.key,
          documentBackKey: files.document_back ? start.uploads.document_back.key : undefined,
          selfieKey: start.uploads.selfie.key,
          videoKey: start.uploads.video.key,
        }),
      });
      setStart(null);
      setStatus({ status: 'processing' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fileInput = (part: keyof Start['uploads'], label: string, accept: string, capture?: 'user' | 'environment') => (
    <label>
      {label}
      <input type="file" accept={accept} capture={capture} onChange={(e) => setFiles((f) => ({ ...f, [part]: e.target.files?.[0] }))} />
    </label>
  );

  return (
    <section style={{ display: 'grid', gap: 16, padding: '16px 0', maxWidth: 640 }}>
      <h1 style={{ margin: 0 }}>Verificação de identidade</h1>
      <div className="card">
        Situação: <strong>{STATUS[status?.status ?? 'not_started'] ?? status?.status}</strong>
        {status?.rejection_reason && <div className="muted">Motivo: {status.rejection_reason}</div>}
      </div>

      {!start && ['not_started', 'awaiting_upload', 'rejected'].includes(status?.status ?? 'not_started') && (
        <button className="btn primary" onClick={begin} style={{ justifySelf: 'start' }}>Iniciar verificação</button>
      )}

      {start && (
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <div>
            <div className="muted">Seu código-desafio (mostre num papel e fale no vídeo):</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '.05em' }}>{start.challengeCode}</div>
          </div>
          <ol className="muted" style={{ margin: 0, paddingLeft: 18 }}>{start.instructions.map((i) => <li key={i}>{i}</li>)}</ol>
          <label>Tipo de documento
            <select value={docType} onChange={(e) => setDocType(e.target.value as typeof docType)}>
              <option value="rg">RG</option><option value="cnh">CNH</option><option value="passport">Passaporte</option>
            </select>
          </label>
          {fileInput('document_front', 'Documento — frente', 'image/*', 'environment')}
          {docType !== 'passport' && fileInput('document_back', 'Documento — verso', 'image/*', 'environment')}
          {fileInput('selfie', 'Selfie', 'image/*', 'user')}
          {fileInput('video', 'Vídeo de verificação (5–15 s)', 'video/*', 'user')}
          <p className="muted" style={{ fontSize: 12 }}>
            Seus documentos ficam cifrados e acessíveis apenas à equipe de verificação. Somente o vídeo de verificação é exibido no anúncio.
          </p>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Enviando…' : 'Enviar para análise'}</button>
        </div>
      )}
      {error && <div className="card" style={{ borderColor: 'var(--danger)' }}>{error}</div>}
    </section>
  );
}
