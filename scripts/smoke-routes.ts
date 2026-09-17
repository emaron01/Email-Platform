/**
 * Full route smoke suite — production build + test DB only.
 *
 * Usage: npm run build && npm run test:smoke
 */
import {
  printSmokeReport,
  runSmokeSuite,
} from "@/test/smoke/run-smoke-suite";

async function main() {
  const report = await runSmokeSuite();
  printSmokeReport(report);
  process.exit(report.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
