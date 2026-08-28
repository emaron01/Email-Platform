import { spawnSync } from "node:child_process";

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/**
 * Render web pre-deploy: safety check then migrate deploy.
 * The research background worker never runs migrations — only this path does.
 */
run("node", ["scripts/db-safety-check.mjs"]);
run("npx", ["prisma", "migrate", "deploy"]);
