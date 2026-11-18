import { NextResponse } from "next/server";
import { isValidCronRequest } from "@/lib/auth";
import { processQueue } from "@/lib/engine/queue";

// One article takes ~1-3 minutes (SERP scraping + ~10 LLM calls + images).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Called by Vercel Cron (see vercel.json). Generates the next queued keyword. */
export async function GET(req: Request) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await processQueue();
    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    console.error("[cron] process-queue crashed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
