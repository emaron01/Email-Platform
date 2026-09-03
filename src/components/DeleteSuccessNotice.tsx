"use client";

import { useEffect, useState } from "react";

export const DELETE_SUCCESS_NOTICE_KEY = "delete-success-notice";
export const DELETE_SUCCESS_NOTICE_EVENT = "delete-success-notice";

/**
 * One-shot banner after ConfirmDeleteForm leaves a deleted record.
 * Cross-route: message is in sessionStorage before replace().
 * Same-route (e.g. product delete on /products): custom event + refresh.
 */
export function DeleteSuccessNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const show = (text: string) => setMessage(text);

    try {
      const stored = sessionStorage.getItem(DELETE_SUCCESS_NOTICE_KEY);
      if (stored) {
        sessionStorage.removeItem(DELETE_SUCCESS_NOTICE_KEY);
        show(stored);
      }
    } catch {
      // sessionStorage may be unavailable
    }

    const onNotice = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail) {
        try {
          sessionStorage.removeItem(DELETE_SUCCESS_NOTICE_KEY);
        } catch {
          // ignore
        }
        show(detail);
      }
    };

    window.addEventListener(DELETE_SUCCESS_NOTICE_EVENT, onNotice);
    return () => window.removeEventListener(DELETE_SUCCESS_NOTICE_EVENT, onNotice);
  }, []);

  if (!message) return null;

  return (
    <p
      role="status"
      data-testid="delete-success-notice"
      className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
    >
      {message}
    </p>
  );
}
