/**
 * Database safety check before Prisma migrations.
 * Prints host + database name only (never passwords).
 * Aborts if the target looks like a SalesForecaster database.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !databaseUrl.trim()) {
  console.error("DATABASE_URL is not set. Add it to .env.local before migrating.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  console.error("DATABASE_URL is not a valid URL.");
  process.exit(1);
}

const host = parsed.hostname || "(unknown host)";
const port = parsed.port || "(default)";
const databaseName = decodeURIComponent(
  parsed.pathname.replace(/^\//, "") || "(unknown)",
);
const schemaParam = parsed.searchParams.get("schema") || "public";

console.log("Prisma connection target (credentials redacted):");
console.log(`  Host:     ${host}`);
console.log(`  Port:     ${port}`);
console.log(`  Database: ${databaseName}`);
console.log(`  Schema:   ${schemaParam}`);

const salesForecasterPattern = /salesforecaster|sales[_-]?forecaster/i;
if (
  salesForecasterPattern.test(databaseName) ||
  salesForecasterPattern.test(host) ||
  salesForecasterPattern.test(databaseUrl)
) {
  console.error("");
  console.error("SAFETY STOP: Target appears associated with SalesForecaster.");
  console.error("This project must never modify a SalesForecaster database.");
  process.exit(1);
}

const looksLikeEmailPlatform =
  /email[_-]?platform|outbound|emailapp/i.test(databaseName) ||
  databaseName === "postgres" ||
  databaseName === "neondb";

console.log("");
if (!looksLikeEmailPlatform) {
  console.log(
    "NOTE: Database name does not clearly match email-platform naming.",
  );
  console.log(
    "Confirm manually that this is the dedicated email-platform database",
  );
  console.log("and that it does not contain SalesForecaster tables.");
} else {
  console.log("Database name looks plausible for this project.");
}

console.log("");
console.log("Safety check passed (no SalesForecaster name match).");
console.log("Before migrating, optionally inspect tables for leftovers:");
console.log(
  '  SELECT tablename FROM pg_tables WHERE schemaname = \'public\';',
);
console.log("");
console.log("Then run:");
console.log("  npx prisma migrate deploy");
console.log("  # or for local iterative development:");
console.log("  npx prisma migrate dev");
