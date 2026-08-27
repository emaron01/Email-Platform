"use client";

import { SecondaryButton } from "@/components/ui";

/**
 * Opens the browser print dialog — user can save as PDF.
 * No server dependency; print stylesheet hides app chrome and actions.
 */
export function ExportPdfButton({ label = "Export PDF" }: { label?: string }) {
  return (
    <SecondaryButton type="button" onClick={() => window.print()}>
      {label}
    </SecondaryButton>
  );
}
