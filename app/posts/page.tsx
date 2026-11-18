import Link from "next/link";
import { db, type BlogPost } from "@/lib/supabase";
import { PostsTable } from "./PostsTable";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "draft", "published", "draft_error"] as const;

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "all" } = await searchParams;
  let q = db()
    .from("blog_posts")
    .select("id, title, slug, status, language, keyword, created_at, published_at, noindex")
    .order("created_at", { ascending: false })
    .limit(500);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Posts</h1>
        <div className="flex gap-2 text-sm">
          {FILTERS.map((f) => (
            <Link key={f} href={f === "all" ? "/posts" : `/posts?status=${f}`} className={status === f ? "btn-primary" : "btn-ghost"}>
              {f.replace("_", " ")}
            </Link>
          ))}
        </div>
      </div>
      <PostsTable posts={(data ?? []) as Pick<BlogPost, "id" | "title" | "slug" | "status" | "language" | "keyword" | "created_at" | "published_at" | "noindex">[]} />
    </div>
  );
}
