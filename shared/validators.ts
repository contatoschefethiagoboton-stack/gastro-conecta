// Validações brasileiras compartilhadas entre navegador e servidor.
export const onlyDigits = (value: string | null | undefined) => String(value ?? '').replace(/\D/g, '');

export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/** Telefone com DDD: 10 (fixo) ou 11 (celular) dígitos, aceita +55. */
export function isValidPhoneBR(value: string): boolean {
  let digits = onlyDigits(value);
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return false;
  if (Number(digits.slice(0, 2)) < 11) return false;
  return digits.length === 10 || digits[2] === '9';
}

export const isValidCEP = (value: string) => onlyDigits(value).length === 8;

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;
export const isValidUF = (value: string) => (UFS as readonly string[]).includes(String(value).toUpperCase());

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';
export const PIX_KEY_TYPES: Array<{ value: PixKeyType; label: string }> = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Celular' },
  { value: 'aleatoria', label: 'Chave aleatória' },
];

export function isValidPixKey(type: PixKeyType, key: string): boolean {
  const value = String(key ?? '').trim();
  switch (type) {
    case 'cpf': return isValidCPF(value);
    case 'cnpj': return isValidCNPJ(value);
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 77;
    case 'telefone': return isValidPhoneBR(value);
    case 'aleatoria': return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    default: return false;
  }
}

export function isAdult(birthDate: string, today: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const [y, m, d] = birthDate.split('-').map(Number);
  const birth = new Date(y, m - 1, d);
  if (birth.getFullYear() !== y || birth.getMonth() !== m - 1 || birth.getDate() !== d) return false;
  let age = today.getFullYear() - y;
  if (today.getMonth() < m - 1 || (today.getMonth() === m - 1 && today.getDate() < d)) age -= 1;
  return age >= 18 && age <= 110;
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

/** Aceita URL completa ou @usuario e devolve uma URL https. */
export function normalizeSocial(value: string, network: 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin'): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@/, '').replace(/^\/+/, '');
  const bases = { instagram: 'https://instagram.com/', facebook: 'https://facebook.com/', tiktok: 'https://www.tiktok.com/@', youtube: 'https://youtube.com/@', linkedin: 'https://www.linkedin.com/in/' };
  return /^[A-Za-z0-9._-]{1,60}$/.test(handle) ? bases[network] + handle : '';
}

export const formatCPF = (v: string) => onlyDigits(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
export const formatCNPJ = (v: string) => onlyDigits(v).slice(0, 14).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
export const formatCEP = (v: string) => onlyDigits(v).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
export function formatPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
