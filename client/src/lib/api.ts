import { COOKIE_NAME } from '@shared/const';
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const sessionHeaders: Record<string,string> = {};
  try {
    const raw = sessionStorage.getItem('manus-cookie');
    const prefix = `${COOKIE_NAME}=`;
    const pair = raw?.split(';').find(value=>value.trim().startsWith(prefix));
    const token = pair?.trim().slice(prefix.length);
    if (token) sessionHeaders.Authorization = `Bearer ${token}`;
  } catch { /* Storage can be restricted in embedded previews. */ }
  const response = await fetch(`/api/gastro${path}`, {
    ...options, credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders, ...options.headers },
  });
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('Não foi possível conectar à plataforma. Tente novamente.'); }
  if (!response.ok) {
    const error = body as { error?: string };
    const failure = new Error(error.error || 'Não foi possível concluir esta ação.') as Error & {status: number};
    failure.status = response.status;
    throw failure;
  }
  return body as T;
}
export const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
export type CurrentUser = { id: number; name: string; email: string; accountType: 'client'|'provider'|'freelancer'; role: 'user'|'admin'; status: string; city?: string; bio?: string; };
