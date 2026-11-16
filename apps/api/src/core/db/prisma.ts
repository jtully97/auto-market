import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';
import { env } from '../../config/env.js';

export type { Prisma } from '../../generated/prisma/client.js';
export * from '../../generated/prisma/enums.js';

const create = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof create> };

export const prisma = globalForPrisma.prisma ?? create();
if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type Db = typeof prisma;
/** Interactive transaction client. */
export type Tx = Prisma.TransactionClient;
export type DbClient = Db | Tx;
