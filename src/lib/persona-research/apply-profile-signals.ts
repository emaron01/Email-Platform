/**
 * Apply projected Persona signals from stored profileJson (user-initiated).
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { projectSignalsFromProfileJson } from "@/lib/persona-research/project-signals";

export async function projectPersonaSignalsFromProfile(input: {
  organizationId: string;
  personaId: string;
}): Promise<number> {
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      archivedAt: null,
    },
  });
  if (!persona) {
    throw new TenantError("Persona not found in the active organization.");
  }
  if (!persona.profileJson) {
    return 0;
  }

  const existing = await prisma.personaCriterion.findMany({
    where: { organizationId: input.organizationId, personaId: persona.id },
    select: { name: true, criterionType: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });

  const toInsert = projectSignalsFromProfileJson(
    persona.profileJson,
    existing,
  );
  if (toInsert.length === 0) return 0;

  const baseSort =
    existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

  for (const [offset, row] of toInsert.entries()) {
    await prisma.personaCriterion.create({
      data: {
        organizationId: input.organizationId,
        personaId: persona.id,
        name: row.name,
        description: row.description,
        criterionType: row.criterionType,
        dataType: "TEXT",
        operator: row.operator,
        importance: row.importance,
        isRequired: row.isRequired,
        isDisqualifier: row.isDisqualifier,
        researchGuidance: row.researchGuidance,
        source: row.source,
        sortOrder: baseSort + offset,
        manuallyEdited: false,
      },
    });
  }

  return toInsert.length;
}
