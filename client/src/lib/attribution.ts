// Origem do visitante para o marketing (sem dados pessoais): guarda a primeira origem
// (para atribuir o cadastro) e registra uma visita por sessão com a origem atual.
import { classifySource, type Attribution } from '@shared/marketing';

const FIRST_KEY = 'gc-attrib';
const VISITOR_KEY = 'gc-visitor';
const SESSION_KEY = 'gc-visit-sent';

const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

function currentTouch(): Attribution {
  const params = new URLSearchParams(window.location.search);
  return classifySource({
    utmSource: params.get('utm_source'), utmMedium: params.get('utm_medium'), utmCampaign: params.get('utm_campaign'),
    gclid: params.has('gclid') || params.has('gbraid') || params.has('wbraid'), fbclid: params.has('fbclid'),
    referrer: document.referrer, ref: params.get('ref'), ownHost: window.location.hostname,
  });
}

function visitorId(): string {
  return safe(() => {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) { id = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem(VISITOR_KEY, id); }
    return id;
  }, `v${Date.now().toString(36)}`);
}

/** Origem usada no cadastro: a primeira que trouxe o visitante (ou a atual). */
export function getAttribution(): Attribution {
  return safe(() => JSON.parse(localStorage.getItem(FIRST_KEY) || 'null') as Attribution | null, null) ?? currentTouch();
}

/** Chamado uma vez ao abrir o site. */
export function trackVisit() {
  if (window.location.pathname.startsWith('/admin')) return;
  const touch = currentTouch();
  safe(() => { if (!localStorage.getItem(FIRST_KEY) || touch.medium === 'pago' || touch.ref) localStorage.setItem(FIRST_KEY, JSON.stringify(touch)); }, undefined);
  if (safe(() => sessionStorage.getItem(SESSION_KEY), null)) return;
  safe(() => sessionStorage.setItem(SESSION_KEY, '1'), undefined);
  const payload = { visitorId: visitorId(), source: touch.source, medium: touch.medium, ...(touch.campaign ? { campaign: touch.campaign } : {}), ...(document.referrer ? { referrer: document.referrer.slice(0, 200) } : {}), path: window.location.pathname };
  void fetch('/api/gastro/track/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(() => undefined);
}

/** O que as pessoas procuram (termo, serviço e cidade). */
export function trackSearch(input: { term?: string; category?: string; city?: string }) {
  const clean = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, (v ?? '').trim().slice(0, 100)]).filter(([, v]) => v));
  if (!Object.keys(clean).length) return;
  void fetch('/api/gastro/track/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clean), keepalive: true }).catch(() => undefined);
}

/** Link de divulgação com etiqueta (UTM) e código de quem indicou. */
export function shareLink(path: string, source: string, ref?: string) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'indicacao');
  if (ref) url.searchParams.set('ref', ref);
  return url.toString();
}
