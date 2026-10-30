import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { EyeOff, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { demosFrom, DEMO_CATALOG_KEY, type Professional } from '@shared/catalog';

type Values = Record<string, string>;

/** Só para a administração: excluir o portfólio ou tirá-lo da página inicial direto da página dele. */
export default function AdminCardActions({ professional: p }: { professional: Professional }) {
  const me = useQuery({ queryKey: ['gastro-me'], queryFn: () => api<{ user: { role: string } | null }>('/me'), retry: false, staleTime: 60_000 });
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState('');
  if (me.data?.user?.role !== 'admin') return null;
  const save = async (kind: string, change: (values: Values) => Values, message: string) => {
    setBusy(kind);
    try {
      const { values } = await api<{ values: Values }>('/admin/content');
      await api('/admin/content', { method: 'PUT', body: JSON.stringify({ values: change(values) }) });
      await queryClient.invalidateQueries();
      toast.success(message);
      if (kind === 'delete') navigate('/profissionais');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível concluir.'); } finally { setBusy(''); }
  };
  const remove = () => {
    if (!confirm(`Excluir o portfólio demonstrativo “${p.name}” do site?`)) return;
    void save('delete', values => ({ [DEMO_CATALOG_KEY]: JSON.stringify(demosFrom(values).filter(d => d.id !== p.id)) }), 'Portfólio excluído do site.');
  };
  const hideFromHome = () => void save('hide', values => {
    const hidden = (values['home.hiddenProfessionals'] ?? '').split(',').filter(Boolean);
    return { 'home.hiddenProfessionals': [...new Set([...hidden, p.id])].join(',') };
  }, 'Card tirado da página inicial.');
  return <div className="admin-card-actions" role="region" aria-label="Ações da administração">
    <span><ShieldCheck size={16}/> Administração</span>
    <button type="button" onClick={hideFromHome} disabled={Boolean(busy)}>{busy === 'hide' ? <Loader2 className="animate-spin" size={15}/> : <EyeOff size={15}/>} Tirar da página inicial</button>
    {p.demo && <button type="button" className="danger" onClick={remove} disabled={Boolean(busy)}>{busy === 'delete' ? <Loader2 className="animate-spin" size={15}/> : <Trash2 size={15}/>} Excluir este portfólio</button>}
  </div>;
}
