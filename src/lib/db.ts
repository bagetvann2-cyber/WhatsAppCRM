import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  // Prisma 7 подключается к базе только через драйвер-адаптер.
  const adapter = new PrismaPg({ connectionString: env.databaseUrl() });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

// В разработке Next пересобирает модули на каждом изменении — без кэша
// накопились бы десятки подключений к Postgres.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
