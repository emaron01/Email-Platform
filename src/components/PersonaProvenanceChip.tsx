"use client";

import { useState } from "react";
import {
  PERSONA_PROVENANCE_LABELS,
  provenanceLabelForClasses,
  type PersonaProvenanceClass,
  type PersonaReviewSource,
} from "@/lib/persona-research/persona-briefing";

export function PersonaProvenanceChip({
  classes,
  sources,
  note,
}: {
  classes: PersonaProvenanceClass[];
  sources?: PersonaReviewSource[];
  note?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (classes.length === 0) return null;

  const label = provenanceLabelForClasses(classes);
  const linkedSources =
    sources?.filter((source) =>
      classes.some(
        (c) =>
          source.provenanceClass === c ||
          (c === "WEB_EVIDENCE" && source.sourceType === "URL") ||
          (c === "CUSTOMER_EVIDENCE" &&
            source.sourceType === "UPLOADED_DOCUMENT"),
      ),
    ) ?? [];

  return (
    <span className="persona-provenance-chip relative ml-1 inline-block align-middle">
      <button
        type="button"
        data-print-hide
        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open ? (
        <span className="absolute left-0 z-10 mt-1 w-72 rounded-md border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-sm">
          <span className="block font-medium text-slate-900">Provenance</span>
          <ul className="mt-1 list-disc pl-4">
            {classes.map((c) => (
              <li key={c}>{PERSONA_PROVENANCE_LABELS[c]}</li>
            ))}
          </ul>
          {note ? (
            <span className="mt-2 block text-slate-500">{note}</span>
          ) : null}
          {linkedSources.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {linkedSources.map((source) => (
                <li key={source.id}>
                  {source.originalUrl ? (
                    <a
                      href={source.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {source.displayName}
                    </a>
                  ) : (
                    source.displayName
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </span>
      ) : null}
      <span className="hidden print:inline text-xs text-slate-500">
        {" "}
        ({classes.map((c) => PERSONA_PROVENANCE_LABELS[c]).join("; ")})
      </span>
    </span>
  );
}
