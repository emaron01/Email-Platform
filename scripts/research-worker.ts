/**
 * Render Background Worker entrypoint for durable ResearchRun batches.
 *
 * Migration ownership: web service runs `npm run render:pre-deploy` before deploy.
 * This process never runs prisma migrate — it waits for the ResearchRun table.
 */
import { waitForResearchRunSchema } from "@/lib/research/schema-readiness";
import {
  abandonStaleResearchRuns,
  claimNextResearchRun,
  processResearchRun,
  researchWorkerShutdown,
} from "@/lib/research/runs-service";

const IDLE_POLL_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let inFlight: Promise<void> | null = null;

process.on("SIGTERM", () => {
  console.log("[research-worker] SIGTERM received — finishing in-flight work, not dequeuing new companies");
  researchWorkerShutdown.requested = true;
});

async function main(): Promise<void> {
  console.log("[research-worker] starting (migrations owned by web pre-deploy)");
  await waitForResearchRunSchema();
  console.log("[research-worker] schema ready");

  while (!researchWorkerShutdown.requested) {
    await abandonStaleResearchRuns();

    const runId = await claimNextResearchRun();
    if (!runId) {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    console.log(`[research-worker] processing run ${runId}`);
    inFlight = processResearchRun(runId);
    await inFlight;
    inFlight = null;
    console.log(`[research-worker] finished run ${runId}`);
  }

  if (inFlight) {
    await inFlight;
  }

  console.log("[research-worker] shutdown complete (active runs left IN_PROGRESS for resume)");
}

main().catch((error) => {
  console.error("[research-worker] fatal error", error);
  process.exit(1);
});
