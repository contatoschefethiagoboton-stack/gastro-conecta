export const onlyDigits = (v: string): string => v.replace(/\D/g, '');

/** Validação de CPF pelos dígitos verificadores. */
export function isValidCpf(raw: string): boolean {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

/** Idade completa em anos a partir de AAAA-MM-DD (UTC). */
export function ageFromBirthDate(isoDate: string, today = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - y;
  const beforeBirthday =
    today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age;
}

export function slugify(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || 'perfil'}-${suffix}`;
}

/** Arredonda coordenadas (~1,1 km com 2 casas) para nunca expor o endereço real. */
export const roundCoord = (v: number, decimals = 2): number => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};
