/**
 * Preview or apply Contact collapse (duplicate org+normalizedEmail groups).
 *
 * Preview never writes. Apply writes ContactMergeAudit in its own commit
 * before deleting losers, so audits survive independently of delete work
 * and of Prisma migration transactions.
 *
 * Safety: refuses Render / production hosts unless CONTACT_COLLAPSE_ALLOW_PROD=1.
 */
import { PrismaClient } from "@prisma/client";
import {
  applyContactCollapse,
  previewContactCollapse,
} from "../src/lib/contact/collapse";

function usage(): never {
  console.error(
    "Usage: tsx scripts/collapse-contacts.ts --preview|--apply [--organization-id <id>]",
  );
  process.exit(1);
}

function assertSafeUrl(url: string, applying: boolean): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  const host = parsed.hostname.toLowerCase();
  const isRender =
    host.includes("render.com") || host.endsWith(".render.com");
  if (isRender && applying && process.env.CONTACT_COLLAPSE_ALLOW_PROD !== "1") {
    throw new Error(
      "Refusing to apply contact collapse against a Render host. Set CONTACT_COLLAPSE_ALLOW_PROD=1 after reviewing the preview.",
    );
  }
  console.log("Database (credentials redacted):");
  console.log(`  Host:     ${parsed.hostname}`);
  console.log(`  Port:     ${parsed.port || "(default)"}`);
  console.log(
    `  Database: ${decodeURIComponent(parsed.pathname.replace(/^\//, "") || "(unknown)")}`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const preview = args.includes("--preview");
  const apply = args.includes("--apply");
  if (preview === apply) usage();

  const orgIdx = args.indexOf("--organization-id");
  const organizationId =
    orgIdx >= 0 ? args[orgIdx + 1]?.trim() || undefined : undefined;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required.");
  }
  assertSafeUrl(url, apply);

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    const report = await previewContactCollapse(prisma, { organizationId });
    console.log(JSON.stringify(report, null, 2));

    if (preview) {
      console.log(
        `\nPreview only. Duplicate groups: ${report.duplicateGroupCount}. Contacts that would merge away: ${report.contactsThatWouldMergeAway}.`,
      );
      return;
    }

    if (report.duplicateGroupCount === 0) {
      console.log("No duplicate groups to collapse.");
      return;
    }

    console.log(
      `\nApplying collapse for ${report.duplicateGroupCount} group(s)...`,
    );
    const after = await applyContactCollapse(prisma, { organizationId });
    console.log(JSON.stringify(after, null, 2));
    console.log(
      `\nDone. Remaining duplicate groups: ${after.duplicateGroupCount}.`,
    );
    console.log(
      "Verify merges: SELECT * FROM \"ContactMergeAudit\" ORDER BY \"createdAt\" DESC;",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
