/**
 * Client-safe campaign readiness for a Product.
 * A product is selectable in New Campaign when approved, has an ICP with
 * criteria rows, and has at least one saved persona.
 */

export type ProductCampaignReadinessInput = {
  approvalStatus: string;
  icps: Array<{ criteria: unknown[] }>;
  personas: unknown[];
};

export type ProductCampaignReadiness = {
  ready: boolean;
  blockers: string[];
  /** Single line for disabled <option> labels. */
  omissionReason: string | null;
};

function hasInterpretedCriteria(icp: { criteria: unknown[] }): boolean {
  return icp.criteria.length > 0;
}

export function getProductCampaignReadiness(
  product: ProductCampaignReadinessInput,
): ProductCampaignReadiness {
  const blockers: string[] = [];

  if (product.approvalStatus !== "APPROVED") {
    if (product.approvalStatus === "NOT_STARTED") {
      blockers.push("Product setup not started");
    } else if (product.approvalStatus === "NEEDS_REVIEW") {
      blockers.push("Product needs review and approval");
    } else if (product.approvalStatus === "DRAFT") {
      blockers.push("Product is still a draft");
    } else {
      blockers.push("Product is not approved");
    }
  }

  const icpsWithCriteria = product.icps.filter(hasInterpretedCriteria);
  if (icpsWithCriteria.length === 0) {
    blockers.push("Needs an ICP with criteria");
  }

  if (product.personas.length === 0) {
    blockers.push("Needs at least one saved persona");
  }

  return {
    ready: blockers.length === 0,
    blockers,
    omissionReason: blockers.length > 0 ? blockers.join("; ") : null,
  };
}

export function formatProductCampaignOmission(
  productName: string,
  readiness: ProductCampaignReadiness,
): string {
  if (readiness.ready || !readiness.omissionReason) return productName;
  return `${productName} — ${readiness.omissionReason}`;
}
