"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Result {
  keyword: string;
  ok: boolean;
  postId?: number;
  status?: string;
  error?: string;
}

/** Processes the next queued keyword right now instead of waiting for the cron. */
export function RunNowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage("Researching, writing and illustrating... this takes 1-3 minutes.");
    const res = await fetch("/api/queue/run", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { results?: Result[]; error?: string };
    const r = body.results?.[0];
    if (!res.ok) setMessage(`Error: ${body.error ?? res.status}`);
    else if (!r) setMessage("The queue is empty. Add keywords first.");
    else if (r.ok) setMessage(`Done: "${r.keyword}" saved as ${r.status} (post #${r.postId}).`);
    else setMessage(`"${r.keyword}" failed: ${r.error}`);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button className="btn-primary" onClick={run} disabled={busy}>
        {busy ? "Generating..." : "Run next keyword now"}
      </button>
      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </div>
  );
}
