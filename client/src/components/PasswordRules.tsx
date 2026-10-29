import { Check } from 'lucide-react';

export const passwordRequirements = [
  { key: 'length', label: '10 caracteres ou mais', test: (value: string) => value.length >= 10 },
  { key: 'upper', label: 'uma letra maiúscula', test: (value: string) => /[A-Z]/.test(value) },
  { key: 'lower', label: 'uma letra minúscula', test: (value: string) => /[a-z]/.test(value) },
  { key: 'digit', label: 'um número', test: (value: string) => /\d/.test(value) },
  { key: 'special', label: 'um caractere especial', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

export const passwordOk = (value: string) => passwordRequirements.every(rule => rule.test(value));

export function PasswordRules({ value }: { value: string }) {
  return <ul className="account-password-rules" aria-label="Regras da senha">{passwordRequirements.map(rule => <li key={rule.key} className={rule.test(value) ? 'is-valid' : ''}><Check size={14} aria-hidden="true"/>{rule.label}</li>)}</ul>;
}
