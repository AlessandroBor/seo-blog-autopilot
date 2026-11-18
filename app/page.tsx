import Link from "next/link";
import { db } from "@/lib/supabase";
import { RunNowButton } from "@/components/RunNowButton";

export const dynamic = "force-dynamic";

async function count(table: string, column: string, value: string) {
  const { count } = await db().from(table).select("id", { count: "exact", head: true }).eq(column, value);
  return count ?? 0;
}

export default async function Dashboard() {
  const [pending, failed, drafts, published] = await Promise.all([
    count("keyword_queue", "status", "pending"),
    count("keyword_queue", "status", "failed"),
    count("blog_posts", "status", "draft"),
    count("blog_posts", "status", "published"),
  ]);

  const stats = [
    { label: "Keywords waiting", value: pending, href: "/keywords" },
    { label: "Keywords failed", value: failed, href: "/keywords" },
    { label: "Drafts to review", value: drafts, href: "/posts?status=draft" },
    { label: "Published posts", value: published, href: "/posts?status=published" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card hover:border-zinc-400">
            <div className="text-3xl font-semibold">{s.value}</div>
            <div className="text-sm text-zinc-500">{s.label}</div>
          </Link>
        ))}
      </div>
      <div className="card space-y-3">
        <h2 className="font-medium">Autopilot</h2>
        <p className="text-sm text-zinc-600">
          The cron in <code>vercel.json</code> turns the next queued keyword into a post on schedule.
          Auto-publish is <strong>{process.env.AUTO_PUBLISH === "true" ? "ON" : "OFF"}</strong>
          {process.env.AUTO_PUBLISH === "true"
            ? " (posts that pass the quality gate go live)."
            : " (every post lands as a draft for review)."}
        </p>
        <RunNowButton />
      </div>
    </div>
  );
}
