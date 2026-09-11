/**
 * One-shot migration: replace ad-hoc primary/secondary button class strings
 * with PRIMARY_BUTTON_CLASS / SECONDARY_BUTTON_CLASS (+ cn() for layout extras).
 *
 * Run: npx tsx scripts/migrate-button-classes.ts
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const UI_REL = "components/ui.tsx";

/** Tokens that belong only in the shared button classes (not form fields). */
const PRIMARY_MARKERS = ["bg-slate-900", "font-medium", "text-white"] as const;
const SECONDARY_MARKERS = [
  "border-slate-300",
  "bg-white",
  "font-medium",
] as const;

const LAYOUT_KEEP =
  /^(?:w-full|w-fit|mt-\S+|mb-\S+|ml-\S+|mr-\S+|mx-\S+|my-\S+|sm:col-span-\S+|sm:col-span-\d+|col-span-\S+|flex-1|shrink-0|self-\S+|block|hidden|sm:block|gap-\S+|justify-\S+|items-\S+|min-w-\S+|max-w-\S+|!px-\S+|!py-\S+|!text-\S+|px-\d|px-\d\.\d|py-\d|py-\d\.\d|text-xs|text-sm|text-\[11px\]|underline|decoration-\S+|underline-offset-\S+|shadow-sm|disabled:opacity-60|disabled:opacity-50|disabled:cursor-not-allowed|disabled:border-\S+|disabled:bg-\S+|disabled:text-\S+|disabled:shadow-none)$/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      out.push(...walk(p));
    } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

function hasAll(s: string, markers: readonly string[]): boolean {
  return markers.every((m) => s.includes(m));
}

function isFormFieldClass(s: string): boolean {
  // Inputs/selects/textareas: white bordered fields without button intent.
  if (s.includes("outline-none") || s.includes("focus:ring")) return true;
  if (s.includes("placeholder:")) return true;
  if (s.includes("w-full") && s.includes("text-slate-900") && !s.includes("font-medium"))
    return true;
  if (s.includes("resize-")) return true;
  // Empty / dashed panels
  if (s.includes("border-dashed")) return true;
  // Modal scrims
  if (s.includes("bg-slate-900/")) return true;
  return false;
}

function isChipClass(s: string): boolean {
  return (
    s.includes("research-source-chip") ||
    (s.includes("text-[11px]") && s.includes("underline"))
  );
}

function extractExtras(classStr: string, kind: "primary" | "secondary"): string[] {
  const tokens = classStr.split(/\s+/).filter(Boolean);
  const drop = new Set(
    kind === "primary"
      ? [
          "inline-flex",
          "flex",
          "items-center",
          "justify-center",
          "rounded-md",
          "rounded",
          "bg-slate-900",
          "px-3.5",
          "px-3",
          "px-4",
          "px-2.5",
          "px-2",
          "py-2",
          "py-1.5",
          "py-1",
          "py-0.5",
          "text-sm",
          "text-xs",
          "font-medium",
          "text-white",
          "transition",
          "hover:bg-slate-800",
          "hover:bg-slate-700",
          "cursor-pointer",
          "disabled:cursor-not-allowed",
          "disabled:opacity-50",
          "disabled:opacity-60",
          "disabled:bg-slate-300",
        ]
      : [
          "inline-flex",
          "flex",
          "items-center",
          "justify-center",
          "rounded-md",
          "rounded",
          "border",
          "border-slate-300",
          "bg-white",
          "px-3.5",
          "px-3",
          "px-2",
          "py-2",
          "py-1.5",
          "py-0.5",
          "text-sm",
          "text-xs",
          "text-[11px]",
          "font-medium",
          "text-slate-700",
          "text-slate-800",
          "text-slate-900",
          "transition",
          "hover:bg-slate-50",
          "hover:border-slate-400",
          "hover:text-slate-900",
          "cursor-pointer",
          "shadow-sm",
          "disabled:cursor-not-allowed",
          "disabled:opacity-50",
          "disabled:opacity-60",
          "disabled:shadow-none",
        ],
  );

  const extras: string[] = [];
  for (const t of tokens) {
    if (drop.has(t)) continue;
    // Keep layout / size overrides that differ from default shared class
    if (
      LAYOUT_KEEP.test(t) ||
      t.startsWith("sm:") ||
      t.startsWith("mt-") ||
      t.startsWith("mb-") ||
      t.startsWith("w-") ||
      t.startsWith("min-") ||
      t.startsWith("max-") ||
      t.startsWith("self-") ||
      t.startsWith("col-") ||
      t.startsWith("disabled:") ||
      t.startsWith("hover:") ||
      t.startsWith("!") ||
      t === "underline" ||
      t.startsWith("decoration-") ||
      t.startsWith("underline-offset-")
    ) {
      // Skip hover/disabled that shared class already covers
      if (
        t === "hover:bg-slate-50" ||
        t === "hover:bg-slate-800" ||
        t === "hover:bg-slate-700" ||
        t === "hover:border-slate-400" ||
        t === "hover:text-slate-900" ||
        t === "disabled:opacity-60" ||
        t === "disabled:opacity-50" ||
        t === "disabled:cursor-not-allowed" ||
        t === "disabled:shadow-none"
      ) {
        continue;
      }
      extras.push(t);
    }
  }

  // Preserve non-default sizes as important overrides so they win over shared px/py/text
  const sizeTokens = tokens.filter((t) =>
    /^(px-|py-|text-xs|text-\[11px\])/.test(t),
  );
  const defaultPrimary = ["px-3.5", "py-2", "text-sm"];
  const defaultSecondary = ["px-3.5", "py-2", "text-sm"];
  const defaults = kind === "primary" ? defaultPrimary : defaultSecondary;
  for (const t of sizeTokens) {
    if (defaults.includes(t)) continue;
    if (t.startsWith("px-") || t.startsWith("py-")) {
      const important = t.startsWith("!") ? t : `!${t}`;
      if (!extras.includes(important)) extras.push(important);
    } else if (t === "text-xs" || t === "text-[11px]") {
      const important = `!${t}`;
      if (!extras.includes(important)) extras.push(important);
    }
  }

  return extras;
}

function ensureImports(
  source: string,
  needPrimary: boolean,
  needSecondary: boolean,
  needCn: boolean,
): string {
  let next = source;
  const fromUi = next.match(
    /import\s*\{([^}]*)\}\s*from\s*["']@\/components\/ui["']\s*;?/,
  );
  const names = new Set<string>();
  if (fromUi) {
    for (const part of fromUi[1]!.split(",")) {
      const n = part.trim();
      if (n) names.add(n);
    }
  }
  if (needPrimary) names.add("PRIMARY_BUTTON_CLASS");
  if (needSecondary) names.add("SECONDARY_BUTTON_CLASS");

  if (fromUi) {
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    next = next.replace(
      fromUi[0],
      `import { ${sorted.join(", ")} } from "@/components/ui";`,
    );
  } else if (needPrimary || needSecondary) {
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    const importLine = `import { ${sorted.join(", ")} } from "@/components/ui";\n`;
    // After "use client" / first import block
    if (next.startsWith('"use client"') || next.startsWith("'use client'")) {
      next = next.replace(/^['"]use client['"];\r?\n/, (m) => m + importLine);
    } else {
      next = importLine + next;
    }
  }

  if (needCn && !/from\s*["']@\/lib\/utils["']/.test(next)) {
    const cnImport = `import { cn } from "@/lib/utils";\n`;
    if (/from\s*["']@\/components\/ui["']/.test(next)) {
      next = next.replace(
        /import\s*\{[^}]*\}\s*from\s*["']@\/components\/ui["']\s*;?\r?\n/,
        (m) => m + cnImport,
      );
    } else {
      next = cnImport + next;
    }
  } else if (needCn) {
    const utilsImport = next.match(
      /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/utils["']\s*;?/,
    );
    if (utilsImport && !utilsImport[1]!.includes("cn")) {
      const parts = utilsImport[1]!
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      parts.push("cn");
      next = next.replace(
        utilsImport[0],
        `import { ${parts.sort().join(", ")} } from "@/lib/utils";`,
      );
    }
  }

  return next;
}

function replaceClassLiteral(
  source: string,
  quote: string,
  classStr: string,
  kind: "primary" | "secondary",
): { source: string; usedCn: boolean } | null {
  const extras = extractExtras(classStr, kind);
  const constName =
    kind === "primary" ? "PRIMARY_BUTTON_CLASS" : "SECONDARY_BUTTON_CLASS";
  const literal = `${quote}${classStr}${quote}`;

  // className="..."
  const attrExact = `className=${literal}`;
  if (source.includes(attrExact)) {
    if (extras.length === 0) {
      return {
        source: source.replaceAll(attrExact, `className={${constName}}`),
        usedCn: false,
      };
    }
    const extraLit = extras.map((e) => `"${e}"`).join(", ");
    return {
      source: source.replaceAll(
        attrExact,
        `className={cn(${constName}, ${extraLit})}`,
      ),
      usedCn: true,
    };
  }

  // className={"..."} or className={'...'}
  const braced = `className={${literal}}`;
  if (source.includes(braced)) {
    if (extras.length === 0) {
      return {
        source: source.replaceAll(braced, `className={${constName}}`),
        usedCn: false,
      };
    }
    const extraLit = extras.map((e) => `"${e}"`).join(", ");
    return {
      source: source.replaceAll(
        braced,
        `className={cn(${constName}, ${extraLit})}`,
      ),
      usedCn: true,
    };
  }

  // Ternaries / concatenations: replace the string literal alone
  if (source.includes(literal)) {
    if (extras.length === 0) {
      return {
        source: source.replaceAll(literal, constName),
        usedCn: false,
      };
    }
    // Keep as cn() expression — only safe when the literal is the whole className value
    return null;
  }

  return null;
}

function migrateFile(absPath: string): boolean {
  const rel = relative(join(process.cwd(), "src"), absPath).replace(/\\/g, "/");
  if (rel === UI_REL) return false;
  if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return false;

  let source = readFileSync(absPath, "utf8");
  const original = source;
  let needPrimary = false;
  let needSecondary = false;
  let needCn = false;

  // Find string literals that look like button classes
  const stringRe = /(["'`])((?:\\.|(?!\1).)*)\1/g;
  const candidates: Array<{ quote: string; value: string; kind: "primary" | "secondary" }> =
    [];

  let m: RegExpExecArray | null;
  while ((m = stringRe.exec(source))) {
    const quote = m[1]!;
    const value = m[2]!;
    if (quote === "`" && value.includes("${")) continue; // skip interpolations for now
    if (isFormFieldClass(value)) continue;
    if (isChipClass(value)) {
      // Chips: migrate to secondary with size overrides via important
      if (hasAll(value, SECONDARY_MARKERS)) {
        candidates.push({ quote, value, kind: "secondary" });
      }
      continue;
    }
    if (hasAll(value, PRIMARY_MARKERS) && value.includes("rounded")) {
      candidates.push({ quote, value, kind: "primary" });
    } else if (
      hasAll(value, SECONDARY_MARKERS) &&
      value.includes("rounded") &&
      (value.includes("inline-flex") ||
        value.includes("items-center") ||
        value.includes("justify-center") ||
        /\bpx-\d/.test(value))
    ) {
      candidates.push({ quote, value, kind: "secondary" });
    }
  }

  // Longer strings first to avoid partial collisions
  candidates.sort((a, b) => b.value.length - a.value.length);

  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.value)) continue;
    seen.add(c.value);
    const result = replaceClassLiteral(source, c.quote, c.value, c.kind);
    if (!result) continue;
    source = result.source;
    if (c.kind === "primary") needPrimary = true;
    else needSecondary = true;
    if (result.usedCn) needCn = true;
  }

  // Handle template literals that are pure class strings without interpolation — already covered
  // Handle cn() already wrapping — skip

  // Chip-specific: research-source-chip-button left as secondary migration above

  if (source === original) return false;

  // If file already referenced constants, keep those needs
  if (source.includes("PRIMARY_BUTTON_CLASS")) needPrimary = true;
  if (source.includes("SECONDARY_BUTTON_CLASS")) needSecondary = true;
  if (source.includes("cn(")) needCn = true;

  source = ensureImports(source, needPrimary, needSecondary, needCn);
  writeFileSync(absPath, source, "utf8");
  console.log(`migrated ${rel}`);
  return true;
}

let count = 0;
for (const file of walk(ROOT)) {
  if (migrateFile(file)) count += 1;
}
console.log(`Done. Files changed: ${count}`);
