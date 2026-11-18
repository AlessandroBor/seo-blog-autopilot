"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deletePosts, setPostStatus } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";
import type { BlogPost } from "@/lib/supabase";

type Row = Pick<BlogPost, "id" | "title" | "slug" | "status" | "language" | "keyword" | "created_at" | "published_at" | "noindex">;

export function PostsTable({ posts }: { posts: Row[] }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [pending, start] = useTransition();
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const all = posts.length > 0 && selected.length === posts.length;

  const bulk = (fn: () => Promise<void>) => start(async () => {
    await fn();
    setSelected([]);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={!selected.length || pending} onClick={() => bulk(() => setPostStatus(selected, "published"))}>Publish ({selected.length})</button>
        <button className="btn-ghost" disabled={!selected.length || pending} onClick={() => bulk(() => setPostStatus(selected, "draft"))}>Unpublish</button>
        <button
          className="btn-danger"
          disabled={!selected.length || pending}
          onClick={() => confirm(`Delete ${selected.length} post(s)? This cannot be undone.`) && bulk(() => deletePosts(selected))}
        >
          Delete
        </button>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="p-3"><input type="checkbox" checked={all} onChange={() => setSelected(all ? [] : posts.map((p) => p.id))} /></th>
              <th className="p-3">Title</th>
              <th className="p-3">Keyword</th>
              <th className="p-3">Lang</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-zinc-500">No posts yet.</td></tr>}
            {posts.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-3"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} /></td>
                <td className="p-3">
                  <Link href={`/posts/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                  {p.noindex && <span className="badge ml-2 bg-zinc-200 text-zinc-600">noindex</span>}
                </td>
                <td className="p-3 text-zinc-500">{p.keyword ?? "-"}</td>
                <td className="p-3 uppercase text-zinc-500">{p.language}</td>
                <td className="p-3"><StatusBadge status={p.status} /></td>
                <td className="whitespace-nowrap p-3 text-zinc-500">{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
