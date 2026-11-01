'use client';
/**
 * Aviso de conteúdo adulto exibido na primeira visita.
 * Não exige cadastro (navegação livre), mas bloqueia a visualização até a declaração de maioridade.
 */
import { useEffect, useState } from 'react';
import Logo from './Logo';

const KEY = 'age-confirmed-v1';

export default function AgeGate() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(KEY) !== '1');
    } catch {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
  }, [open]);

  if (!open) return null;

  const confirm = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* sem armazenamento: perguntará de novo na próxima visita */
    }
    setOpen(false);
  };

  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <div className="panel">
        <div className="seal">18+</div>
        <span className="logo" style={{ justifySelf: 'center', fontSize: 22 }}><Logo /></span>
        <h1 id="age-title">Conteúdo para adultos</h1>
        <p className="muted" style={{ margin: 0 }}>
          Este site contém nudez e conteúdo sexual explícito. Ao continuar, você declara ter 18 anos ou mais
          e que esse conteúdo é legal no lugar onde você está.
        </p>
        <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
          <button className="btn primary lg block" onClick={confirm}>Tenho 18 anos ou mais — entrar</button>
          <a className="btn ghost block" href="https://www.google.com">Sair</a>
        </div>
        <p className="subtle" style={{ fontSize: 12, margin: 0 }}>
          Site com selo RTA: pode ser bloqueado por ferramentas de controle parental.
        </p>
      </div>
    </div>
  );
}
