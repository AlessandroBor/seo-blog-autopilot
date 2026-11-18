/**
 * DROP-IN: copy to `app/feed.xml/route.ts`. Serves an RSS 2.0 feed at /feed.xml.
 *
 * Feed readers, newsletter tools and several AI crawlers pick up new posts
 * from RSS faster than from the sitemap. Only published, non-noindex posts
 * are included, newest first, with a short plain-text excerpt (readers
 * should click through to your site for the full article).
 *
 * Tip: advertise it in your root layout's metadata so browsers and tools
 * discover it:  alternates: { types: { 'application/rss+xml': '/feed.xml' } }
 */
import {
  absoluteUrl,
  blogIndexPath,
  hreflangFor,
  postUrl,
  seoConfig
} from '@/lib/seo/config';
import {
  getCategories,
  getPublishedPosts,
  postPublishedDate
} from '@/lib/seo/supabase';

export const revalidate = 3600; // rebuild at most hourly

const MAX_ITEMS = 30;

/**
 * Escape XML special characters. Plain escaping rather than CDATA: some
 * popular readers handle CDATA inconsistently, escaping works everywhere.
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Markdown/HTML → short plain text for <description>. */
function plainExcerpt(raw: string | null, maxLen = 300): string {
  if (!raw) return '';
  const text = raw
    .replace(/<[^>]*>/g, '') // HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → label
    .replace(/^#+\s+/gm, '') // headings
    .replace(/^\s*[-*+]\s+/gm, '') // bullets
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/`+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= maxLen ? text : `${text.slice(0, maxLen).trimEnd()}…`;
}

/** Guess the image MIME type from the URL (RSS enclosures require one). */
function imageMime(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'avif') return 'image/avif';
  return 'image/jpeg';
}

export async function GET(): Promise<Response> {
  let body: string;
  try {
    const [posts, categories] = await Promise.all([
      getPublishedPosts({ limit: MAX_ITEMS }),
      getCategories()
    ]);
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const feedUrl = absoluteUrl('/feed.xml');

    const items = posts
      .map((post) => {
        const url = postUrl(post.slug, post.language);
        const cats = (post.categories ?? [])
          .map((id) => categoryName.get(id))
          .filter((name): name is string => Boolean(name))
          .map((name) => `      <category>${escapeXml(name)}</category>`);
        const enclosure = post.featured_image
          ? `      <enclosure url="${escapeXml(post.featured_image)}" length="0" type="${imageMime(post.featured_image)}" />`
          : '';
        return [
          '    <item>',
          `      <title>${escapeXml(post.title || 'Untitled')}</title>`,
          `      <link>${escapeXml(url)}</link>`,
          `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
          `      <pubDate>${new Date(postPublishedDate(post)).toUTCString()}</pubDate>`,
          `      <description>${escapeXml(plainExcerpt(post.meta_description))}</description>`,
          `      <dc:creator>${escapeXml(seoConfig.authorName)}</dc:creator>`,
          ...cats,
          enclosure
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');

    body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(`${seoConfig.siteName} Blog`)}</title>
    <link>${escapeXml(absoluteUrl(blogIndexPath()))}</link>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(seoConfig.blogDescription)}</description>
    <language>${escapeXml(hreflangFor(seoConfig.defaultLanguage))}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>60</ttl>
${items}
  </channel>
</rss>`;
  } catch (error) {
    console.error('[feed.xml] failed to build feed:', error);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"/>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' }
    });
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
