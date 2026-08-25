import { isSecondaryIcpCriterion } from "@/lib/scoring/icp-qualification";
import type {
  IcpSnapshot,
  PersonaSnapshot,
  ProductSnapshot,
} from "@/lib/scoring/types";
import {
  COMPANY_DIMENSIONS,
  ICP_DIMENSIONS,
  PERSONA_DIMENSIONS,
  PRODUCT_DIMENSIONS,
  type ScoringComponent,
} from "@/lib/scoring/config";

export type ApplicableDimension = {
  component: ScoringComponent;
  dimension: string;
};

function hasList(value: string[] | null | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

function icpDimensionName(name: string): string {
  return name.trim() || "ICP Criterion";
}

function personaHasResponsibilityCriteria(persona: PersonaSnapshot): boolean {
  return (persona.criteria ?? []).some((c) => {
    const type = c.criterionType.toLowerCase();
    return (
      type.includes("responsib") ||
      type.includes("ownership") ||
      type.includes("own")
    );
  });
}

function addUniqueDimension(
  dims: ApplicableDimension[],
  component: ScoringComponent,
  dimension: string,
): void {
  if (
    dims.some((d) => d.component === component && d.dimension === dimension)
  ) {
    return;
  }
  dims.push({ component, dimension });
}

/**
 * Only evaluate dimensions supported by ICP/Persona/Product configuration.
 * Blank ICP criteria are omitted (not penalized).
 */
export function getApplicableDimensions(input: {
  icp: IcpSnapshot;
  persona: PersonaSnapshot;
  product: ProductSnapshot;
}): ApplicableDimension[] {
  const dims: ApplicableDimension[] = [];

  if (input.icp.criteria?.length) {
    for (const criterion of input.icp.criteria) {
      if (isSecondaryIcpCriterion(criterion)) continue;
      addUniqueDimension(dims, "ICP", icpDimensionName(criterion.name));
    }
  } else {
    if (hasList(input.icp.targetIndustries)) {
      dims.push({ component: "ICP", dimension: ICP_DIMENSIONS[0] });
    }
    if (input.icp.minEmployees != null || input.icp.maxEmployees != null) {
      dims.push({ component: "ICP", dimension: ICP_DIMENSIONS[1] });
    }
    if (input.icp.minRevenue != null || input.icp.maxRevenue != null) {
      dims.push({ component: "ICP", dimension: ICP_DIMENSIONS[2] });
    }
    if (hasList(input.icp.targetGeographies)) {
      dims.push({ component: "ICP", dimension: ICP_DIMENSIONS[3] });
    }
    if (hasList(input.icp.requiredTechnologies)) {
      dims.push({ component: "ICP", dimension: ICP_DIMENSIONS[4] });
    }
    if (hasList(input.icp.positiveSignals)) {
      dims.push({ component: "ICP", dimension: ICP_DIMENSIONS[5] });
    }
    if (hasList(input.icp.negativeSignals)) {
      dims.push({ component: "ICP", dimension: ICP_DIMENSIONS[6] });
    }
  }

  if (input.persona.criteria?.length) {
    for (const criterion of input.persona.criteria) {
      if (
        criterion.isDisqualifier ||
        criterion.criterionType.trim().toLowerCase() === "needs_review"
      ) {
        // Exclusions are resolved separately and never averaged as persona fit.
        // Unmapped AI types are excluded until classified.
        continue;
      }
      addUniqueDimension(dims, "PERSONA", icpDimensionName(criterion.name));
    }

    if (personaHasResponsibilityCriteria(input.persona)) {
      addUniqueDimension(dims, "PERSONA", "Title Match");
      addUniqueDimension(dims, "PERSONA", "Role / Responsibility Match");
    }
  } else {
    if (hasList(input.persona.targetTitles)) {
      dims.push({ component: "PERSONA", dimension: PERSONA_DIMENSIONS[0] });
    }
    if (hasText(input.persona.seniority)) {
      dims.push({ component: "PERSONA", dimension: PERSONA_DIMENSIONS[1] });
    }
    if (hasText(input.persona.department)) {
      dims.push({ component: "PERSONA", dimension: PERSONA_DIMENSIONS[2] });
    }
    if (hasText(input.persona.responsibilities)) {
      dims.push({ component: "PERSONA", dimension: PERSONA_DIMENSIONS[3] });
    }
    if (hasText(input.persona.painPoints)) {
      dims.push({ component: "PERSONA", dimension: PERSONA_DIMENSIONS[4] });
    }
    if (hasText(input.persona.desiredOutcomes)) {
      dims.push({ component: "PERSONA", dimension: PERSONA_DIMENSIONS[5] });
    }
  }

  for (const dimension of COMPANY_DIMENSIONS) {
    dims.push({ component: "COMPANY", dimension });
  }

  if (
    hasText(input.product.description) ||
    hasText(input.product.valueProposition)
  ) {
    dims.push({ component: "PRODUCT", dimension: PRODUCT_DIMENSIONS[0] });
  }
  if (
    hasText(input.persona.painPoints) ||
    hasText(input.persona.desiredOutcomes)
  ) {
    dims.push({ component: "PRODUCT", dimension: PRODUCT_DIMENSIONS[1] });
  }

  return dims;
}
