"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LANGUAGES, siteConfig } from "@/config/site.config";
import { savePost, setPostStatus, type PostInput } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";
import type { BlogCategory, BlogPost } from "@/lib/supabase";

export function PostEditor({ post, categories }: { post: BlogPost; categories: BlogCategory[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [form, setForm] = useState<PostInput>({
    title: post.title,
    slug: post.slug,
    meta_description: post.meta_description ?? "",
    content: post.content ?? "",
    featured_image: post.featured_image ?? "",
    tip: post.tip ?? "",
    categories: post.categories ?? [],
    noindex: post.noindex,
    language: post.language,
  });
  const set = <K extends keyof PostInput>(k: K, v: PostInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = (thenStatus?: "published" | "draft") =>
    start(async () => {
      const { error } = await savePost(post.id, form);
      if (error) return setMessage(error);
      if (thenStatus) await setPostStatus([post.id], thenStatus);
      setMessage(thenStatus === "published" ? "Saved and published." : thenStatus === "draft" ? "Saved and unpublished." : "Saved.");
      router.refresh();
    });

  const titleLen = form.title.length;
  const descLen = form.meta_description.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Edit post</h1>
          <StatusBadge status={post.status} />
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={pending} onClick={() => save()}>Save</button>
          {post.status === "published" ? (
            <button className="btn-ghost" disabled={pending} onClick={() => save("draft")}>Unpublish</button>
          ) : (
            <button className="btn-primary" disabled={pending} onClick={() => save("published")}>Save &amp; publish</button>
          )}
        </div>
      </div>
      {message && <p className="text-sm text-zinc-600">{message}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <div className="card space-y-3">
            <Field label={`Title (${titleLen}/${siteConfig.maxTitleLength})`} warn={titleLen > siteConfig.maxTitleLength}>
              <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label={`Meta description (${descLen} chars, aim for 140-160)`} warn={descLen < 70 || descLen > 170}>
              <textarea className="input" rows={2} value={form.meta_description} onChange={(e) => set("meta_description", e.target.value)} />
            </Field>
          </div>

          <div className="card space-y-3">
            <div className="flex gap-2">
              <button className={tab === "write" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("write")}>Markdown</button>
              <button className={tab === "preview" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("preview")}>Preview</button>
            </div>
            {tab === "write" ? (
              <textarea className="input min-h-[60vh] font-mono text-xs" value={form.content} onChange={(e) => set("content", e.target.value)} />
            ) : (
              <article className="prose max-w-none">
                <h1>{form.title}</h1>
                {form.featured_image && <img src={form.featured_image} alt="" className="rounded" />}
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{form.content}</ReactMarkdown>
                {form.tip && <blockquote><strong>Tip:</strong> {form.tip}</blockquote>}
              </article>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card space-y-3">
            <Field label="Slug">
              <input className="input font-mono text-xs" value={form.slug} onChange={(e) => set("slug", e.target.value)} />
            </Field>
            <Field label="Language">
              <select className="input" value={form.language} onChange={(e) => set("language", e.target.value)}>
                {Object.entries(LANGUAGES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.noindex} onChange={(e) => set("noindex", e.target.checked)} />
              noindex (hide from Google &amp; sitemap)
            </label>
          </div>
          <div className="card space-y-2">
            <span className="text-sm font-medium">Categories</span>
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.categories.includes(c.id)}
                  onChange={(e) => set("categories", e.target.checked ? [...form.categories, c.id] : form.categories.filter((x) => x !== c.id))}
                />
                {c.name}
              </label>
            ))}
          </div>
          <div className="card space-y-3">
            <Field label="Featured image URL">
              <input className="input text-xs" value={form.featured_image} onChange={(e) => set("featured_image", e.target.value)} />
            </Field>
            {form.featured_image && <img src={form.featured_image} alt="" className="rounded" />}
            <Field label="Tip box">
              <textarea className="input" rows={4} value={form.tip} onChange={(e) => set("tip", e.target.value)} />
            </Field>
          </div>
          {post.keyword && <p className="text-xs text-zinc-500">Written for keyword: <strong>{post.keyword}</strong></p>}
        </aside>
      </div>
    </div>
  );
}

function Field({ label, warn, children }: { label: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={`text-xs ${warn ? "text-amber-700" : "text-zinc-500"}`}>{label}</span>
      {children}
    </label>
  );
}
