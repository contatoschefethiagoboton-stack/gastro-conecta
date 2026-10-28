import { Fragment, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { contentDefaults, type SiteContent } from '@shared/content';
import { businessDefaults, whatsappLink } from '@shared/business';
import { api } from '@/lib/api';

export type SiteInfo = { content: SiteContent; aiEnabled: boolean; adminSetupRequired: boolean; database: 'ok' | 'error' | 'missing' };

export function useSite() {
  const query = useQuery({ queryKey: ['gastro-site'], queryFn: () => api<SiteInfo>('/site'), retry: 1, staleTime: 30_000 });
  const content: SiteContent = query.data?.content ?? contentDefaults;
  const c = (key: string) => content[key] ?? contentDefaults[key] ?? '';
  const whatsappNumber = c('contact.whatsapp') || businessDefaults.whatsappNumber;
  return {
    ...query,
    content,
    c,
    aiEnabled: Boolean(query.data?.aiEnabled),
    whatsappNumber,
    whatsappDisplay: c('contact.whatsappDisplay') || businessDefaults.whatsappDisplay,
    wa: (message?: string) => whatsappLink(message, whatsappNumber),
  };
}

/** Texto com quebras de linha (Enter no painel) virando <br/>. */
export function Lines({ text }: { text: string }) {
  const parts = String(text ?? '').split('\n');
  return <>{parts.map((part, index) => <Fragment key={index}>{index > 0 && <br />}{part}</Fragment>)}</>;
}

/** Parágrafos separados por linha em branco. */
export function Paragraphs({ text, className }: { text: string; className?: string }): ReactNode {
  return <>{String(text ?? '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map((p, i) => <p key={i} className={className}><Lines text={p} /></p>)}</>;
}
