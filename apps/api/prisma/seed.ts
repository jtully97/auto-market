/**
 * Local development seed: a demo user/workspace with a brand, contacts and a list.
 *   pnpm db:seed   ->   demo@automarket.local / demo-password-123
 */
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const email = 'demo@automarket.local';
const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.log('Seed already applied.');
} else {
  const user = await prisma.user.create({
    data: { email, name: 'Demo User', passwordHash: await bcrypt.hash('demo-password-123', 12) },
  });
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Demo Coffee Co.',
      slug: 'demo-coffee',
      timezone: 'America/New_York',
      memberships: { create: { userId: user.id, role: 'OWNER' } },
      brands: {
        create: {
          name: 'Demo Coffee Co.',
          website: 'https://example.com',
          industry: 'Food & beverage',
          niche: 'Specialty coffee roaster selling direct-to-consumer subscriptions',
          description: 'Small-batch roaster focused on ethically sourced single-origin beans.',
          targetAudience: 'Home brewing enthusiasts aged 25-45 who care about quality and sourcing',
          voice: 'Warm, knowledgeable, a little playful — never snobby',
          keywords: ['pour over', 'single origin', 'coffee subscription'],
          goals: ['Grow subscription sign-ups', 'Build an engaged community'],
          aiOptIn: true,
        },
      },
    },
  });
  const nextMonth = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
  );
  await prisma.creditLot.create({
    data: {
      workspaceId: workspace.id,
      source: 'SUBSCRIPTION',
      granted: 100,
      remaining: 100,
      expiresAt: nextMonth,
      externalRef: `free:${workspace.id}:${new Date().toISOString().slice(0, 7)}`,
    },
  });
  await prisma.creditTransaction.create({
    data: {
      workspaceId: workspace.id,
      type: 'GRANT',
      amount: 100,
      balanceAfter: 100,
      description: 'Free plan monthly credits',
    },
  });
  const list = await prisma.contactList.create({
    data: { workspaceId: workspace.id, name: 'Newsletter' },
  });
  for (const [firstName, lastName] of [
    ['Ava', 'Stone'],
    ['Liam', 'Chen'],
    ['Maya', 'Patel'],
  ] as const) {
    await prisma.contact.create({
      data: {
        workspaceId: workspace.id,
        email: `${firstName.toLowerCase()}@example.com`,
        firstName,
        lastName,
        tags: ['seed'],
        consentAt: new Date(),
        source: 'seed',
        lists: { create: { listId: list.id } },
      },
    });
  }
  console.log(`Seeded ${email} / demo-password-123`);
}
await prisma.$disconnect();
