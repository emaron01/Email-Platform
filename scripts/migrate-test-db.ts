/**
 * Apply Prisma migrations to the TEST database only, then prove collapse
 * preview (and apply if needed) before the unique-email migration can stick.
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

const env = { ...process.env, DATABASE_URL: url };

function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: true,
  });
  return result.status ?? 1;
}

let status = run("npx", ["prisma", "migrate", "deploy"]);

// Separate process avoids Windows libuv crash when PrismaClient shares a
// process with spawnSync(prisma).
console.log("Contact collapse preview:");
const previewStatus = run("npx", [
  "tsx",
  "scripts/collapse-contacts.ts",
  "--preview",
]);
if (previewStatus !== 0 && status === 0) status = previewStatus;

if (status !== 0) {
  console.log("Migrate or preview failed; attempting collapse apply then redeploy...");
  run("npx", ["tsx", "scripts/collapse-contacts.ts", "--apply"]);
  status = run("npx", ["prisma", "migrate", "deploy"]);
}

process.exit(status);
