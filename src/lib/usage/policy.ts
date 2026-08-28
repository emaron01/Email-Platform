/**
 * Next.js server-only boundary for usage policy.
 * Workers import `@/lib/usage/policy-service` instead.
 */
import "server-only";

export {
  type EffectiveUsagePolicy,
  type PolicySource,
  type ResearchPolicyResolved,
  ensureUsageAndResearchPolicies,
  getEffectiveUsagePolicy,
  getResearchPolicy,
} from "@/lib/usage/policy-service";

export async function ensureOrganizationPolicies(
  organizationId: string,
): Promise<void> {
  const { ensureUsageAndResearchPolicies } = await import(
    "@/lib/usage/policy-service"
  );
  await ensureUsageAndResearchPolicies(organizationId);
  const { ensureOrganizationCadencePolicy } = await import(
    "@/lib/cadence/defaults"
  );
  await ensureOrganizationCadencePolicy(organizationId);
}
