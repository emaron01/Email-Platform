import "server-only";

import { prisma } from "@/lib/prisma";

export class RateLimitError extends Error {
  readonly code = "RATE_LIMITED";
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Durable Postgres-backed rate limiter (safe across multiple Render instances).
 */
export async function assertRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<void> {
  const now = Date.now();
  const windowStartMs = Math.floor(now / input.windowMs) * input.windowMs;
  const windowStart = new Date(windowStartMs);
  const retryAfterSeconds = Math.ceil(
    (windowStartMs + input.windowMs - now) / 1000,
  );

  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" (id, "bucketKey", "windowStart", count, "updatedAt")
    VALUES (
      ${`rl_${input.key}_${windowStartMs}`},
      ${input.key},
      ${windowStart},
      1,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("bucketKey", "windowStart")
    DO UPDATE SET
      count = "RateLimitBucket".count + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING count
  `;

  const count = rows[0]?.count ?? 1;
  if (count > input.limit) {
    throw new RateLimitError(
      "Too many attempts. Please try again later.",
      retryAfterSeconds,
    );
  }
}
