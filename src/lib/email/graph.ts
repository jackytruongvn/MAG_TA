/**
 * Microsoft Graph sendMail — three interchangeable modes via EMAIL_MODE:
 *
 * log  -> no network call; email is printed to the server console and
 *         treated as sent (local development, default).
 * graph -> OAuth2 client-credentials flow (Application permission Mail.Send,
 *          admin-consented). Recommended for production: works unattended
 *          (scheduler), no password stored, easy to scope with an
 *          ApplicationAccessPolicy to only GRAPH_SENDER_MAILBOX.
 * ropc  -> OAuth2 Resource Owner Password Credentials flow (Delegated
 *          Mail.Send, no admin consent needed beyond the user's own).
 *          Authenticates AS GRAPH_SENDER_MAILBOX using its own password
 *          (GRAPH_SENDER_PASSWORD) and sends via /me/sendMail.
 *          CAVEATS (see README.md §3.4b):
 *            - fails if the mailbox account has MFA / is subject to a
 *              Conditional Access policy that blocks legacy auth
 *            - Microsoft documents ROPC as legacy/discouraged — prefer
 *              the `graph` (Application permission) mode when possible
 *            - the mailbox's real password is a live credential sitting in
 *              .env; rotate it like any secret and never commit it
 */

export interface SendMailInput {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
}

export interface SendMailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

type GraphAuthMode = 'app' | 'ropc';

let cachedAppToken: { token: string; expiresAt: number } | null = null;
let cachedRopcToken: { token: string; expiresAt: number } | null = null;

function requireEnv(vars: Record<string, string | undefined>, hint: string): Record<string, string> {
  const missing = Object.entries(vars).filter(([, v]) => !v);
  if (missing.length > 0) {
    throw new Error(`Graph credentials missing: set ${missing.map(([k]) => k).join(', ')} in .env (${hint})`);
  }
  return vars as Record<string, string>;
}

async function getAppOnlyToken(): Promise<string> {
  if (cachedAppToken && cachedAppToken.expiresAt > Date.now() + 60_000) return cachedAppToken.token;

  const { tenantId, clientId, clientSecret } = requireEnv(
    {
      tenantId: process.env.GRAPH_TENANT_ID || process.env.AZURE_AD_TENANT_ID,
      clientId: process.env.GRAPH_CLIENT_ID || process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.GRAPH_CLIENT_SECRET || process.env.AZURE_AD_CLIENT_SECRET,
    },
    'app-only client-credentials flow, EMAIL_MODE=graph',
  );

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph token request failed (${res.status}): ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedAppToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function getRopcToken(): Promise<string> {
  if (cachedRopcToken && cachedRopcToken.expiresAt > Date.now() + 60_000) return cachedRopcToken.token;

  const { tenantId, clientId, username, password } = requireEnv(
    {
      tenantId: process.env.GRAPH_TENANT_ID || process.env.AZURE_AD_TENANT_ID,
      clientId: process.env.GRAPH_CLIENT_ID || process.env.AZURE_AD_CLIENT_ID,
      username: process.env.GRAPH_SENDER_MAILBOX,
      password: process.env.GRAPH_SENDER_PASSWORD,
    },
    'ROPC flow, EMAIL_MODE=ropc',
  );
  const clientSecret = process.env.GRAPH_CLIENT_SECRET || process.env.AZURE_AD_CLIENT_SECRET;

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      grant_type: 'password',
      username,
      password,
      scope: 'https://graph.microsoft.com/Mail.Send offline_access',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (body.includes('AADSTS50076') || body.includes('AADSTS50079') || body.includes('AADSTS50158')) {
      throw new Error(
        `Graph ROPC token failed: the mailbox account requires MFA / Conditional Access, which blocks ` +
          `the password flow. Either exclude this account from MFA/Conditional Access, or switch ` +
          `EMAIL_MODE to "graph" with an Application permission instead. Raw error: ${body.slice(0, 300)}`,
      );
    }
    if (body.includes('AADSTS50126')) {
      throw new Error('Graph ROPC token failed: invalid GRAPH_SENDER_MAILBOX / GRAPH_SENDER_PASSWORD.');
    }
    throw new Error(`Graph ROPC token request failed (${res.status}): ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedRopcToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export function getSenderMailbox(): string {
  return process.env.GRAPH_SENDER_MAILBOX || 'hr.support@masterisegroup.com';
}

function graphAuthMode(): GraphAuthMode {
  return (process.env.EMAIL_MODE ?? '').toLowerCase() === 'ropc' ? 'ropc' : 'app';
}

export async function sendMailViaGraph(input: SendMailInput): Promise<SendMailResult> {
  const mode = (process.env.EMAIL_MODE ?? 'log').toLowerCase();

  if (mode !== 'graph' && mode !== 'ropc') {
    console.info(
      `\n[EMAIL_MODE=log] Simulated send from ${getSenderMailbox()}\n` +
        `  To: ${input.to.join('; ')}\n  Cc: ${input.cc.join('; ')}\n  Subject: ${input.subject}\n` +
        `  Body: ${input.html.slice(0, 300).replace(/\n/g, ' ')}...\n`,
    );
    return { ok: true, messageId: `dev-log-${Date.now()}` };
  }

  try {
    const authMode = graphAuthMode();
    const sender = getSenderMailbox();
    const token = authMode === 'ropc' ? await getRopcToken() : await getAppOnlyToken();
    // ROPC authenticates AS the mailbox itself -> /me/sendMail.
    // App-only authenticates as the app -> must target the mailbox explicitly.
    const endpoint =
      authMode === 'ropc'
        ? 'https://graph.microsoft.com/v1.0/me/sendMail'
        : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;

    const message = {
      message: {
        subject: input.subject,
        body: { contentType: 'HTML', content: input.html },
        toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: input.cc.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (res.status === 202) return { ok: true, messageId: `graph-202-${Date.now()}` };
    const body = await res.text();
    return { ok: false, error: `Graph sendMail failed (${res.status}): ${body.slice(0, 500)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
