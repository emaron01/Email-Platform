"use client";

import { useState, type ReactNode } from "react";
import type { ResearchSource } from "@/lib/research/types";
import { sourceLabelForCompany } from "@/lib/research/company-briefing";

export function ResearchReadSection({
  title,
  children,
  empty,
}: {
  title: string;
  children: ReactNode;
  empty: boolean;
}) {
  return (
    <section className="research-read-section space-y-2">
      <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </h3>
      {empty ? (
        <p className="text-sm text-slate-500">None recorded from the material.</p>
      ) : (
        children
      )}
    </section>
  );
}

export function ResearchSourceChip({
  sources,
}: {
  sources: ResearchSource[];
}) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  const first = sources[0]!;
  const label = sourceLabelForCompany(first);

  return (
    <span className="research-source-chip relative ml-1 inline-block align-middle">
      <button
        type="button"
        data-print-hide
        className="research-source-chip-button rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        {sources.length > 1 ? ` +${sources.length - 1}` : ""}
      </button>
      <span
        className={`research-source-chip-popup ${
          open ? "" : "hidden"
        } absolute left-0 z-10 mt-1 w-72 rounded-md border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-sm print:!static print:!mt-2 print:!block print:!w-auto print:!border-0 print:!p-0 print:!shadow-none`}
      >
        {sources.map((source, index) => (
          <span key={source.url} className="block">
            {index > 0 ? (
              <span className="my-2 block border-t border-slate-100 print:my-1" />
            ) : null}
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-slate-900 underline"
            >
              {source.title?.trim() || source.url}
            </a>
            <span className="mt-1 block text-slate-500">
              {source.sourceType}
              {source.publisher ? ` · ${source.publisher}` : ""}
            </span>
            <span className="mt-0.5 block break-all text-slate-500">
              {source.url}
            </span>
          </span>
        ))}
      </span>
      <span className="hidden print:inline text-xs text-slate-500">
        {" "}
        (
        {sources
          .map((source) => source.title?.trim() || source.url)
          .join("; ")}
        )
      </span>
    </span>
  );
}

export function ResearchListItem({
  text,
  sources,
}: {
  text: string;
  sources: ResearchSource[];
}) {
  return (
    <li className="leading-relaxed text-slate-800">
      {text}
      <ResearchSourceChip sources={sources} />
    </li>
  );
}

export function ResearchProse({
  text,
  sources,
}: {
  text: string;
  sources: ResearchSource[];
}) {
  return (
    <p className="text-[17px] leading-7 text-slate-800">
      {text}
      <ResearchSourceChip sources={sources} />
    </p>
  );
}

export function ResearchSourcesAppendix({
  title = "Sources",
  sources,
}: {
  title?: string;
  sources: ResearchSource[];
}) {
  if (sources.length === 0) return null;
  return (
    <section className="research-sources-appendix mt-8 border-t border-slate-200 pt-6 print:break-before-page">
      <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </h3>
      <ul className="mt-3 space-y-3 text-sm text-slate-700">
        {sources.map((source) => (
          <li key={source.url}>
            <p className="font-medium text-slate-900">
              {source.title?.trim() || source.url}
            </p>
            <p className="text-xs text-slate-500">
              {source.sourceType}
              {source.publisher ? ` · ${source.publisher}` : ""}
              {source.retrievedAt
                ? ` · Retrieved ${source.retrievedAt.slice(0, 10)}`
                : ""}
            </p>
            <p className="break-all text-xs text-slate-600">{source.url}</p>
            {source.supports.length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                Supports: {source.supports.join(", ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
