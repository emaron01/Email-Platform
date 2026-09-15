"use client";

import { useState } from "react";
import { StartFreeTrialButton } from "@/components/billing/StartFreeTrialButton";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import type { CatalogPlanEntry } from "@/lib/billing/billing-catalog";
import { cn } from "@/lib/utils";

const ENTERPRISE_CONTACT = "mailto:erik@salesforecaster.io";

export function PlanSelector({
  plans,
  trialPeriodDays,
  disabledReason,
  priceLabels,
}: {
  plans: CatalogPlanEntry[];
  trialPeriodDays: number | null;
  disabledReason?: string | null;
  priceLabels: Record<string, string | null>;
}) {
  const standard =
    plans.find((p) => p.planCode === "STANDARD" && p.active) ?? null;
  const team = plans.find((p) => p.planCode === "TEAM" && p.active) ?? null;
  const enterprise =
    plans.find((p) => p.planCode === "ENTERPRISE" && p.active) ?? null;

  const [selected, setSelected] = useState<"STANDARD" | "TEAM" | "ENTERPRISE">(
    "STANDARD",
  );
  const [seats, setSeats] = useState(2);

  const selectedPlan =
    selected === "TEAM"
      ? team
      : selected === "ENTERPRISE"
        ? enterprise
        : standard;

  return (
    <div className="space-y-6" data-testid="onboarding-plan-selector">
      <div className="grid gap-3 sm:grid-cols-3">
        {standard ? (
          <PlanCard
            selected={selected === "STANDARD"}
            onSelect={() => setSelected("STANDARD")}
            title={standard.displayName}
            tagline={standard.tagline || "For individual salespeople"}
            priceLabel={priceLabels.STANDARD}
          />
        ) : null}
        {team ? (
          <PlanCard
            selected={selected === "TEAM"}
            onSelect={() => setSelected("TEAM")}
            title={team.displayName}
            tagline={team.tagline || "For teams of 2-10"}
            priceLabel={priceLabels.TEAM}
          />
        ) : null}
        {enterprise ? (
          <PlanCard
            selected={selected === "ENTERPRISE"}
            onSelect={() => setSelected("ENTERPRISE")}
            title={enterprise.displayName}
            tagline={enterprise.tagline || "For larger teams"}
            priceLabel={null}
          />
        ) : null}
      </div>

      {selectedPlan ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-medium text-slate-900">
            {selectedPlan.displayName}
          </h2>
          <p className="text-sm text-slate-600">{selectedPlan.tagline}</p>
          {selectedPlan.featureBullets.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {selectedPlan.featureBullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          {selectedPlan.trialNote ? (
            <p className="text-sm text-slate-600">{selectedPlan.trialNote}</p>
          ) : null}

          {selected === "TEAM" ? (
            <label className="block text-sm text-slate-700">
              Seats (2–10)
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
              >
                {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n} seats
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selected === "ENTERPRISE" ? (
            <a
              href={ENTERPRISE_CONTACT}
              className={cn(PRIMARY_BUTTON_CLASS, "w-full !px-4 !py-3")}
            >
              Contact us
            </a>
          ) : (
            <StartFreeTrialButton
              disabledReason={disabledReason}
              trialPeriodDays={trialPeriodDays}
              planCode={selected}
              seatQuantity={selected === "TEAM" ? seats : 1}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function PlanCard({
  selected,
  onSelect,
  title,
  tagline,
  priceLabel,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  tagline: string;
  priceLabel: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border px-4 py-3 text-left transition ${
        selected
          ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
          : "border-slate-200 bg-white hover:border-slate-400"
      }`}
    >
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-600">{tagline}</p>
      {priceLabel ? (
        <p className="mt-2 text-sm font-medium text-slate-800">{priceLabel}</p>
      ) : null}
    </button>
  );
}
