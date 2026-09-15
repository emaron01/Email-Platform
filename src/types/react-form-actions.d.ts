import "react";

/**
 * Widen React <form action> / formAction so server actions may return a
 * typed result (e.g. CampaignActionResult) instead of only void.
 * Uses React's FormHTMLAttributes extension slot — no per-call wrappers.
 */
declare module "react" {
  interface DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_FORM_ACTIONS {
    resultReturningServerAction: (
      formData: FormData,
    ) => void | Promise<unknown>;
  }
}

export {};
