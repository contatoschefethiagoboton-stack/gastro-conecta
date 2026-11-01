'use client';
import { useState } from 'react';
import { IconFlag } from './Icons';
import { api } from '@/lib/api';

const REASONS = [
  ['menor_de_idade', 'Pessoa aparenta ser menor de idade'],
  ['trafico_coercao', 'Suspeita de exploração, tráfico ou coação'],
  ['conteudo_sem_consentimento', 'Foto/vídeo publicado sem consentimento'],
  ['perfil_falso', 'Perfil falso / fotos de outra pessoa'],
  ['golpe', 'Golpe ou cobrança antecipada suspeita'],
  ['outro', 'Outro motivo'],
] as const;

export default function DenunciaBotao({ adId }: { adId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0][0]);
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) return <p className="muted" style={{ fontSize: 13 }}>Denúncia recebida. Nossa equipe vai analisar com prioridade.</p>;
  if (!open) {
    return (
      <button className="btn ghost sm" onClick={() => setOpen(true)} style={{ justifySelf: 'start', color: 'var(--muted)' }}>
        <IconFlag /> Denunciar este perfil
      </button>
    );
  }

  return (
    <form className="card" style={{ display: 'grid', gap: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        await api(`/ads/${adId}/report`, { method: 'POST', body: JSON.stringify({ reason, details: details || undefined }) });
        setSent(true);
      }}>
      <strong>Denunciar perfil</strong>
      <label>Motivo
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label>Detalhes (opcional)<textarea rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} /></label>
      <p className="subtle" style={{ fontSize: 12, margin: 0 }}>Risco imediato: ligue 190. Exploração sexual infantil: Disque 100.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Cancelar</button>
        <button className="btn danger" type="submit">Enviar denúncia</button>
      </div>
    </form>
  );
}
