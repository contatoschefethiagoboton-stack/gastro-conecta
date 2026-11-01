'use client';
import { useState } from 'react';
import { api, session } from '@/lib/api';

export default function LoginForm({ onLogin, title = 'Entrar' }: { onLogin: (token: string, role: string) => void; title?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth-shell">
      <form className="card solid" style={{ width: 'min(400px, 100%)', display: 'grid', gap: 14, padding: 28, borderRadius: 24 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          try {
            const r = await api<{ token: string; role: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
            session.set(r.token);
            onLogin(r.token, r.role);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}>
        <span className="logo-mark" style={{ width: 44, height: 44, borderRadius: 14 }}>18+</span>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: '-0.02em' }}>{title}</h1>
        <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>}
        <button className="btn primary lg block" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
