import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS, so it must only ever run on the server.
 * (Not marked "server-only" because the CLI script in scripts/ also uses it;
 * SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix, so it can't leak into
 * a browser bundle anyway.)
 */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export type PostStatus = "draft" | "published" | "draft_error";

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  content: string | null;
  meta_description: string | null;
  status: PostStatus;
  language: string;
  featured_image: string | null;
  categories: number[] | null;
  tip: string | null;
  noindex: boolean;
  source: string;
  keyword: string | null;
  created_at: string;
  published_at: string | null;
  last_modified: string;
}

export interface BlogCategory {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
}

export interface QueuedKeyword {
  id: number;
  keyword: string;
  language: string;
  position: number;
  status: "pending" | "processing" | "done" | "failed";
  attempts: number;
  last_error: string | null;
  post_id: number | null;
  created_at: string;
  processed_at: string | null;
}
