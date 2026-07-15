import type { Role, RolesConfig } from '@/types';

function listHas(list: string[] | undefined, email: string): boolean {
  const e = email.toLowerCase();
  return (list ?? []).some((x) => x.trim().toLowerCase() === e);
}

/** Emails from ADMIN_EMAILS env are always ADMIN (bootstrap, lockout-proof). */
export function envAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

export function resolveRole(email: string, roles: RolesConfig): Role {
  if (!email) return 'VIEWER';
  if (listHas(envAdminEmails(), email)) return 'ADMIN';
  if (listHas(roles.admins, email)) return 'ADMIN';
  if (listHas(roles.taUsers, email)) return 'TA';
  if (listHas(roles.viewers, email)) return 'VIEWER';
  return roles.defaultRole ?? 'TA';
}

export function canWrite(role: Role): boolean {
  return role === 'ADMIN' || role === 'TA';
}

export function isAdmin(role: Role): boolean {
  return role === 'ADMIN';
}

/** Domain allow-list from ALLOWED_EMAIL_DOMAINS (empty = allow all). */
export function isDomainAllowed(email: string): boolean {
  const allowed = (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  const domain = email.split('@').pop()?.toLowerCase() ?? '';
  return allowed.includes(domain);
}
