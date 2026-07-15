import type { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db/prisma';
import { getConfig } from '@/lib/config';
import { resolveRole, isDomainAllowed } from '@/lib/auth/rbac';
import { isValidEmail } from '@/lib/utils';
import { writeAudit } from '@/lib/audit';

const devModeEnabled = () => process.env.AUTH_DEV_MODE === 'true';

async function upsertUser(email: string, name?: string | null, microsoftId?: string | null) {
  const cfg = await getConfig();
  const role = resolveRole(email, cfg.roles);
  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {
      displayName: name ?? undefined,
      microsoftId: microsoftId ?? undefined,
      role,
      lastLoginAt: new Date(),
    },
    create: {
      email: email.toLowerCase(),
      displayName: name ?? null,
      microsoftId: microsoftId ?? null,
      role,
      lastLoginAt: new Date(),
    },
  });
  await writeAudit({
    entityType: 'USER',
    entityId: email.toLowerCase(),
    action: 'LOGIN',
    actorEmail: email.toLowerCase(),
  });
  return role;
}

const providers: NextAuthOptions['providers'] = [];

if (process.env.AZURE_AD_CLIENT_ID) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      tenantId: process.env.AZURE_AD_TENANT_ID,
    }),
  );
}

if (devModeEnabled()) {
  providers.push(
    CredentialsProvider({
      id: 'dev-login',
      name: 'Dev Login (local only)',
      credentials: { email: { label: 'Email', type: 'email' } },
      async authorize(credentials) {
        if (!devModeEnabled()) return null;
        const email = credentials?.email?.trim().toLowerCase() ?? '';
        if (!isValidEmail(email) || !isDomainAllowed(email)) return null;
        return { id: email, email, name: email.split('@')[0] };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, account, profile }) {
      const email = (user.email ?? (profile as { email?: string })?.email ?? '').toLowerCase();
      if (!email || !isValidEmail(email)) return false;
      if (!isDomainAllowed(email)) return false;
      const microsoftId =
        account?.provider === 'azure-ad'
          ? ((profile as { oid?: string; sub?: string })?.oid ?? account.providerAccountId)
          : null;
      await upsertUser(email, user.name, microsoftId);
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email.toLowerCase();
      return token;
    },
    async session({ session, token }) {
      const email = (token.email as string | undefined)?.toLowerCase() ?? '';
      if (session.user) {
        session.user.email = email;
        const cfg = await getConfig();
        session.user.role = resolveRole(email, cfg.roles);
      }
      return session;
    },
  },
};
