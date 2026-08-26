/**
 * Apply Prisma migrations to the TEST database only.
 * Never loads `.env.local`. Refuses Render / production hosts.
 */
import { spawnSync } from "node:child_process";
import {
  assertSafeTestDatabaseUrl,
  resolveTestDatabaseUrl,
} from "../src/test/database";

const url = resolveTestDatabaseUrl();
assertSafeTestDatabaseUrl(url, { purpose: "test migrations" });

const parsed = new URL(url);
console.log("Migrating TEST database (credentials redacted):");
console.log(`  Host:     ${parsed.hostname}`);
console.log(`  Port:     ${parsed.port || "(default)"}`);
console.log(
  `  Database: ${decodeURIComponent(parsed.pathname.replace(/^\//, "") || "(unknown)")}`,
);

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
  shell: true,
});

process.exit(result.status ?? 1);
