import type { ReactNode } from "react";
import { CampaignStageNextStep } from "@/components/CampaignStageNextStep";

type NextStep = {
  title: string;
  body: string;
  href: string;
  label: string;
};

/**
 * Renders next-step guidance above and below stage content so it is visible
 * both on first paint and after scrolling the form.
 */
export function CampaignStageShell({
  next,
  children,
}: {
  next: NextStep | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {next ? <CampaignStageNextStep {...next} /> : null}
      {children}
      {next ? <CampaignStageNextStep {...next} /> : null}
    </div>
  );
}
