import { notFound } from "next/navigation";
import { db, type BlogCategory, type BlogPost } from "@/lib/supabase";
import { PostEditor } from "./PostEditor";

export const dynamic = "force-dynamic";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: post }, { data: categories }] = await Promise.all([
    db().from("blog_posts").select("*").eq("id", Number(id)).maybeSingle(),
    db().from("blog_categories").select("id, name, slug, description").order("name"),
  ]);
  if (!post) notFound();
  return <PostEditor post={post as BlogPost} categories={(categories ?? []) as BlogCategory[]} />;
}
