import Link from "next/link";

/**
 * Plain-language next action for a campaign stage (Home setup rail pattern).
 */
export function CampaignStageNextStep({
  title,
  body,
  href,
  label,
}: {
  title: string;
  body: string;
  href: string;
  label: string;
}) {
  const className =
    "mt-3 inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800";
  const isHash = href.startsWith("#");

  return (
    <div
      className="rounded-md border border-slate-300 bg-slate-50 px-4 py-3"
      data-testid="campaign-stage-next-step"
    >
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
      {isHash ? (
        <a href={href} className={className}>
          {label}
        </a>
      ) : (
        <Link href={href} className={className}>
          {label}
        </Link>
      )}
    </div>
  );
}
