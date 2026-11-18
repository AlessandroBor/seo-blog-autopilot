import { LANGUAGES, siteConfig, type Language } from "@/config/site.config";
import { db, type QueuedKeyword } from "@/lib/supabase";
import { generatePostFromKeyword } from "./pipeline";

export interface QueueRunResult {
  keyword: string;
  ok: boolean;
  postId?: number;
  status?: string;
  error?: string;
}

/**
 * Claims the next pending keyword(s) and turns each into a post.
 * Safe to call concurrently: claiming is atomic in Postgres (see claim_next_keyword).
 */
export async function processQueue(limit = siteConfig.keywordsPerCronRun): Promise<QueueRunResult[]> {
  const results: QueueRunResult[] = [];
  const autoPublish = process.env.AUTO_PUBLISH === "true";

  for (let i = 0; i < limit; i++) {
    const { data, error } = await db().rpc("claim_next_keyword", {
      max_attempts: siteConfig.maxKeywordAttempts,
    });
    if (error) throw error;
    const job = (data as QueuedKeyword[] | null)?.[0];
    if (!job) break; // queue empty

    const language = (job.language in LANGUAGES ? job.language : siteConfig.defaultLanguage) as Language;
    try {
      const post = await generatePostFromKeyword(job.keyword, language, { publish: autoPublish });
      await db()
        .from("keyword_queue")
        .update({ status: "done", post_id: post.id, processed_at: new Date().toISOString(), last_error: null })
        .eq("id", job.id);
      results.push({ keyword: job.keyword, ok: true, postId: post.id, status: post.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[queue] "${job.keyword}" failed (attempt ${job.attempts}):`, err);
      // Back to pending for a retry next run, or parked as failed after max attempts.
      await db()
        .from("keyword_queue")
        .update({
          status: job.attempts >= siteConfig.maxKeywordAttempts ? "failed" : "pending",
          last_error: message.slice(0, 1000),
        })
        .eq("id", job.id);
      results.push({ keyword: job.keyword, ok: false, error: message });
    }
  }
  return results;
}
