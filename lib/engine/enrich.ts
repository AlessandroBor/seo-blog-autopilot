import { z } from "zod";
import slugify from "slugify";
import { siteConfig, type Language } from "@/config/site.config";
import { db, type BlogCategory } from "@/lib/supabase";
import { structured, withTimeout } from "./llm";
import { categorySystem, TIP_PROMPTS } from "./prompts";

const CategoriesSchema = z.object({ categories: z.array(z.number()) });
const TipSchema = z.object({ tip: z.string() });

interface ArticleSummary {
  title: string;
  meta_description: string;
  content: string;
}

/** Picks up to N existing categories using their name + description. */
export async function assignCategories(article: ArticleSummary): Promise<number[]> {
  const { data, error } = await db().from("blog_categories").select("id, name, description");
  if (error || !data?.length) return [];
  const cats = data as BlogCategory[];

  try {
    const { categories } = await structured({
      schema: CategoriesSchema,
      name: "categories",
      messages: [
        {
          role: "system",
          content: categorySystem(
            cats.map((c) => ({ id: c.id, category: `${c.name}: ${c.description ?? ""}` })),
            siteConfig.maxCategoriesPerPost,
          ),
        },
        { role: "user", content: JSON.stringify({ ...article, content: article.content.slice(0, 12000) }) },
      ],
    });
    // Never trust ids from the model blindly.
    const valid = new Set(cats.map((c) => c.id));
    return categories.filter((id) => valid.has(id)).slice(0, siteConfig.maxCategoriesPerPost);
  } catch (err) {
    console.warn("[enrich] category assignment failed:", err);
    return [];
  }
}

/** One short, practical "pro tip" shown in a callout on the post. Optional: 15s budget. */
export async function generateTip(article: ArticleSummary, language: Language): Promise<string | null> {
  try {
    const { tip } = await withTimeout(
      structured({
        schema: TipSchema,
        name: "tip",
        messages: [
          { role: "system", content: TIP_PROMPTS[language] ?? TIP_PROMPTS.en },
          { role: "user", content: JSON.stringify({ ...article, content: article.content.slice(0, 12000) }) },
        ],
      }),
      15_000,
      "Tip generation",
    );
    return tip.trim() || null;
  } catch (err) {
    console.warn("[enrich] tip failed (continuing without):", err);
    return null;
  }
}

/** "My Title" -> "my-title", "my-title-1", ... until unique. */
export async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title, { lower: true, strict: true }).slice(0, 80).replace(/-+$/, "") || "post";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const { data } = await db().from("blog_posts").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${Date.now()}`;
}
