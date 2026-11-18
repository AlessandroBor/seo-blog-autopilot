/**
 * Structured data (JSON-LD) for blog posts.
 *
 * JSON-LD is a hidden block of machine-readable facts about the page — "this
 * is an article, published on X, by Y, in this breadcrumb trail". Google uses
 * it for rich results (dates, breadcrumbs, images in search), and AI search
 * engines use it to understand and cite the page.
 *
 * Usage in app/blog/[slug]/page.tsx:
 *   const categories = await getCategoriesForPost(post);
 *   <JsonLd data={buildPostJsonLd(post, categories)} />
 */
import {
  SITE_URL,
  absoluteUrl,
  blogIndexPath,
  categoryPagePath,
  hreflangFor,
  localizedPath,
  postUrl,
  resolveLanguage,
  seoConfig
} from './config';
import {
  postModifiedDate,
  postPublishedDate,
  type BlogCategory,
  type BlogPost
} from './supabase';

type JsonLdObject = Record<string, unknown>;

/**
 * Serialize JSON-LD for a <script type="application/ld+json"> tag.
 *
 * WHY: JSON.stringify does NOT escape `<`. Inside a <script> element the
 * browser is looking for the text `</script`, so a post title containing
 * `</script><script>…` would close the block early and run as code. Post
 * titles come from your database (and here, from an AI pipeline), so treat
 * them as untrusted. Escaping `<`, `>` and `&` as < etc. keeps the JSON
 * valid — parsers turn it back into `<` — while making `</script`
 * impossible to appear in the HTML. U+2028/U+2029 are escaped for old JS
 * parsers that treat them as line breaks.
 */
export function serializeJsonLd(schema: unknown): string {
  return JSON.stringify(schema)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// ── Building blocks ──────────────────────────────────────────────────────────

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/** Your organization. Safe to also render once on the homepage. */
export function organizationSchema(): JsonLdObject {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: seoConfig.publisher.name,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: seoConfig.publisher.logoUrl
    },
    ...(seoConfig.publisher.sameAs.length > 0
      ? { sameAs: [...seoConfig.publisher.sameAs] }
      : {})
  };
}

export function websiteSchema(): JsonLdObject {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: seoConfig.siteName,
    url: SITE_URL,
    publisher: { '@id': ORG_ID }
  };
}

export interface Crumb {
  name: string;
  url: string;
}

export function breadcrumbSchema(trail: Crumb[], id?: string): JsonLdObject {
  return {
    '@type': 'BreadcrumbList',
    ...(id ? { '@id': id } : {}),
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: crumb.url
    }))
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function faqSchema(items: FaqItem[], id?: string): JsonLdObject {
  return {
    '@type': 'FAQPage',
    ...(id ? { '@id': id } : {}),
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer }
    }))
  };
}

/** Rough word count of markdown (for Article.wordCount). */
export function countWords(markdown: string | null): number {
  if (!markdown) return 0;
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ');
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Pull question/answer pairs out of a markdown "FAQ" section, if the post has
 * one. Recognizes a heading like "## FAQ" / "## Frequently Asked Questions"
 * followed by "### Question?" sub-headings (or "**Question?**" lines), each
 * followed by its answer paragraph(s). Returns [] when nothing is found.
 *
 * Note: Google now shows FAQ rich results only for a few authoritative
 * sites, but the markup is still read by search and AI engines and is
 * harmless. Only emit it when the questions are visible on the page.
 */
export function extractFaqFromMarkdown(markdown: string | null): FaqItem[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) =>
    /^#{2,3}\s+(faq|faqs|frequently asked questions)\b/i.test(l.trim())
  );
  if (start === -1) return [];
  const sectionLevel = (lines[start].match(/^#+/)?.[0].length ?? 2);

  const items: FaqItem[] = [];
  let question: string | null = null;
  let answer: string[] = [];
  const flush = () => {
    const text = answer.join(' ').replace(/\s+/g, ' ').trim();
    if (question && text) items.push({ question, answer: text });
    question = null;
    answer = [];
  };

  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    const heading = line.match(/^(#+)\s+(.*)$/);
    if (heading && heading[1].length <= sectionLevel) break; // section ended
    const bold = line.match(/^\*\*(.+?)\*\*:?$/);
    if (heading || bold) {
      flush();
      question = (heading?.[2] ?? bold?.[1] ?? '').replace(/[*_`]/g, '').trim();
      continue;
    }
    if (question && line) {
      answer.push(line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, ''));
    }
  }
  flush();
  return items;
}

// ── The full graph for a post page ───────────────────────────────────────────

export interface PostJsonLdOptions {
  /** Labels for the breadcrumb trail (translate them for other languages). */
  homeLabel?: string;
  blogLabel?: string;
  /** Emit FAQPage when the post has a markdown FAQ section. Default true. */
  includeFaq?: boolean;
}

/**
 * Everything a post page needs in one @graph: BlogPosting, BreadcrumbList,
 * WebSite, Organization, and FAQPage when applicable. Publisher and website
 * are inlined (not just referenced) so a crawler that lands on the post
 * without ever visiting the homepage still gets the required fields.
 */
export function buildPostJsonLd(
  post: BlogPost,
  categories: BlogCategory[] = [],
  options: PostJsonLdOptions = {}
): JsonLdObject {
  const language = resolveLanguage(post.language);
  const url = postUrl(post.slug, language);
  const primaryCategory = categories.find((c) => c.slug);

  const trail: Crumb[] = [
    { name: options.homeLabel ?? 'Home', url: absoluteUrl(localizedPath('/', language)) },
    { name: options.blogLabel ?? 'Blog', url: absoluteUrl(blogIndexPath(language)) }
  ];
  const catPath = primaryCategory ? categoryPagePath(primaryCategory.slug, language) : null;
  if (primaryCategory && catPath) {
    trail.push({ name: primaryCategory.name, url: absoluteUrl(catPath) });
  }
  trail.push({ name: post.title, url });

  const wordCount = countWords(post.content);
  const article: JsonLdObject = {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: post.title,
    ...(post.meta_description ? { description: post.meta_description } : {}),
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished: postPublishedDate(post),
    // Equals datePublished unless the post was really revised on a later day.
    dateModified: postModifiedDate(post),
    author: { '@type': 'Organization', name: seoConfig.authorName, url: SITE_URL },
    publisher: { '@id': ORG_ID },
    isPartOf: { '@id': WEBSITE_ID },
    inLanguage: hreflangFor(language),
    image: post.featured_image || seoConfig.defaultOgImage,
    ...(primaryCategory ? { articleSection: primaryCategory.name } : {}),
    ...(categories.length > 0 ? { keywords: categories.map((c) => c.name).join(', ') } : {}),
    ...(wordCount > 0 ? { wordCount } : {})
  };

  const graph: JsonLdObject[] = [
    article,
    breadcrumbSchema(trail, `${url}#breadcrumb`),
    websiteSchema(),
    organizationSchema()
  ];

  if (options.includeFaq !== false) {
    const faq = extractFaqFromMarkdown(post.content);
    if (faq.length > 0) graph.push(faqSchema(faq, `${url}#faq`));
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}
