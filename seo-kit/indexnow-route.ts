/**
 * DROP-IN: copy to `app/api/cron/indexnow/route.ts`.
 *
 * IndexNow is a free "hey, this page changed" ping supported by Bing, Yandex,
 * Seznam, Naver and others (Bing's index also feeds several AI search tools).
 * Google does NOT use IndexNow — for Google, the sitemap does the job.
 *
 * Once a day (via Vercel Cron, see README) this route finds posts published or
 * edited in the last `seoConfig.indexNowWindowHours` hours and submits their
 * URLs. The window is 25h for a daily cron: the extra hour covers a cron that
 * starts late, so no post slips between two runs.
 *
 * Setup:
 *   1. Pick a key: 8–128 characters of a-z, A-Z, 0-9 or "-" (e.g. a random
 *      32-character hex string). It is public by design, not a secret.
 *   2. Set INDEXNOW_KEY=<key> in your environment.
 *   3. Create the file `public/<key>.txt` whose only content is the key.
 *      IndexNow fetches https://yoursite.com/<key>.txt to prove you own the site.
 *   4. Set CRON_SECRET (a long random string) — Vercel sends it automatically
 *      as "Authorization: Bearer <CRON_SECRET>" on scheduled runs.
 */
import { NextResponse } from 'next/server';
import { SITE_URL, postUrl, seoConfig } from '@/lib/seo/config';
import { getPostsChangedSince } from '@/lib/seo/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS_PER_REQUEST = 10_000; // protocol limit
const KEY_PATTERN = /^[a-zA-Z0-9-]{8,128}$/;

export async function GET(req: Request): Promise<NextResponse> {
  // Fail closed: without CRON_SECRET anyone could trigger submissions.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = process.env.INDEXNOW_KEY;
  if (!key || !KEY_PATTERN.test(key)) {
    return NextResponse.json(
      { error: 'INDEXNOW_KEY is missing or invalid (8-128 chars: a-z A-Z 0-9 -)' },
      { status: 500 }
    );
  }

  const since = new Date(
    Date.now() - seoConfig.indexNowWindowHours * 60 * 60 * 1000
  ).toISOString();

  let urls: string[];
  try {
    const posts = await getPostsChangedSince(since);
    urls = Array.from(new Set(posts.map((p) => postUrl(p.slug, p.language))));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  if (urls.length === 0) {
    return NextResponse.json({ submitted: 0, message: 'No changed posts' });
  }

  const host = new URL(SITE_URL).host;
  const results: number[] = [];
  for (let i = 0; i < urls.length; i += MAX_URLS_PER_REQUEST) {
    const batch = urls.slice(i, i + MAX_URLS_PER_REQUEST);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host,
          key,
          keyLocation: `${SITE_URL}/${key}.txt`,
          urlList: batch
        })
      });
      // 200 = accepted, 202 = accepted but key not yet verified (normal on
      // the first submission). 403 = key file not found/doesn't match.
      // 422 = URLs don't belong to `host` (check NEXT_PUBLIC_SITE_URL).
      results.push(res.status);
    } catch (error) {
      console.error('[indexnow] submit failed:', error);
      results.push(0);
    }
  }

  const ok = results.every((s) => s === 200 || s === 202);
  console.log(`[indexnow] submitted ${urls.length} URLs, statuses ${results.join(',')}`);
  return NextResponse.json(
    { submitted: urls.length, statuses: results, urls },
    { status: ok ? 200 : 502 }
  );
}
