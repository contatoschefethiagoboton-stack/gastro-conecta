'use client';
import { useState } from 'react';
import { api, session } from '@/lib/api';

export default function LoginForm({ onLogin, title = 'Entrar' }: { onLogin: (token: string, role: string) => void; title?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="card" style={{ maxWidth: 380, margin: '32px auto', display: 'grid', gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const r = await api<{ token: string; role: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
          session.set(r.token);
          onLogin(r.token, r.role);
        } catch (err) {
          setError((err as Error).message);
        }
      }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
      <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      <button className="btn primary" type="submit">Entrar</button>
    </form>
  );
}
