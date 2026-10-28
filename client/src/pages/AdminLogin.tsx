import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { KeyRound, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import '../admin.css';

type Status = { database: 'ok' | 'error' | 'missing'; setupRequired: boolean; error?: string };

export default function AdminLogin() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', email: '', password: '' });
  const set = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));

  useEffect(() => {
    api<{ user: { role: string } | null }>('/me').then(r => { if (r.user?.role === 'admin') window.location.replace('/admin/painel'); }).catch(() => undefined);
    api<Status>('/admin/status').then(setStatus).catch(() => setStatus({ database: 'error', setupRequired: false }));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (status?.setupRequired) await api('/admin/setup', { method: 'POST', body: JSON.stringify(form) });
      else await api('/admin/login', { method: 'POST', body: JSON.stringify({ email: form.email, password: form.password }) });
      window.location.assign('/admin/painel');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally { setBusy(false); }
  };

  return <main className="adm-login-page">
    <form className="adm-login-card" onSubmit={submit}>
      <span className="adm-login-icon">{status?.setupRequired ? <KeyRound size={22}/> : <Lock size={22}/>}</span>
      <span className="adm-kicker">GastroConecta · gestão</span>
      <h1>{status?.setupRequired ? 'Criar acesso de administrador' : 'Acesso da administração'}</h1>
      {!status && <p className="adm-muted"><Loader2 className="ob-spin" size={16}/> Verificando…</p>}
      {status?.database === 'missing' && <p className="adm-alert">O banco de dados ainda não foi configurado. Defina a variável DATABASE_URL no Render.</p>}
      {status?.database === 'error' && <p className="adm-alert">Não foi possível conectar ao banco de dados. Confira a DATABASE_URL e os logs do Render.</p>}
      {status?.database === 'ok' && <>
        {status.setupRequired && <p className="adm-muted">Primeiro acesso: copie o <strong>código de configuração</strong> que aparece nos logs do Render (menu Logs do serviço) e crie seu login. Isso só acontece uma vez.</p>}
        {status.setupRequired && <label className="ob-field"><span>Código de configuração</span><input required value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="XXXXX-XXXXX" autoComplete="one-time-code"/></label>}
        {status.setupRequired && <label className="ob-field"><span>Seu nome</span><input required value={form.name} onChange={e => set('name', e.target.value)} autoComplete="name"/></label>}
        <label className="ob-field"><span>E-mail</span><input required type="email" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="username"/></label>
        <label className="ob-field"><span>Senha</span><input required type="password" value={form.password} onChange={e => set('password', e.target.value)} autoComplete={status.setupRequired ? 'new-password' : 'current-password'}/></label>
        {status.setupRequired && <p className="adm-hint">Mínimo de 10 caracteres, com maiúscula, minúscula, número e símbolo.</p>}
        <button className="ob-btn ob-btn-primary adm-full" disabled={busy} type="submit">{busy ? <Loader2 className="ob-spin" size={18}/> : <ShieldCheck size={18}/>} {status.setupRequired ? 'Criar e entrar' : 'Entrar'}</button>
      </>}
      <Link href="/" className="adm-back">← Voltar ao site</Link>
    </form>
  </main>;
}
