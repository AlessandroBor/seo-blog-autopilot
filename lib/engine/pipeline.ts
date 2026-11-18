/**
 * The full keyword -> blog post pipeline.
 *
 *   1. SERP research    Google top 10 -> scrape -> TF-IDF LSI terms + phrases
 *   2. Search intent     LLM reads the ranking titles
 *   3. Titles            planned prompt -> 5 titles -> audit / rewrite loop
 *   4. Outline           sections, heading levels, word targets, keyword assignment
 *   5. Writing           every section in parallel -> format -> lint auto-fix
 *   6. Images            featured + mid-article icon images with alt text
 *   7. Enrichment        categories + "pro tip"
 *   8. Save              draft, or published if AUTO_PUBLISH and the quality gate passes
 */
import { siteConfig, type Language } from "@/config/site.config";
import { db, type BlogPost } from "@/lib/supabase";
import { researchAndTitles } from "./titles";
import { generateOutline } from "./outline";
import { writeArticle } from "./writer";
import { createIconImage, iconQueryFor, insertImageMidArticle } from "./images";
import { assignCategories, generateTip, uniqueSlug } from "./enrich";
import { checkQuality } from "./quality";
import type { Outline } from "./types";

export { researchAndTitles } from "./titles";
export { generateOutline } from "./outline";

export interface SaveOptions {
  /** Try to publish immediately (still subject to the quality gate). */
  publish?: boolean;
}

/** Stages 5-8: outline -> finished post row. Used by both the cron and the manual wizard. */
export async function writeAndSave(outline: Outline, opts: SaveOptions = {}): Promise<BlogPost> {
  let content = await writeArticle(outline);

  const [featured, bodyQuery] = await Promise.all([
    iconQueryFor(outline.meta_title).then((q) => (q ? createIconImage(q) : null)),
    iconQueryFor(content),
  ]);
  const bodyImage = bodyQuery ? await createIconImage(bodyQuery) : null;
  if (bodyImage) content = insertImageMidArticle(content, bodyImage);

  const summary = { title: outline.meta_title, meta_description: outline.meta_description, content };
  const [categories, tip, slug] = await Promise.all([
    assignCategories(summary),
    generateTip(summary, outline.language),
    uniqueSlug(outline.meta_title),
  ]);

  const quality = checkQuality(content, outline);
  const publish = Boolean(opts.publish) && quality.passed;
  if (opts.publish && !quality.passed) {
    console.warn(`[pipeline] kept as draft, quality gate failed: ${quality.reasons.join("; ")}`);
  }

  const { data, error } = await db()
    .from("blog_posts")
    .insert({
      title: outline.meta_title,
      slug,
      content,
      meta_description: outline.meta_description,
      status: publish ? "published" : "draft",
      language: outline.language,
      featured_image: featured?.src ?? null,
      categories,
      tip,
      keyword: outline.keyword,
      source: "ai",
    })
    .select()
    .single();
  if (error) throw error;

  console.log(`[pipeline] saved "${outline.meta_title}" (${quality.wordCount} words) as ${data.status}`);
  return data as BlogPost;
}

/** Everything, start to finish, for one keyword. Picks the first (audited) title. */
export async function generatePostFromKeyword(
  keyword: string,
  language: Language = siteConfig.defaultLanguage,
  opts: SaveOptions = {},
): Promise<BlogPost> {
  console.log(`[pipeline] ===== "${keyword}" (${language}) =====`);
  const research = await researchAndTitles(keyword, language);
  const outline = await generateOutline({
    title: research.titles[0],
    keyword,
    searchIntent: research.searchIntent,
    lsis: research.lsis,
    language,
  });
  return writeAndSave(outline, opts);
}
