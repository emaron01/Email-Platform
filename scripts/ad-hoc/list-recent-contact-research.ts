import { config } from "dotenv";
config({ path: ".env.local", override: true });
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.contactResearch.findMany({
    orderBy: { researchedAt: "desc" },
    take: 5,
    select: {
      contactId: true,
      currentTitle: true,
      confidence: true,
      roleSummary: true,
      aiProvider: true,
      aiModel: true,
      webSearchCallCount: true,
      promptVersion: true,
      researchedAt: true,
      status: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
