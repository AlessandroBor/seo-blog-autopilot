/**
 * SEO kit configuration — the ONE file you should need to edit.
 *
 * Every other file in the kit (sitemap, RSS feed, metadata, JSON-LD, IndexNow,
 * robots, internal-link script) reads its site-specific values from here, so
 * URLs stay identical everywhere. That matters: if the sitemap says one URL
 * and the page's canonical tag says another, search engines treat them as two
 * different pages.
 */

// ── Site basics ──────────────────────────────────────────────────────────────

/** Absolute site URL without a trailing slash, e.g. "https://example.com". */
export const SITE_URL: string = (
  process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
).replace(/\/+$/, '');

export const seoConfig = {
  /** Shown in titles, OG `site_name`, RSS channel, JSON-LD publisher. */
  siteName: process.env.NEXT_PUBLIC_SITE_NAME || 'My Website',

  /** Short description of the blog (RSS channel description, blog index). */
  blogDescription: 'Articles, guides and news from our team.',

  /** Where the blog lives. Posts are served at `${blogPath}/${slug}`. */
  blogPath: '/blog',

  /**
   * Topic/category pages, e.g. "/blog/topics" → /blog/topics/{category-slug}.
   * Set to null if your site has no category pages; they are then left out of
   * the sitemap.
   */
  categoryPath: null as string | null,

  // ── Languages ──────────────────────────────────────────────────────────────

  /** Language codes your site actually serves (must match blog_posts.language). */
  languages: ['en'] as readonly string[],

  /** The language served WITHOUT a URL prefix (when prefixDefaultLanguage is false). */
  defaultLanguage: 'en',

  /**
   * false (most common): default language at /blog/slug, others at /{lang}/blog/slug.
   * true: every language gets a prefix, e.g. /en/blog/slug and /fr/blog/slug.
   */
  prefixDefaultLanguage: false,

  /**
   * Optional: map an internal language code to the hreflang value search
   * engines should see. Only needed when they differ, e.g. { pt: 'pt-BR' } if
   * your Portuguese content targets Brazil. Unlisted codes are used as-is.
   */
  hreflangMap: {} as Record<string, string>,

  // ── Publisher / social ─────────────────────────────────────────────────────

  publisher: {
    /** Organization name in JSON-LD (usually the same as siteName). */
    name: process.env.NEXT_PUBLIC_SITE_NAME || 'My Website',
    /** Absolute URL of a square logo (at least 112x112, ideally 512x512). */
    logoUrl: `${SITE_URL}/logo.png`,
    /** Your social profiles — helps Google connect them to your site. */
    sameAs: [] as string[]
  },

  /** Fallback share image (1200x630) for posts without featured_image. */
  defaultOgImage: `${SITE_URL}/og-default.png`,

  /** Twitter/X handle including "@", or null. */
  twitterHandle: null as string | null,

  /** Byline used in RSS <dc:creator> and as the Article author. */
  authorName: 'Editorial Team',

  // ── Crawling ──────────────────────────────────────────────────────────────

  /** Non-blog pages to list in the sitemap (path → priority). */
  extraSitemapPaths: [
    { path: '/', priority: 1.0 }
    // { path: '/about', priority: 0.6 },
    // { path: '/contact', priority: 0.5 },
  ] as ReadonlyArray<{ path: string; priority: number }>,

  /** Paths crawlers should not visit (robots.txt Disallow). */
  robotsDisallow: ['/api/', '/admin'] as readonly string[],

  /** IndexNow: submit posts published/changed in the last N hours. */
  indexNowWindowHours: 25 // daily cron + 1h overlap so nothing slips through
} as const;

// ── URL helpers ──────────────────────────────────────────────────────────────

/** A language the site serves; unknown/null codes fall back to the default. */
export function resolveLanguage(language: string | null | undefined): string {
  return language && seoConfig.languages.includes(language)
    ? language
    : seoConfig.defaultLanguage;
}

/** "" for the default language (unless prefixDefaultLanguage), else "/fr". */
export function languagePrefix(language: string | null | undefined): string {
  const lang = resolveLanguage(language);
  if (lang === seoConfig.defaultLanguage && !seoConfig.prefixDefaultLanguage) {
    return '';
  }
  return `/${lang}`;
}

/**
 * Turn a site path into an absolute URL. The root has NO trailing slash
 * ("https://example.com", not "https://example.com/") so the sitemap and the
 * canonical tag always spell the homepage the same way.
 */
export function absoluteUrl(path: string): string {
  if (path === '' || path === '/') return SITE_URL;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`.replace(
    /\/+$/,
    ''
  );
}

/** Localized path for any site path: localizedPath('/about', 'fr') → "/fr/about". */
export function localizedPath(path: string, language?: string | null): string {
  const prefix = languagePrefix(language);
  if (path === '/' || path === '') return prefix || '/';
  return `${prefix}${path}`;
}

/** Blog index path for a language, e.g. "/blog" or "/fr/blog". */
export function blogIndexPath(language?: string | null): string {
  return localizedPath(seoConfig.blogPath, language);
}

/** Path of a single post, e.g. "/blog/my-post" or "/fr/blog/mon-article". */
export function postPath(slug: string, language?: string | null): string {
  return `${blogIndexPath(language)}/${slug}`;
}

/** Absolute URL of a single post — the canonical URL. */
export function postUrl(slug: string, language?: string | null): string {
  return absoluteUrl(postPath(slug, language));
}

/** Path of a category page, or null when categoryPath is disabled. */
export function categoryPagePath(
  categorySlug: string,
  language?: string | null
): string | null {
  if (!seoConfig.categoryPath) return null;
  return localizedPath(`${seoConfig.categoryPath}/${categorySlug}`, language);
}

/** hreflang value for a language code (BCP-47), e.g. "pt" → "pt-BR". */
export function hreflangFor(language: string): string {
  return seoConfig.hreflangMap[language] ?? language;
}

/** Open Graph locale format, e.g. "pt-BR" → "pt_BR". */
export function ogLocaleFor(language: string): string {
  return hreflangFor(language).replace('-', '_');
}
