/** Tiny classnames helper. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const EMAIL_RE = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Split a Cc-style string on ';' or ',' into trimmed, non-empty emails. */
export function splitEmails(value: string | null | undefined): string[] {
  if (!value) return [];
  return String(value)
    .split(/[;,]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Case-insensitive unique emails, preserving first-seen casing. */
export function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const k = e.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(e.trim());
  }
  return out;
}

/** Validate a multi-email string; returns the first invalid email or null. */
export function firstInvalidEmail(value: string | null | undefined): string | null {
  for (const e of splitEmails(value)) {
    if (!isValidEmail(e)) return e;
  }
  return null;
}

export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Mask a date-only ISO string, keeping only the year (day and month replaced with asterisks). */
export function maskDob(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-/);
  return m ? `**/**/${m[1]}` : '**/**/****';
}

/** Mask a phone number as (+84)*******123 — country code shown, last 3 digits visible. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  // strip any existing country code / leading trunk zero so it isn't duplicated
  const digits = String(phone).trim().replace(/^\+?84/, '').replace(/^0/, '');
  if (digits.length <= 3) return `(+84)${'*'.repeat(digits.length)}`;
  return `(+84)${'*'.repeat(digits.length - 3)}${digits.slice(-3)}`;
}

export function getEmailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

/** Normalize for header matching: lowercase, strip diacritics + non-alphanumerics. */
export function normalizeHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
