// Equipe da administração: dono, administradores, gerentes e operadores.
// O dono tem acesso a tudo e não pode ser alterado nem excluído por ninguém.
// Administradores têm acesso a tudo, menos mexer no dono e em outros administradores.
// Gerentes e operadores só fazem o que o dono (ou quem gerencia a equipe) liberar.

export type StaffRole = 'owner' | 'admin' | 'manager' | 'operator';
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = { owner: 'Dono', admin: 'Administrador', manager: 'Gerente', operator: 'Operador' };

export const PERMISSIONS = [
  { key: 'overview.view', group: 'Geral', label: 'Ver a visão geral (números do site)' },
  { key: 'users.view', group: 'Contas', label: 'Ver clientes e profissionais' },
  { key: 'users.private', group: 'Contas', label: 'Ver dados privados (documentos, endereço, foto do rosto, banco/Pix)' },
  { key: 'users.edit', group: 'Contas', label: 'Aprovar, editar, suspender e bloquear contas' },
  { key: 'users.delete', group: 'Contas', label: 'Excluir contas de clientes e profissionais' },
  { key: 'subscriptions.view', group: 'Financeiro', label: 'Ver assinaturas' },
  { key: 'subscriptions.manage', group: 'Financeiro', label: 'Conceder assinaturas e mudar preços individuais' },
  { key: 'payments.view', group: 'Financeiro', label: 'Ver pagamentos recebidos' },
  { key: 'payments.manage', group: 'Financeiro', label: 'Configurar Mercado Pago e preços' },
  { key: 'contracts.view', group: 'Contratos', label: 'Ver e baixar contratos e listas de compras' },
  { key: 'content.edit', group: 'Site', label: 'Editar textos, imagens e serviços do site' },
  { key: 'promotions.manage', group: 'Site', label: 'Criar e editar promoções' },
  { key: 'benefits.manage', group: 'Site', label: 'Bônus, benefícios e cupons' },
  { key: 'marketing.view', group: 'Site', label: 'Ver marketing e crescimento' },
  { key: 'notifications.manage', group: 'Site', label: 'Configurar avisos por e-mail e WhatsApp' },
  { key: 'audit.view', group: 'Segurança', label: 'Ver o histórico de ações (auditoria)' },
  { key: 'staff.manage', group: 'Segurança', label: 'Gerenciar a equipe (gerentes só criam operadores)' },
] as const;
export type Permission = typeof PERMISSIONS[number]['key'];
export const ALL_PERMISSIONS = PERMISSIONS.map(p => p.key) as Permission[];
const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

/** Sugestão inicial ao criar cada papel (o dono ajusta marcando e desmarcando). */
export const ROLE_DEFAULTS: Record<'manager' | 'operator', Permission[]> = {
  manager: ['overview.view', 'users.view', 'users.edit', 'subscriptions.view', 'payments.view', 'contracts.view', 'content.edit', 'promotions.manage', 'benefits.manage', 'marketing.view', 'audit.view'],
  operator: ['overview.view', 'users.view', 'contracts.view'],
};

export const isFullAccess = (role: StaffRole) => role === 'owner' || role === 'admin';

export function normalizePermissions(value: unknown): Permission[] {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.filter((p): p is Permission => typeof p === 'string' && PERMISSION_SET.has(p)))];
}

/** Permissões que valem de fato para o papel. */
export function effectivePermissions(role: StaffRole, permissions: unknown): Permission[] {
  if (isFullAccess(role)) return [...ALL_PERMISSIONS];
  const list = normalizePermissions(permissions);
  // Operador nunca gerencia equipe.
  return role === 'operator' ? list.filter(p => p !== 'staff.manage') : list;
}

/**
 * Quem pode criar ou alterar quem: o dono mexe em todos (menos nele mesmo pelo painel de equipe);
 * administradores mexem em gerentes e operadores; gerentes com "staff.manage" só em operadores.
 */
export function canManageRole(actor: StaffRole, target: StaffRole): boolean {
  if (target === 'owner') return false;
  if (actor === 'owner') return true;
  if (actor === 'admin') return target === 'manager' || target === 'operator';
  if (actor === 'manager') return target === 'operator';
  return false;
}

/**
 * Permissão exigida por cada endereço da administração (método + caminho dentro de /api/gastro).
 * "staff" = qualquer pessoa da equipe; null = endereço desconhecido, só dono e administradores.
 */
export function permissionForRequest(method: string, path: string): Permission | 'staff' | null {
  const m = method.toUpperCase();
  const read = m === 'GET' || m === 'HEAD';
  const p = path.replace(/\/+$/, '');
  const rules: Array<[RegExp, Permission | 'staff' | ((read: boolean) => Permission | 'staff')]> = [
    [/^\/admin\/(password|me)$/, 'staff'],
    [/^\/admin\/notifications(\/read)?$/, 'staff'],
    [/^\/admin\/notifications\/(settings|test)$/, 'notifications.manage'],
    [/^\/admin\/overview$/, 'overview.view'],
    [/^\/report\/pdf$/, 'audit.view'],
    [/^\/admin\/audit$/, 'audit.view'],
    [/^\/admin\/staff(\/.*)?$/, 'staff.manage'],
    [/^\/admin\/users\/\d+\/details$/, 'users.private'],
    [/^\/admin\/users\/\d+\/subscription-pricing$/, 'subscriptions.manage'],
    [/^\/admin\/users\/\d+\/(reset-link|growth)$/, r => (r ? 'users.view' : 'users.edit')],
    [/^\/admin\/users(\/\d+)?$/, r => (r ? 'users.view' : 'users.edit')],
    [/^\/admin\/subscriptions(\/.*)?$/, r => (r ? 'subscriptions.view' : 'subscriptions.manage')],
    [/^\/admin\/payments$/, 'payments.view'],
    [/^\/admin\/payments\/(settings|test|pricing|trial)$/, 'payments.manage'],
    [/^\/admin\/contracts$/, 'contracts.view'],
    [/^\/admin\/(content(\/reset)?|service-draft|media)$/, 'content.edit'],
    [/^\/admin\/promotions(\/.*)?$/, 'promotions.manage'],
    [/^\/admin\/(benefits|benefit-products|coupons)(\/.*)?$/, 'benefits.manage'],
    [/^\/admin\/marketing(\/.*)?$/, 'marketing.view'],
    [/^\/admin\/brief(\/chat)?$/, 'overview.view'],
    [/^\/admin\/brief\/action$/, 'users.edit'],
    [/^\/admin\/brief\/(settings|send)$/, 'notifications.manage'],
    [/^\/admin\/(indexing|social)(\/.*)?$/, r => (r ? 'marketing.view' : 'content.edit')],
  ];
  for (const [re, perm] of rules) if (re.test(p)) return typeof perm === 'function' ? perm(read) : perm;
  return null;
}

/** Senha temporária forte (10+ caracteres, maiúscula, minúscula, número e símbolo). */
export function temporaryPassword(random: (n: number) => number): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*?'];
  const all = sets.join('');
  const chars = [...sets.map(s => s[random(s.length)]), ...Array.from({ length: 10 }, () => all[random(all.length)])];
  for (let i = chars.length - 1; i > 0; i--) { const j = random(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
