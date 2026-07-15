/**
 * Seed default app_config (email settings, schedule, templates, columns, roles)
 * and bootstrap admin users from ADMIN_EMAILS.
 * Run: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_CONFIG } from '../src/lib/config';

const prisma = new PrismaClient();

async function main() {
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    await prisma.appConfig.upsert({
      where: { key },
      update: {}, // never overwrite existing config on re-seed
      create: { key, valueJson: JSON.stringify(value), updatedByEmail: 'seed' },
    });
    console.log(`config: ${key} ok`);
  }

  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const email of admins) {
    await prisma.user.upsert({
      where: { email },
      update: { role: 'ADMIN' },
      create: { email, role: 'ADMIN', displayName: email.split('@')[0] },
    });
    console.log(`admin user: ${email} ok`);
  }

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
