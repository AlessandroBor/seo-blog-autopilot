import { NextResponse } from "next/server";
import { processQueue } from "@/lib/engine/queue";

export const maxDuration = 300;

/** "Run next keyword now" button in the admin (session-protected by proxy.ts). */
export async function POST() {
  try {
    const results = await processQueue(1);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
