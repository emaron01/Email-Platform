import "server-only";

import sanitizeHtml from "sanitize-html";
import type { TransactionalEmailTemplateKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  BASELINE_TEMPLATES,
  TEMPLATE_REQUIRED_VARIABLES,
  TEMPLATE_VARIABLE_ALLOWLIST,
  type TemplateVariableMap,
} from "@/lib/transactional-email/templates";

export class TemplateRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateRenderError";
  }
}

const VAR_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

function extractVars(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(VAR_RE)) {
    found.add(match[1]!);
  }
  return [...found];
}

function renderString(
  template: string,
  variables: TemplateVariableMap,
  allowlist: readonly string[],
): string {
  const used = extractVars(template);
  for (const key of used) {
    if (!allowlist.includes(key)) {
      throw new TemplateRenderError(
        `Unknown or disallowed template variable: ${key}`,
      );
    }
    if (!(key in variables)) {
      throw new TemplateRenderError(`Missing template variable: ${key}`);
    }
  }
  return template.replace(VAR_RE, (_, key: string) => {
    const value = variables[key] ?? "";
    return value;
  });
}

function sanitizeTemplateHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  });
}

export type RenderedTransactionalEmail = {
  templateKey: TransactionalEmailTemplateKey;
  templateVersion: number | null;
  subject: string;
  html: string;
  text: string;
  fromBaseline: boolean;
};

/**
 * Loads editable template when enabled; otherwise falls back to immutable baseline.
 * SUPER_ADMIN cannot leave auth flows without a recoverable template.
 */
export async function renderTransactionalTemplate(input: {
  templateKey: TransactionalEmailTemplateKey;
  variables: TemplateVariableMap;
}): Promise<RenderedTransactionalEmail> {
  const allowlist = TEMPLATE_VARIABLE_ALLOWLIST[input.templateKey];
  const required = TEMPLATE_REQUIRED_VARIABLES[input.templateKey];

  for (const key of required) {
    if (!input.variables[key]?.trim()) {
      throw new TemplateRenderError(`Required variable missing: ${key}`);
    }
  }

  for (const key of Object.keys(input.variables)) {
    if (!allowlist.includes(key)) {
      throw new TemplateRenderError(
        `Variable not allowlisted for ${input.templateKey}: ${key}`,
      );
    }
  }

  const editable = await prisma.transactionalEmailTemplate.findUnique({
    where: { templateKey: input.templateKey },
  });

  let subjectTemplate: string;
  let htmlTemplate: string;
  let textTemplate: string;
  let templateVersion: number | null = null;
  let fromBaseline = false;

  if (editable?.enabled) {
    subjectTemplate = editable.subjectTemplate;
    htmlTemplate = editable.htmlTemplate;
    textTemplate = editable.textTemplate;
    templateVersion = editable.version;
  } else {
    const baseline =
      (await prisma.transactionalEmailTemplateBaseline.findUnique({
        where: { templateKey: input.templateKey },
      })) ?? null;
    const fallback = BASELINE_TEMPLATES[input.templateKey];
    subjectTemplate = baseline?.subjectTemplate ?? fallback.subjectTemplate;
    htmlTemplate = baseline?.htmlTemplate ?? fallback.htmlTemplate;
    textTemplate = baseline?.textTemplate ?? fallback.textTemplate;
    fromBaseline = true;
  }

  const subject = renderString(subjectTemplate, input.variables, allowlist);
  const text = renderString(textTemplate, input.variables, allowlist);
  const htmlRaw = renderString(htmlTemplate, input.variables, allowlist);
  const html = sanitizeTemplateHtml(htmlRaw);

  return {
    templateKey: input.templateKey,
    templateVersion,
    subject,
    html,
    text,
    fromBaseline,
  };
}

export function validateTemplateContent(input: {
  templateKey: TransactionalEmailTemplateKey;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
}): void {
  const allowlist = TEMPLATE_VARIABLE_ALLOWLIST[input.templateKey];
  for (const part of [
    input.subjectTemplate,
    input.htmlTemplate,
    input.textTemplate,
  ]) {
    for (const key of extractVars(part)) {
      if (!allowlist.includes(key)) {
        throw new TemplateRenderError(`Disallowed variable: ${key}`);
      }
    }
  }
  // Reject obvious script injection in stored HTML templates.
  if (/<script[\s>]/i.test(input.htmlTemplate) || /on\w+\s*=/i.test(input.htmlTemplate)) {
    throw new TemplateRenderError(
      "HTML template contains unsafe script or event handlers.",
    );
  }
}
