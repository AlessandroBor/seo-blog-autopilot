/**
 * DROP-IN: copy to `app/sitemap.ts`. Next.js serves it at /sitemap.xml.
 *
 * What goes in:
 *   - your extra pages (seoConfig.extraSitemapPaths) and the blog index, once
 *     per language, each listing its sibling languages as hreflang alternates
 *   - every published, non-noindex post, at its canonical URL
 *   - category pages (if seoConfig.categoryPath is set) that have posts
 *
 * What stays out (on purpose):
 *   - drafts, 'draft_error' rows and noindex posts — listing a page you asked
 *     Google not to index sends mixed signals and wastes crawl budget
 *   - paginated list pages (?page=2) — no unique content
 *   - empty category pages
 */
import type { MetadataRoute } from 'next';
import {
  absoluteUrl,
  hreflangFor,
  localizedPath,
  postUrl,
  resolveLanguage,
  seoConfig
} from '@/lib/seo/config';
import {
  getCategories,
  getPublishedPosts,
  postModifiedDate,
  type PostSummary
} from '@/lib/seo/supabase';

// Rebuild at most once an hour. Crawlers fetch sitemaps often; without this
// every request would re-read the whole posts table.
export const revalidate = 3600;

/** Alternates block for a page that exists in several languages. */
function languageAlternates(langToUrl: Record<string, string>) {
  const languages: Record<string, string> = {};
  for (const [lang, url] of Object.entries(langToUrl)) {
    languages[hreflangFor(lang)] = url;
  }
  const fallback = langToUrl[seoConfig.defaultLanguage];
  if (fallback) languages['x-default'] = fallback;
  return { languages };
}

/**
 * One entry per language for a page that exists in all of `langs`, each
 * carrying the same alternates — Google's recommended cross-language signal.
 */
function multilingualEntries(
  path: string,
  langs: readonly string[],
  priority: number,
  lastModified?: string
): MetadataRoute.Sitemap {
  const langToUrl: Record<string, string> = {};
  for (const lang of langs) langToUrl[lang] = absoluteUrl(localizedPath(path, lang));
  const alternates = langs.length > 1 ? languageAlternates(langToUrl) : undefined;
  return Object.values(langToUrl).map((url) => ({
    url,
    ...(lastModified ? { lastModified } : {}),
    changeFrequency: 'weekly' as const,
    priority,
    ...(alternates ? { alternates } : {})
  }));
}

/** Newest modified date among posts, used as the blog index's lastmod. */
function newestDate(posts: PostSummary[]): string | undefined {
  let newest: string | undefined;
  for (const p of posts) {
    const d = postModifiedDate(p);
    if (!newest || d > newest) newest = d;
  }
  return newest;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPublishedPosts();
  const langs = seoConfig.languages;

  // Static pages: no lastModified on purpose. A timestamp that changes on
  // every build ("now") teaches Google to ignore your <lastmod> values.
  const staticEntries = seoConfig.extraSitemapPaths.flatMap(({ path, priority }) =>
    multilingualEntries(path, langs, priority)
  );

  // Blog index: only in languages that actually have posts.
  const langsWithPosts = langs.filter((l) =>
    posts.some((p) => resolveLanguage(p.language) === l)
  );
  const blogIndexEntries = multilingualEntries(
    seoConfig.blogPath,
    langsWithPosts,
    0.8,
    newestDate(posts)
  );

  // Posts: each row is one language, so there is no cross-language group to
  // advertise. Dedupe by URL in case two rows ever resolve to the same one.
  const postEntries = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const post of posts) {
    const url = postUrl(post.slug, post.language);
    postEntries.set(url, {
      url,
      lastModified: postModifiedDate(post),
      changeFrequency: 'monthly',
      priority: 0.7
    });
  }

  // Category pages, per language, only where that language has posts in it.
  const categoryEntries: MetadataRoute.Sitemap = [];
  if (seoConfig.categoryPath) {
    const categories = await getCategories();
    for (const cat of categories) {
      if (!cat.slug) continue;
      const catPosts = posts.filter((p) => (p.categories ?? []).includes(cat.id));
      const catLangs = langs.filter((l) =>
        catPosts.some((p) => resolveLanguage(p.language) === l)
      );
      if (catLangs.length === 0) continue;
      categoryEntries.push(
        ...multilingualEntries(
          `${seoConfig.categoryPath}/${cat.slug}`,
          catLangs,
          0.6,
          newestDate(catPosts)
        )
      );
    }
  }

  return [
    ...staticEntries,
    ...blogIndexEntries,
    ...categoryEntries,
    ...postEntries.values()
  ];
}
