import { config } from "dotenv";
config({ path: ".env.local", override: true });
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      organizationId: true,
      approvalStatus: true,
      approvedEvidenceBundleId: true,
    },
    orderBy: { name: "asc" },
  });
  console.log("Products:", JSON.stringify(products, null, 2));
  for (const p of products) {
    const personas = await prisma.persona.findMany({
      where: { productId: p.id, archivedAt: null },
      select: {
        id: true,
        name: true,
        approvalStatus: true,
        painPoints: true,
        messagingNotes: true,
        definition: true,
        targetTitles: true,
        department: true,
        seniority: true,
        responsibilities: true,
        desiredOutcomes: true,
        approvedPersonaSetupRunId: true,
      },
      orderBy: { name: "asc" },
    });
    console.log(`\n--- ${p.name} personas (${personas.length}) ---`);
    for (const persona of personas) {
      console.log(JSON.stringify({ id: persona.id, name: persona.name, approvalStatus: persona.approvalStatus }));
    }
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
