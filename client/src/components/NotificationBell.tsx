import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';

type Item = { id: number; type: string; title: string; body: string; link: string; read: boolean; createdAt: string };

const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
};

/** Sino de avisos. admin=true usa a central da administração. Atualiza sozinho a cada minuto. */
export default function NotificationBell({ admin = false, onNavigate }: { admin?: boolean; onNavigate?: (link: string) => void }) {
  const base = admin ? '/admin/notifications' : '/notifications';
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const query = useQuery({ queryKey: ['gc-notifications', base], queryFn: () => api<{ notifications: Item[]; unread: number }>(base), refetchInterval: 60_000, retry: false });
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const unread = query.data?.unread ?? 0;
  const markRead = async () => { try { await api(`${base}/read`, { method: 'POST' }); await queryClient.invalidateQueries({ queryKey: ['gc-notifications', base] }); } catch { /* tenta depois */ } };
  const go = (item: Item) => { setOpen(false); if (!item.link) return; if (onNavigate) onNavigate(item.link); else navigate(item.link); };
  return <div className="gc-bell" ref={ref}>
    <button type="button" className="gc-bell-button" aria-label={unread ? `${unread} aviso(s) novo(s)` : 'Avisos'} aria-expanded={open} onClick={() => { setOpen(!open); if (!open && unread) void markRead(); }}>
      <Bell size={19}/>{unread > 0 && <span className="gc-bell-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div className="gc-bell-panel" role="dialog" aria-label="Avisos">
      <header><strong>Avisos</strong>{unread > 0 && <button type="button" onClick={() => void markRead()}><CheckCheck size={14}/> Marcar como lidos</button>}</header>
      {!query.data?.notifications.length ? <p className="gc-bell-empty">Nenhum aviso por enquanto.</p> :
        <ul>{query.data.notifications.slice(0, 40).map(n => <li key={n.id} className={n.read ? '' : 'is-new'}><button type="button" onClick={() => go(n)}><strong>{n.title}</strong>{n.body && <span>{n.body}</span>}<small>{ago(n.createdAt)}</small></button></li>)}</ul>}
    </div>}
  </div>;
}
