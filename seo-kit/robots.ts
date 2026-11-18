/**
 * DROP-IN: copy to `app/robots.ts`. Next.js serves it at /robots.txt.
 *
 * Lets every crawler in, keeps them out of API routes and your admin area
 * (seoConfig.robotsDisallow), and points them at the sitemap.
 *
 * Note: robots.txt is NOT how you hide a single post — a blocked page can
 * still show up in Google (without a description) if others link to it. Use
 * the post's `noindex` flag instead; buildPostMetadata() turns it into a
 * proper <meta name="robots" content="noindex"> tag.
 */
import type { MetadataRoute } from 'next';
import { SITE_URL, absoluteUrl, seoConfig } from '@/lib/seo/config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...seoConfig.robotsDisallow]
      }
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL
  };
}
