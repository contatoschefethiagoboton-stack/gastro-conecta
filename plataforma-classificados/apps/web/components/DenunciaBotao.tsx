'use client';
import { useState } from 'react';
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

  if (sent) return <p className="muted">Denúncia recebida. Nossa equipe vai analisar com prioridade.</p>;
  if (!open) return <button className="btn danger" onClick={() => setOpen(true)} style={{ justifySelf: 'start' }}>Denunciar anúncio</button>;

  return (
    <form className="card" style={{ display: 'grid', gap: 8 }}
      onSubmit={async (e) => {
        e.preventDefault();
        await api(`/ads/${adId}/report`, { method: 'POST', body: JSON.stringify({ reason, details: details || undefined }) });
        setSent(true);
      }}>
      <label>Motivo
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label>Detalhes (opcional)<textarea rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} /></label>
      <p className="muted" style={{ fontSize: 12 }}>Em caso de risco imediato, ligue 190. Denúncias de exploração sexual infantil: Disque 100.</p>
      <button className="btn danger" type="submit">Enviar denúncia</button>
    </form>
  );
}
