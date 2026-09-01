import { config } from "dotenv";
config({ path: ".env.local", override: true });
import { PrismaClient } from "@prisma/client";

const RUN_ID = "cmthh1bsd003tqq2oy8bxwxbq";

async function main() {
  const prisma = new PrismaClient();
  const run = await prisma.scoringRun.findUnique({
    where: { id: RUN_ID },
    select: { id: true, createdAt: true, status: true },
  });
  if (!run) {
    console.log("Run not found:", RUN_ID);
    return;
  }
  console.log("Run", run);

  const rows = await prisma.contactScore.findMany({
    where: { scoringRunId: RUN_ID },
    select: {
      matchedPersonaId: true,
      assessmentData: true,
      contact: {
        select: { firstName: true, lastName: true, title: true, company: true },
      },
    },
  });

  const unmatched = rows.filter((row) => !row.matchedPersonaId);
  const multiMatch = unmatched.filter(
    (row) =>
      (row.assessmentData as { aiSkipReason?: string } | null)?.aiSkipReason ===
      "MULTI_PERSONA_MATCH",
  );

  console.log({
    total: rows.length,
    autoMatched: rows.length - unmatched.length,
    unmatched: unmatched.length,
    multiPersonaMatch: multiMatch.length,
  });

  console.log("\nUnmatched after rescore (current stored scores):");
  for (const row of unmatched) {
    const assessment = row.assessmentData as {
      aiSkipReason?: string;
      qualificationBucket?: string;
    } | null;
    console.log(
      `- ${row.contact.firstName} ${row.contact.lastName} | ${row.contact.title} | ${assessment?.aiSkipReason ?? "unknown"} | ${assessment?.qualificationBucket ?? ""}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
