/**
 * Ordered hard-delete of Product / Persona assisted-setup research graphs.
 * Keeps FK order deterministic for Restrict relations on ProductEvidenceBundle.
 */

import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Clear Persona + Product research rows for a Product, then leave Personas/ICPs/
 * Product for the caller. Must run before deleting ProductEvidenceBundle.
 *
 * FK inventory (holders that block ProductEvidenceBundle delete):
 * - ProductSetupRun.evidenceBundleId → Restrict
 * - PersonaSetupRun.productEvidenceBundleId → Restrict
 * - PersonaEvidenceBundle.productEvidenceBundleId → SetNull (safe)
 */
export async function deleteProductAssistedSetupGraph(
  tx: Tx,
  organizationId: string,
  productId: string,
): Promise<void> {
  // 1) Clear Restrict holders on ProductEvidenceBundle
  await tx.personaSetupRun.deleteMany({
    where: { organizationId, productId },
  });

  // 2) Persona research graph (product-scoped)
  await tx.personaEvidenceBundle.deleteMany({
    where: { organizationId, productId },
  });
  await tx.personaSource.deleteMany({
    where: { organizationId, productId },
  });

  // 3) Product assisted-setup graph
  await tx.productSetupRun.deleteMany({
    where: { organizationId, productId },
  });
  await tx.productEvidenceBundle.deleteMany({
    where: { organizationId, productId },
  });
  await tx.productSource.deleteMany({
    where: { organizationId, productId },
  });
}

/**
 * Clear Persona research rows for one Persona before hard-deleting the Persona.
 * PersonaEvidenceBundle is Product-scoped (no persona FK) — delete only bundles
 * tied to this Persona's setup runs via personaSetupRunId.
 */
export async function deletePersonaAssistedSetupGraph(
  tx: Tx,
  organizationId: string,
  personaId: string,
): Promise<void> {
  const runs = await tx.personaSetupRun.findMany({
    where: { organizationId, personaId },
    select: { id: true },
  });
  const runIds = runs.map((r) => r.id);

  if (runIds.length > 0) {
    await tx.personaSource.deleteMany({
      where: {
        organizationId,
        OR: [{ personaId }, { personaSetupRunId: { in: runIds } }],
      },
    });
    await tx.personaEvidenceBundle.deleteMany({
      where: {
        organizationId,
        personaSetupRunId: { in: runIds },
      },
    });
    await tx.personaSetupRun.deleteMany({
      where: { organizationId, id: { in: runIds } },
    });
  } else {
    await tx.personaSource.deleteMany({
      where: { organizationId, personaId },
    });
  }
}
