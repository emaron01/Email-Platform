/**
 * Next.js server-only boundary for Prisma.
 * Workers and CLI scripts import `@/lib/prisma-client` instead.
 */
import "server-only";

export { prisma } from "@/lib/prisma-client";
