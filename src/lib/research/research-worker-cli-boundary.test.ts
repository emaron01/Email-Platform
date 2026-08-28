/**
 * Asserts the research worker import graph is free of `server-only` and loads
 * under plain Node/tsx (without Vitest's server-only stub).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());

const CLI_ENTRY = "scripts/research-worker.ts";
const SERVICE_ENTRY = "src/lib/research/runs-service.ts";

const SERVER_ONLY_BOUNDARIES = [
  "src/lib/research/runs.ts",
  "src/lib/prisma.ts",
  "src/lib/tenant/companies.ts",
  "src/lib/usage/quota.ts",
  "src/lib/usage/policy.ts",
  "src/lib/usage/events.ts",
  "src/lib/usage/active-companies.ts",
];

function collectLocalImports(entryRelative: string): Set<string> {
  const visited = new Set<string>();
  const queue = [entryRelative.replace(/\\/g, "/")];

  while (queue.length > 0) {
    const rel = queue.pop()!;
    if (visited.has(rel)) continue;
    visited.add(rel);
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const source = readFileSync(abs, "utf8");
    const importRe =
      /(?:import|export)\s+(?:type\s+)?(?:[^"'`]*from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(source))) {
      const spec = match[1] || match[2];
      if (!spec) continue;
      if (spec === "server-only") {
        throw new Error(
          `Worker import graph includes server-only via ${rel}`,
        );
      }
      let next: string | null = null;
      if (spec.startsWith("@/")) {
        next = `src/${spec.slice(2)}.ts`;
        if (!existsSync(join(ROOT, next))) {
          const asIndex = `src/${spec.slice(2)}/index.ts`;
          if (existsSync(join(ROOT, asIndex))) next = asIndex;
        }
      } else if (spec.startsWith(".")) {
        const base = resolve(dirname(abs), spec);
        const candidates = [
          `${base}.ts`,
          `${base}.tsx`,
          join(base, "index.ts"),
        ];
        const hit = candidates.find((c) => existsSync(c));
        if (hit) {
          next = hit.slice(ROOT.length + 1).replace(/\\/g, "/");
        }
      }
      if (next && next.startsWith("src/") && !visited.has(next)) {
        queue.push(next);
      }
    }
  }
  return visited;
}

describe("research worker CLI Node boundary", () => {
  it("worker service import graph contains no server-only and avoids Next wrappers", () => {
    const graph = collectLocalImports(SERVICE_ENTRY);
    expect(graph.has(SERVICE_ENTRY)).toBe(true);
    expect(graph.has("src/lib/prisma-client.ts")).toBe(true);
    expect(graph.has("src/lib/tenant/company-research-service.ts")).toBe(true);

    for (const boundary of SERVER_ONLY_BOUNDARIES) {
      expect(graph.has(boundary)).toBe(false);
    }

    for (const boundary of SERVER_ONLY_BOUNDARIES) {
      const abs = join(ROOT, boundary);
      expect(existsSync(abs)).toBe(true);
      expect(readFileSync(abs, "utf8")).toMatch(/import ["']server-only["']/);
    }
  });

  it("plain tsx can load the Node-safe worker service without server-only errors", () => {
    const probe = `
import { HEARTBEAT_STALE_MS, researchWorkerShutdown } from "./src/lib/research/runs-service.ts";
console.log("WORKER_SERVICE_OK", HEARTBEAT_STALE_MS, researchWorkerShutdown.requested);
`;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "-e", probe],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: process.env,
        timeout: 60_000,
      },
    );

    if (result.status !== 0) {
      const fallback = spawnSync(
        "npx",
        ["tsx", "-e", probe],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: process.env,
          timeout: 60_000,
          shell: true,
        },
      );
      expect(fallback.stderr || "").not.toMatch(/server-only/i);
      expect(fallback.stdout || "").toContain("WORKER_SERVICE_OK");
      expect(fallback.status).toBe(0);
      return;
    }

    expect(result.stderr || "").not.toMatch(/server-only/i);
    expect(result.stdout || "").toContain("WORKER_SERVICE_OK");
    expect(result.status).toBe(0);
  });

  it("worker script source imports the service, not the server-only wrapper", () => {
    const script = readFileSync(join(ROOT, CLI_ENTRY), "utf8");
    expect(script).toContain("runs-service");
    expect(script).not.toMatch(/from ["']@\/lib\/research\/runs["']/);
  });
});
