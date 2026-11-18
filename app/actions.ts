"use server";

import { revalidatePath } from "next/cache";
import slugify from "slugify";
import { LANGUAGES, siteConfig } from "@/config/site.config";
import { db, type PostStatus } from "@/lib/supabase";

// Server actions are POSTs to the page URL, so proxy.ts already requires a
// valid admin session before any of these run.

// ------------------------------------------------------------- keywords
export async function addKeywords(formData: FormData) {
  const raw = String(formData.get("keywords") ?? "");
  const language = String(formData.get("language") ?? siteConfig.defaultLanguage);
  if (!(language in LANGUAGES)) throw new Error("Unknown language.");

  // One keyword per line, so you can paste a whole list from a keyword tool.
  const keywords = [...new Set(raw.split("\n").map((k) => k.trim()).filter(Boolean))];
  if (keywords.length === 0) return;

  const { data: last } = await db()
    .from("keyword_queue")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);
  const start = (last?.[0]?.position ?? 0) + 1;

  const { error } = await db()
    .from("keyword_queue")
    .upsert(
      keywords.map((keyword, i) => ({ keyword, language, position: start + i })),
      { onConflict: "keyword,language", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
  revalidatePath("/keywords");
}

export async function deleteKeyword(id: number) {
  await db().from("keyword_queue").delete().eq("id", id);
  revalidatePath("/keywords");
}

export async function retryKeyword(id: number) {
  await db().from("keyword_queue").update({ status: "pending", attempts: 0, last_error: null }).eq("id", id);
  revalidatePath("/keywords");
}

/** Swaps position with the neighbouring pending keyword. */
export async function moveKeyword(id: number, direction: "up" | "down") {
  const { data: rows } = await db()
    .from("keyword_queue")
    .select("id, position")
    .eq("status", "pending")
    .order("position", { ascending: true });
  if (!rows) return;
  const i = rows.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;
  await Promise.all([
    db().from("keyword_queue").update({ position: rows[j].position }).eq("id", rows[i].id),
    db().from("keyword_queue").update({ position: rows[i].position }).eq("id", rows[j].id),
  ]);
  revalidatePath("/keywords");
}

// ------------------------------------------------------------- posts
export interface PostInput {
  title: string;
  slug: string;
  meta_description: string;
  content: string;
  featured_image: string;
  tip: string;
  categories: number[];
  noindex: boolean;
  language: string;
}

export async function savePost(id: number, input: PostInput) {
  const slug = slugify(input.slug || input.title, { lower: true, strict: true });
  const { data: clash } = await db().from("blog_posts").select("id").eq("slug", slug).neq("id", id).maybeSingle();
  if (clash) return { error: `Slug "${slug}" is already used by another post.` };

  const { error } = await db()
    .from("blog_posts")
    .update({
      title: input.title.trim(),
      slug,
      meta_description: input.meta_description.trim(),
      content: input.content,
      featured_image: input.featured_image.trim() || null,
      tip: input.tip.trim() || null,
      categories: input.categories,
      noindex: input.noindex,
      language: input.language,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/posts");
  revalidatePath(`/posts/${id}`);
  return { error: null };
}

export async function setPostStatus(ids: number[], status: PostStatus) {
  if (ids.length === 0) return;
  const { error } = await db().from("blog_posts").update({ status }).in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/posts");
  revalidatePath("/");
}

export async function deletePosts(ids: number[]) {
  if (ids.length === 0) return;
  await db().from("blog_posts").delete().in("id", ids);
  revalidatePath("/posts");
  revalidatePath("/");
}

// ------------------------------------------------------------- categories
export async function upsertCategory(formData: FormData) {
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return;
  const row = { name, description, slug: slugify(name, { lower: true, strict: true }) };
  const q = id ? db().from("blog_categories").update(row).eq("id", id) : db().from("blog_categories").insert(row);
  const { error } = await q;
  if (error) throw new Error(error.message);
  revalidatePath("/categories");
}

export async function deleteCategory(id: number) {
  await db().from("blog_categories").delete().eq("id", id);
  revalidatePath("/categories");
}
