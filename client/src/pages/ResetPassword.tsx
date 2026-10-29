import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { PasswordRules, passwordOk } from '@/components/PasswordRules';
import '../dashboard.css';

export default function ResetPassword() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') ?? '', []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!passwordOk(password)) { setError('A senha não cumpre os requisitos.'); return; }
    if (password !== confirm) { setError('As senhas não conferem.'); return; }
    setBusy(true);
    try { await api('/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) }); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível redefinir.'); }
    finally { setBusy(false); }
  };
  return <main className="account-page"><section className="account-shell"><div className="account-intro"><span className="account-kicker">GastroConecta</span><h1>Crie uma nova senha.</h1><p>Por segurança, todas as sessões abertas serão encerradas.</p></div>
    <div className="account-card">{done ? <div className="account-heading"><span className="account-eyebrow"><Check size={14}/> Pronto</span><h2>Senha atualizada</h2><p>Entre com a nova senha.</p><Link href="/conta" className="account-submit"><ArrowRight size={18}/> Ir para o login</Link></div>
      : !token ? <div className="account-heading"><h2>Link inválido</h2><p>Peça um novo link em “Esqueci minha senha”.</p><Link href="/conta" className="account-submit"><ArrowRight size={18}/> Voltar</Link></div>
      : <form className="account-form" onSubmit={submit}>
        <label className="account-field"><span>Nova senha</span><input type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)}/></label>
        <label className="account-field"><span>Repita a nova senha</span><input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)}/></label>
        <PasswordRules value={password}/>
        {error && <p className="account-form-error" role="alert">{error}</p>}
        <button className="account-submit" type="submit" disabled={busy}>{busy ? <Loader2 className="account-spinner" size={18}/> : <ArrowRight size={18}/>} Salvar nova senha</button>
      </form>}</div></section></main>;
}
