import { describe, expect, it } from 'vitest';
import { canManageRole, effectivePermissions, permissionForRequest, temporaryPassword, ALL_PERMISSIONS } from '../shared/staff';
import { shouldTrack, trailAction } from './gastro/auditTrail';
import { passwordIsStrong } from './gastro/auth';
import { hasPermission } from './gastro/staff';

describe('equipe e permissões', () => {
  it('dono e administrador têm tudo; operador nunca gerencia equipe', () => {
    expect(effectivePermissions('owner', [])).toEqual(ALL_PERMISSIONS);
    expect(effectivePermissions('admin', [])).toEqual(ALL_PERMISSIONS);
    expect(effectivePermissions('operator', ['users.view', 'staff.manage', 'xpto'])).toEqual(['users.view']);
    expect(effectivePermissions('manager', ['staff.manage'])).toEqual(['staff.manage']);
  });
  it('ninguém mexe no dono; administrador não mexe em administrador; gerente só em operador', () => {
    for (const actor of ['owner', 'admin', 'manager', 'operator'] as const) expect(canManageRole(actor, 'owner')).toBe(false);
    expect(canManageRole('owner', 'admin')).toBe(true);
    expect(canManageRole('admin', 'admin')).toBe(false);
    expect(canManageRole('admin', 'manager')).toBe(true);
    expect(canManageRole('manager', 'operator')).toBe(true);
    expect(canManageRole('manager', 'manager')).toBe(false);
    expect(canManageRole('operator', 'operator')).toBe(false);
  });
  it('cada endereço da administração exige a permissão certa', () => {
    expect(permissionForRequest('GET', '/admin/users')).toBe('users.view');
    expect(permissionForRequest('PATCH', '/admin/users/12')).toBe('users.edit');
    expect(permissionForRequest('GET', '/admin/users/12/details')).toBe('users.private');
    expect(permissionForRequest('PUT', '/admin/content')).toBe('content.edit');
    expect(permissionForRequest('PUT', '/admin/payments/settings')).toBe('payments.manage');
    expect(permissionForRequest('GET', '/admin/payments')).toBe('payments.view');
    expect(permissionForRequest('POST', '/admin/staff')).toBe('staff.manage');
    expect(permissionForRequest('GET', '/admin/audit')).toBe('audit.view');
    expect(permissionForRequest('POST', '/admin/password')).toBe('staff');
    expect(permissionForRequest('DELETE', '/admin/coupons/3')).toBe('benefits.manage');
    expect(permissionForRequest('POST', '/admin/algo-novo')).toBeNull();
  });
  it('operador sem permissão é barrado; dono passa sempre', () => {
    expect(hasPermission({ role: 'operator', permissions: ['users.view'], mustChangePassword: false }, 'users.edit')).toBe(false);
    expect(hasPermission({ role: 'operator', permissions: ['users.view'], mustChangePassword: false }, 'users.view')).toBe(true);
    expect(hasPermission({ role: 'owner', permissions: [], mustChangePassword: false }, 'staff.manage')).toBe(true);
    expect(hasPermission(null, 'users.view')).toBe(false);
  });
  it('a senha temporária é forte', () => {
    for (let i = 0; i < 50; i++) expect(passwordIsStrong(temporaryPassword(n => Math.floor(Math.random() * n)))).toBe(true);
  });
});

describe('histórico de ações', () => {
  it('registra tudo que altera dados e as consultas sensíveis; ignora estatísticas', () => {
    expect(shouldTrack('POST', '/api/gastro/proposals')).toBe(true);
    expect(shouldTrack('DELETE', '/api/gastro/admin/staff/4')).toBe(true);
    expect(shouldTrack('POST', '/api/gastro/track/visit')).toBe(false);
    expect(shouldTrack('GET', '/api/gastro/professionals')).toBe(false);
    expect(shouldTrack('GET', '/api/gastro/admin/users/9/details')).toBe(true);
    expect(shouldTrack('GET', '/api/gastro/contracts/3/pdf')).toBe(true);
    expect(shouldTrack('POST', '/assets/x.js')).toBe(false);
    expect(trailAction('PATCH', '/api/gastro/proposals/12')).toBe('PATCH /proposals/12');
  });
});
