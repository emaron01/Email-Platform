import Link from "next/link";
import type {
  HomeSetupStep,
  HomeSetupStepKey,
} from "@/lib/workflow/home-setup-rail";

export function HomeSetupRail({
  steps,
  focusKey,
}: {
  steps: HomeSetupStep[];
  focusKey: HomeSetupStepKey;
}) {
  return (
    <nav
      aria-label="Setup"
      className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2"
    >
      <ol className="flex min-w-max items-center gap-1">
        {steps.map((step) => {
          const focused = focusKey === step.key;
          return (
            <li key={step.key}>
              <Link
                href={step.href}
                aria-current={focused ? "step" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  focused
                    ? "bg-slate-100 text-slate-950"
                    : step.completed
                      ? "text-slate-700 hover:bg-slate-50"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step.completed
                      ? "bg-emerald-600 text-white"
                      : focused
                        ? "bg-slate-900 text-white"
                        : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {step.completed ? "✓" : step.number}
                </span>
                <span className="flex min-w-0 flex-col items-start gap-0.5">
                  <span>{step.label}</span>
                  <span
                    className={`text-xs font-normal ${
                      focused ? "text-slate-600" : "text-slate-500"
                    }`}
                  >
                    {step.detail}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
