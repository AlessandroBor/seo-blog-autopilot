/**
 * Next.js `Metadata` for blog pages: <title>, meta description, canonical
 * URL, hreflang alternates, Open Graph (Facebook/LinkedIn/WhatsApp/Slack
 * previews), Twitter/X card, and the robots noindex tag.
 *
 * Usage in app/blog/[slug]/page.tsx (Next 15/16 — params is a Promise):
 *
 *   export async function generateMetadata(
 *     { params }: { params: Promise<{ slug: string }> }
 *   ): Promise<Metadata> {
 *     const { slug } = await params;
 *     const post = await getPostBySlug(slug);
 *     if (!post) notFound();
 *     return buildPostMetadata(post);
 *   }
 */
import type { Metadata } from 'next';
import {
  absoluteUrl,
  blogIndexPath,
  hreflangFor,
  ogLocaleFor,
  postUrl,
  resolveLanguage,
  seoConfig
} from './config';
import {
  hasMeaningfulUpdate,
  postModifiedDate,
  postPublishedDate,
  type BlogPost
} from './supabase';

/** Same article in another language, if you know it (e.g. a translation). */
export interface PostTranslation {
  language: string;
  slug: string;
}

export interface PostMetadataOptions {
  /**
   * Other-language versions of THIS post. The schema has no column linking
   * translations, so by default each post only declares itself. If your
   * pipeline does create translations, pass them here and every version will
   * point at every other (hreflang must be reciprocal to count).
   */
  translations?: PostTranslation[];
  /** Search-result title override (defaults to the post title). */
  title?: string;
}

/** Trim to ~160 characters on a word boundary (Google's snippet length). */
function clampDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 80 ? cut.lastIndexOf(' ') : cut.length)}…`;
}

export function buildPostMetadata(
  post: BlogPost,
  options: PostMetadataOptions = {}
): Metadata {
  const language = resolveLanguage(post.language);
  const canonical = postUrl(post.slug, language);
  const title = options.title ?? post.title;
  const description = clampDescription(post.meta_description ?? '');
  const image = post.featured_image || seoConfig.defaultOgImage;

  // hreflang: this post + any known translations, plus x-default. With no
  // translations, x-default points at the post itself — a valid, harmless
  // self-reference.
  const languages: Record<string, string> = { [hreflangFor(language)]: canonical };
  for (const t of options.translations ?? []) {
    const tLang = resolveLanguage(t.language);
    languages[hreflangFor(tLang)] = postUrl(t.slug, tLang);
  }
  const defaultVersion = (options.translations ?? []).find(
    (t) => resolveLanguage(t.language) === seoConfig.defaultLanguage
  );
  languages['x-default'] = defaultVersion
    ? postUrl(defaultVersion.slug, seoConfig.defaultLanguage)
    : canonical;

  const metadata: Metadata = {
    title,
    description,
    alternates: {
      canonical,
      languages,
      types: { 'application/rss+xml': absoluteUrl('/feed.xml') }
    },
    openGraph: {
      type: 'article',
      url: canonical,
      title,
      description,
      siteName: seoConfig.siteName,
      locale: ogLocaleFor(language),
      images: [{ url: image, alt: post.title }],
      publishedTime: postPublishedDate(post),
      ...(hasMeaningfulUpdate(post) ? { modifiedTime: postModifiedDate(post) } : {})
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
      ...(seoConfig.twitterHandle ? { site: seoConfig.twitterHandle } : {})
    }
  };

  // noindex posts still render for visitors, but tell search engines to keep
  // them out of results. `follow: true` lets link value still flow through
  // the page's links. (These posts are also excluded from the sitemap, feed
  // and IndexNow — never ask an engine to crawl a page you've noindexed.)
  if (post.noindex) {
    metadata.robots = {
      index: false,
      follow: true,
      googleBot: { index: false, follow: true }
    };
  }

  return metadata;
}

/** Metadata for the blog index page (/blog, /fr/blog, ...). */
export function buildBlogIndexMetadata(
  language?: string | null,
  overrides: { title?: string; description?: string } = {}
): Metadata {
  const lang = resolveLanguage(language);
  const canonical = absoluteUrl(blogIndexPath(lang));
  const title = overrides.title ?? `${seoConfig.siteName} Blog`;
  const description = overrides.description ?? seoConfig.blogDescription;

  const languages: Record<string, string> = {};
  for (const l of seoConfig.languages) {
    languages[hreflangFor(l)] = absoluteUrl(blogIndexPath(l));
  }
  languages['x-default'] = absoluteUrl(blogIndexPath(seoConfig.defaultLanguage));

  return {
    title,
    description,
    alternates: {
      canonical,
      ...(seoConfig.languages.length > 1 ? { languages } : {}),
      types: { 'application/rss+xml': absoluteUrl('/feed.xml') }
    },
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
      siteName: seoConfig.siteName,
      locale: ogLocaleFor(lang),
      images: [{ url: seoConfig.defaultOgImage }]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [seoConfig.defaultOgImage]
    }
  };
}
