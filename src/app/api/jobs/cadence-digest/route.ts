import { NextResponse } from "next/server";
import { runCadenceDigestJob } from "@/lib/cadence/digest";

/**
 * Cron entry point for weekday-morning cadence digests.
 * Schedule via Render cron or similar: POST with Authorization Bearer CRON_SECRET.
 * Example schedule: every 15 minutes on weekdays (covers each user's local window).
 *
 * Test a real send outside the window:
 *   POST /api/jobs/cadence-digest?force=1
 *   Authorization: Bearer $CRON_SECRET
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization")?.trim();
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const force =
    url.searchParams.get("force") === "1" ||
    url.searchParams.get("force") === "true";

  const result = await runCadenceDigestJob({ force });
  return NextResponse.json({ ok: true, ...result });
}
