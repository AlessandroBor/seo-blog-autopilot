import Link from "next/link";
import { LANGUAGES, siteConfig } from "@/config/site.config";
import { db, type QueuedKeyword } from "@/lib/supabase";
import { addKeywords, deleteKeyword, moveKeyword, retryKeyword } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const { data } = await db()
    .from("keyword_queue")
    .select("*")
    .order("status", { ascending: false }) // processing/pending first, done/failed later
    .order("position", { ascending: true });
  const rows = (data ?? []) as QueuedKeyword[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Keyword queue</h1>

      <form action={addKeywords} className="card space-y-3">
        <label className="block text-sm font-medium">Add keywords (one per line)</label>
        <textarea name="keywords" rows={4} className="input font-mono" placeholder={"best running shoes for flat feet\nhow to clean suede shoes"} />
        <div className="flex items-center gap-3">
          <select name="language" defaultValue={siteConfig.defaultLanguage} className="input w-auto">
            {Object.entries(LANGUAGES).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
          <button className="btn-primary">Add to queue</button>
        </div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="p-3">Keyword</th>
              <th className="p-3">Lang</th>
              <th className="p-3">Status</th>
              <th className="p-3">Result</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-zinc-500">Queue is empty.</td></tr>
            )}
            {rows.map((k) => (
              <tr key={k.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{k.keyword}</td>
                <td className="p-3 uppercase text-zinc-500">{k.language}</td>
                <td className="p-3"><StatusBadge status={k.status} /></td>
                <td className="max-w-xs truncate p-3 text-zinc-500" title={k.last_error ?? ""}>
                  {k.post_id ? <Link className="underline" href={`/posts/${k.post_id}`}>Post #{k.post_id}</Link> : k.last_error ?? "-"}
                </td>
                <td className="space-x-1 whitespace-nowrap p-3 text-right">
                  {k.status === "pending" && (
                    <>
                      <form action={moveKeyword.bind(null, k.id, "up")} className="inline"><button className="btn-ghost px-2 py-1" title="Move up">↑</button></form>
                      <form action={moveKeyword.bind(null, k.id, "down")} className="inline"><button className="btn-ghost px-2 py-1" title="Move down">↓</button></form>
                    </>
                  )}
                  {k.status === "failed" && (
                    <form action={retryKeyword.bind(null, k.id)} className="inline"><button className="btn-ghost px-2 py-1">Retry</button></form>
                  )}
                  <form action={deleteKeyword.bind(null, k.id)} className="inline"><button className="btn-danger px-2 py-1">Delete</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
