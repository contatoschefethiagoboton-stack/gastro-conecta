'use client';
/**
 * Painel do gestor: KPIs em tempo real (SSE), gráficos de crescimento/receita,
 * filas de moderação, degustação e sinais de fraude.
 */
import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import LoginForm from '@/components/LoginForm';
import { API_URL, api, brl, session } from '@/lib/api';

type Snapshot = Record<string, number | string>;
type SeriesRow = { day: string; new_advertisers: number; ads_published: number; subscription_cents: string; ppv_cents: string };
type Queue = 'ads' | 'media' | 'verifications' | 'ppv' | 'reports';

const KPIS: [string, string, boolean?][] = [
  ['active_ads', 'Anúncios ativos'], ['active_advertisers', 'Anunciantes ativos'], ['paying_subscriptions', 'Assinaturas pagas'],
  ['trials', 'Degustações'], ['past_due', 'Inadimplentes'], ['mrr_cents', 'MRR', true], ['revenue_today_cents', 'Receita hoje', true],
  ['revenue_month_cents', 'Receita no mês', true], ['pending_verifications', 'Verificações pendentes'], ['pending_ads', 'Anúncios p/ moderar'],
  ['pending_media', 'Mídias p/ moderar'], ['open_reports', 'Denúncias abertas'], ['open_fraud_flags', 'Alertas de fraude'],
];

/** SSE via fetch (permite cabeçalho Authorization, ao contrário do EventSource). */
function useLiveSnapshot(token: string | null, onData: (s: Snapshot) => void) {
  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    (async () => {
      const res = await fetch(`${API_URL}/admin/metrics/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (data) onData(JSON.parse(data.slice(6)));
        }
      }
    })().catch(() => undefined);
    return () => ctrl.abort();
  }, [token, onData]);
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [queue, setQueue] = useState<Queue>('verifications');
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [trial, setTrial] = useState({ userId: '', days: 10, reason: '' });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => setToken(session.get()), []);
  useLiveSnapshot(token, useCallback((s: Snapshot) => setSnap(s), []));

  useEffect(() => {
    if (!token) return;
    api<{ snapshot: Snapshot; series: SeriesRow[] }>('/admin/metrics?days=30', { token })
      .then((r) => { setSnap(r.snapshot); setSeries(r.series); })
      .catch(() => { session.set(null); setToken(null); });
  }, [token]);

  const loadQueue = useCallback(() => {
    if (token) api<Record<string, any>[]>(`/admin/queue/${queue}`, { token }).then(setRows).catch((e) => setMsg(e.message));
  }, [token, queue]);
  useEffect(loadQueue, [loadQueue]);

  if (!token) return <LoginForm title="Painel administrativo" onLogin={(t) => setToken(t)} />;

  const act = async (path: string, body: unknown) => {
    setMsg(null);
    try {
      await api(path, { method: 'POST', token, body: JSON.stringify(body) });
      setMsg('Ação registrada no log de auditoria.');
      loadQueue();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const decide = (r: Record<string, any>, approve: boolean) => {
    const reason = approve ? undefined : prompt('Motivo da reprovação:') ?? undefined;
    if (queue === 'ads') return act(`/admin/ads/${r.id}/status`, { status: approve ? 'active' : 'rejected', reason });
    if (queue === 'media') return act(`/admin/media/${r.id}/decision`, { decision: approve ? 'approve' : 'reject', reason });
    if (queue === 'verifications') return act(`/admin/verifications/${r.id}/decision`, { decision: approve ? 'approve' : 'reject', reason });
    if (queue === 'ppv') return act(`/admin/ppv/${r.id}/decision`, { decision: approve ? 'approve' : 'reject', reason });
    return act(`/admin/reports/${r.id}/resolve`, { status: approve ? 'resolved' : 'dismissed', reason });
  };

  const chartData = series.map((s) => ({ ...s, assinaturas: Number(s.subscription_cents) / 100, ppv: Number(s.ppv_cents) / 100 }));

  return (
    <section style={{ display: 'grid', gap: 16, padding: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Painel do gestor</h1>
        <span className="muted">Atualizado {snap?.generated_at ? new Date(String(snap.generated_at)).toLocaleTimeString('pt-BR') : '—'} · ao vivo</span>
      </div>

      <div className="kpis">
        {KPIS.map(([k, label, money]) => (
          <div key={k} className="card kpi">
            <div className="muted" style={{ fontSize: 13 }}>{label}</div>
            <div className="value">{snap ? (money ? brl(snap[k] as number) : snap[k]) : '—'}</div>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="card" style={{ height: 300 }}>
          <strong>Receita diária (R$)</strong>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#332c3d" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: '#a69cb3', fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fill: '#a69cb3', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1720', border: '1px solid #332c3d' }} />
              <Legend />
              <Line type="monotone" dataKey="assinaturas" stroke="#e0457b" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="ppv" stroke="#7c9cff" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{ height: 300 }}>
          <strong>Crescimento</strong>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="#332c3d" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: '#a69cb3', fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis allowDecimals={false} tick={{ fill: '#a69cb3', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1720', border: '1px solid #332c3d' }} />
              <Legend />
              <Bar dataKey="new_advertisers" name="Novos anunciantes" fill="#e0457b" />
              <Bar dataKey="ads_published" name="Anúncios publicados" fill="#7c9cff" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div className="chips">
          {(['verifications', 'ads', 'media', 'ppv', 'reports'] as Queue[]).map((q) => (
            <button key={q} className="chip" aria-pressed={queue === q} onClick={() => setQueue(q)}>
              {{ verifications: 'Verificações', ads: 'Anúncios', media: 'Fotos/vídeos', ppv: 'PPV', reports: 'Denúncias' }[q]}
            </button>
          ))}
        </div>
        {msg && <div className="muted">{msg}</div>}
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Item</th><th>Detalhes</th><th>Ações</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.preview_url && (r.kind === 'video' ? <video src={r.preview_url} width={120} controls /> : <img src={r.preview_url} width={120} alt="" />)}
                    <div>{r.display_name ?? r.title ?? r.reason}</div>
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {queue === 'verifications' && <>Face: {r.face_match_score} · Vida: {r.liveness_score} · Doc: {String(r.document_authentic)} · {r.auto_decision}<br />{r.auto_reasons?.join(', ')}</>}
                    {queue === 'ads' && <>{r.category} · {r.gender} · {r.region_label}, {r.city}</>}
                    {queue === 'reports' && <>{r.details}</>}
                    {queue === 'ppv' && <>{brl(r.price_cents)} · {r.view_mode}</>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn primary" onClick={() => decide(r, true)}>{queue === 'reports' ? 'Resolver' : 'Aprovar'}</button>{' '}
                    <button className="btn danger" onClick={() => decide(r, false)}>{queue === 'reports' ? 'Descartar' : 'Reprovar'}</button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={3} className="muted">Fila vazia.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <form className="card" style={{ display: 'grid', gap: 8, maxWidth: 520 }}
        onSubmit={(e) => { e.preventDefault(); act(`/admin/users/${trial.userId}/trial`, { days: trial.days, reason: trial.reason }); }}>
        <strong>Liberar degustação gratuita</strong>
        <label>ID do anunciante<input required value={trial.userId} onChange={(e) => setTrial({ ...trial, userId: e.target.value })} /></label>
        <label>Dias<input type="number" min={1} max={60} value={trial.days} onChange={(e) => setTrial({ ...trial, days: Number(e.target.value) })} /></label>
        <label>Motivo<input required minLength={3} value={trial.reason} onChange={(e) => setTrial({ ...trial, reason: e.target.value })} /></label>
        <button className="btn primary" type="submit">Liberar</button>
      </form>
    </section>
  );
}
