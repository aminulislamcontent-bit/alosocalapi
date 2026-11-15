import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Never log SQL parameters: credential ciphertext, account details, and session data
// may otherwise leak into server logs. Enable query tracing only in an isolated test DB.
export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
