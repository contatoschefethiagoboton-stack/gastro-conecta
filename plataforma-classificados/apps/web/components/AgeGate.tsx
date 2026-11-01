'use client';
/**
 * Aviso de conteúdo adulto exibido na primeira visita.
 * Não exige cadastro (navegação livre), mas registra a declaração de maioridade
 * no navegador e bloqueia a visualização até a confirmação.
 */
import { useEffect, useState } from 'react';

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
      <div className="card">
        <h1 id="age-title" style={{ margin: 0 }}>Conteúdo adulto</h1>
        <p className="muted">
          Este site contém imagens e vídeos de nudez e conteúdo sexual explícito, destinados exclusivamente a
          maiores de 18 anos. Ao entrar você declara ter 18 anos ou mais e que esse conteúdo é legal no local onde está.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={confirm}>Tenho 18 anos ou mais — entrar</button>
          <a className="btn" href="https://www.google.com">Sair</a>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Pais e responsáveis: este site possui o selo RTA e pode ser bloqueado por ferramentas de controle parental.
        </p>
      </div>
    </div>
  );
}
