import Link from "next/link";
import {
  formatResearchAllowanceExhausted,
  formatResearchAllowanceSummary,
  formatResearchAllowanceWarning,
  RESEARCH_BILLING_HREF,
  type ActiveResearchedCompanyUsageView,
} from "@/lib/usage/research-allowance";

export function CompanyResearchAllowanceBanner({
  usage,
  compact = false,
}: {
  usage: ActiveResearchedCompanyUsageView;
  compact?: boolean;
}) {
  if (usage.exhausted) {
    return (
      <div
        className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950"
        data-testid="research-allowance-exhausted"
      >
        <p className="font-medium">
          {formatResearchAllowanceSummary(usage)}
        </p>
        {!compact ? (
          <p className="mt-1">{formatResearchAllowanceExhausted(usage.limit)}</p>
        ) : null}
        <p className="mt-2">
          <Link
            href={RESEARCH_BILLING_HREF}
            className="font-medium underline underline-offset-2"
          >
            Buy more in Billing
          </Link>
        </p>
      </div>
    );
  }

  if (usage.warning) {
    return (
      <div
        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        data-testid="research-allowance-warning"
      >
        <p className="font-medium">
          {formatResearchAllowanceSummary(usage)}
        </p>
        {!compact ? (
          <p className="mt-1">
            {formatResearchAllowanceWarning(usage.remaining)}
          </p>
        ) : null}
        <p className="mt-2">
          <Link
            href={RESEARCH_BILLING_HREF}
            className="font-medium underline underline-offset-2"
          >
            Buy more in Billing
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
      data-testid="research-allowance-ok"
    >
      <p className="font-medium">{formatResearchAllowanceSummary(usage)}</p>
      {!compact ? (
        <p className="mt-1 text-slate-600">
          One slot per distinct company with fresh research. Refreshing an
          already-researched company does not use another slot.
        </p>
      ) : null}
    </div>
  );
}
