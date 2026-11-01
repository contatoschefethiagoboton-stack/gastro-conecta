export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Erro inesperado.');
  return data as T;
}

/** Upload direto ao bucket via POST pré-assinado (o arquivo não passa pela API). */
export async function uploadPresigned(upload: { url: string; fields: Record<string, string> }, file: File) {
  const form = new FormData();
  Object.entries(upload.fields).forEach(([k, v]) => form.append(k, v));
  form.append('Content-Type', file.type);
  form.append('file', file);
  const res = await fetch(upload.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Falha no envio do arquivo.');
}

export const brl = (cents: number | string | null | undefined) =>
  cents === null || cents === undefined ? '—' : (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export type Option = { value: string; label: string };
export interface Taxonomy {
  categories: Option[];
  genders: Option[];
  massageTypes: Option[];
  orientations: Option[];
  audiences: Option[];
  services: Option[];
  serviceLocations: Option[];
  amenities: Option[];
  acceptedPayments: Option[];
  ageRange: { min: number; max: number };
  radiusKm: { min: number; max: number; default: number };
}

export interface SearchItem {
  id: string;
  slug: string;
  title: string;
  display_name: string;
  age: number;
  category: string;
  gender: string;
  region_label: string;
  city: string;
  lat: number;
  lng: number;
  distance_km: number | null;
  price_from_cents: number | null;
  cover_url: string | null;
  offers_video_call: boolean;
}

/** Sessão simples (sessionStorage) para painel e admin. Navegação pública não usa login. */
export const session = {
  get(): string | null {
    try {
      return sessionStorage.getItem('token');
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) sessionStorage.setItem('token', token);
      else sessionStorage.removeItem('token');
    } catch {
      /* modo privado: segue sem persistir */
    }
  },
};
