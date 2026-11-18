# SEO kit

Ready-made SEO pieces for a **Next.js App Router** site (Next 15 or 16, TypeScript)
whose blog posts live in **Supabase** (`blog_posts` + `blog_categories`).

Drop these in and your blog gets:

- a **sitemap** (`/sitemap.xml`) listing every public post with honest "last modified" dates
- an **RSS feed** (`/feed.xml`)
- a **robots.txt** pointing crawlers at the sitemap
- correct **page metadata** for every post: title, description, canonical URL,
  language tags (hreflang), social share previews (Open Graph / Twitter), and `noindex` when you ask for it
- **structured data** (JSON-LD): Article, Breadcrumbs, Organization, and FAQ when the post has an FAQ section
- a daily **IndexNow** ping so Bing and friends hear about new and updated posts within a day
- a script to **add internal links** between your posts safely

You don't need to be an SEO expert. Fill in `config.ts`, copy the files, set a few
environment variables, done.

---

## The one rule everything follows

A post is public only when `status = 'published'`. A public post with
`noindex = true` still has a page people can visit, but it is kept out of search
results **and** out of the sitemap, feed and IndexNow (never invite a search
engine to crawl a page you've told it not to index). Drafts and `draft_error`
rows are never shown anywhere.

---

## 1. Copy the files

Copy the whole `seo-kit/` folder into your project as **`lib/seo/`**, then copy the
four "drop-in" files to the `app/` paths below (they're the files whose first
comment says `DROP-IN`):

| Kit file | Copy to | What it does |
|---|---|---|
| `config.ts` | `lib/seo/config.ts` | **Edit this.** Site name, URL, blog path, languages, logo, social handles. Builds every URL the kit uses. |
| `supabase.ts` | `lib/seo/supabase.ts` | Read-only Supabase client (anon key) + `getPublishedPosts()`, `getPostBySlug()`, `getCategoriesForPost()` and date helpers. |
| `metadata.ts` | `lib/seo/metadata.ts` | `buildPostMetadata(post)` and `buildBlogIndexMetadata(lang)` → Next.js `Metadata`. |
| `json-ld.ts` | `lib/seo/json-ld.ts` | `buildPostJsonLd(post, categories)` and smaller schema helpers; safe serializer. |
| `JsonLd.tsx` | `lib/seo/JsonLd.tsx` | `<JsonLd data={...} />` component that renders the structured data safely. |
| `sitemap.ts` | **`app/sitemap.ts`** | The sitemap. |
| `feed-route.ts` | **`app/feed.xml/route.ts`** | The RSS feed. |
| `robots.ts` | **`app/robots.ts`** | robots.txt. |
| `indexnow-route.ts` | **`app/api/cron/indexnow/route.ts`** | Daily IndexNow ping (cron). |
| `scripts/add-internal-links.ts` | `lib/seo/scripts/add-internal-links.ts` | Internal-linking script (run by hand). |

You can delete the four drop-in copies left behind in `lib/seo/` afterwards.

The drop-ins import from `@/lib/seo/...`. That's the default import alias in
`create-next-app` projects. If your project has no `@/` alias (check `paths` in
`tsconfig.json`), change those imports to relative paths. If your app lives in
`src/app/`, put the kit in `src/lib/seo/` instead.

If your site uses a `[locale]` folder (e.g. `app/[locale]/blog/...`), the kit
still works — `sitemap.ts`, `robots.ts` and `feed.xml` stay at the top of `app/`,
outside `[locale]`.

Dependency: `@supabase/supabase-js` v2 (you probably already have it).

## 2. Fill in `config.ts`

The important settings:

- `siteName`, `blogDescription`
- `blogPath` — `/blog` unless your blog lives elsewhere
- `languages` / `defaultLanguage` — the codes you store in `blog_posts.language`
- `prefixDefaultLanguage` — `false` means English (default) posts are at
  `/blog/my-post` and others at `/fr/blog/mon-article`. `true` means every
  language gets a prefix (`/en/blog/...`). **This has to match how your site
  routes pages**, or the sitemap will point at 404s.
- `categoryPath` — e.g. `'/blog/topics'` if you have category pages, else `null`
- `publisher.logoUrl`, `defaultOgImage` (a 1200×630 image), `twitterHandle`
- `extraSitemapPaths` — your other pages (home, about, pricing…)
- `robotsDisallow` — paths crawlers should skip (`/api/` and `/admin` by default)

## 3. Environment variables

| Variable | Needed by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | everything | Your live URL, e.g. `https://example.com` — no trailing slash. Must be the **production** domain, even on preview deploys, or canonicals will point to the wrong place. |
| `NEXT_PUBLIC_SITE_NAME` | optional | Overrides the site name in config. |
| `NEXT_PUBLIC_SUPABASE_URL` | everything | From Supabase → Project Settings → API. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything | The **anon/public** key. |
| `CRON_SECRET` | IndexNow route | A long random string. Vercel sends it automatically on cron runs. |
| `INDEXNOW_KEY` | IndexNow route | See step 5. |
| `SUPABASE_SERVICE_ROLE_KEY` | internal-link script only | Needed to **write** posts. Server-side only — never `NEXT_PUBLIC_`, never in browser code. |

## 4. Let the public read published posts (Supabase RLS)

The kit reads with the anon key, so your database must allow anonymous reads of
published posts. **`supabase/migrations/0001_blog_schema.sql` in the main repo
already sets this up**; you only need the SQL below if you're using your own
tables instead:

```sql
alter table blog_posts enable row level security;
alter table blog_categories enable row level security;

create policy "Public reads published posts" on blog_posts
  for select to anon, authenticated using (status = 'published');

create policy "Public reads categories" on blog_categories
  for select to anon, authenticated using (true);
```

## 5. IndexNow + Vercel cron

1. Make a key: any 8–128 characters of letters, digits or `-`. A random 32-character
   hex string is typical (e.g. from an online UUID generator with the dashes removed).
   It is **public by design** — not a secret.
2. Set `INDEXNOW_KEY` to it.
3. Create **`public/<your-key>.txt`** containing only the key. After deploying,
   `https://yoursite.com/<your-key>.txt` must show it — that's how IndexNow
   checks you own the site.
4. Set `CRON_SECRET`.
5. Add the cron to **`vercel.json`** at your project root (create the file if needed):

```json
{
  "crons": [
    { "path": "/api/cron/indexnow", "schedule": "0 6 * * *" }
  ]
}
```

That runs daily at 06:00 UTC (daily is also all the Vercel Hobby plan allows).
Each run submits posts published or edited in the last 25 hours. To test it by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://yoursite.com/api/cron/indexnow
```

`200`/`202` from IndexNow = accepted (202 is normal the first time). `403` = the key
file isn't reachable. `422` = the URLs don't match your domain (check `NEXT_PUBLIC_SITE_URL`).

IndexNow covers Bing, Yandex, Seznam, Naver and others. **Google doesn't use it** —
submit `https://yoursite.com/sitemap.xml` once in Google Search Console and Google
will keep re-reading it. Do the same in Bing Webmaster Tools.

## 6. Wire up the post page

In `app/blog/[slug]/page.tsx` (Next 15/16, where `params` is a Promise):

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPostBySlug, getCategoriesForPost } from '@/lib/seo/supabase';
import { buildPostMetadata } from '@/lib/seo/metadata';
import { buildPostJsonLd } from '@/lib/seo/json-ld';
import { JsonLd } from '@/lib/seo/JsonLd';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();
  return buildPostMetadata(post);
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();
  const categories = await getCategoriesForPost(post);

  return (
    <article>
      <JsonLd data={buildPostJsonLd(post, categories)} />
      <h1>{post.title}</h1>
      {/* render post.content (markdown) here */}
    </article>
  );
}
```

On a multi-language site, also check that the URL's language matches
`post.language` and redirect to the canonical URL (`postPath(post.slug, post.language)`
from config) if not — otherwise the same post is reachable at several URLs.

For the blog index page: `export const metadata = buildBlogIndexMetadata();`
(or call it inside `generateMetadata` with the page's language).

**Render markdown safely.** If you use `react-markdown`, don't enable raw HTML
(`rehype-raw`) for AI-generated content unless you also sanitize it.

## 7. Internal links (optional, run by hand)

Make a CSV of link ideas:

```csv
source,keyword,target,context
my-first-post,email marketing,email-marketing-guide,
*,keyword research,keyword-research-basics,
```

- `source`: the post to edit (slug or URL), or `*` for "every post that mentions the keyword"
- `keyword`: the words to turn into a link
- `target`: a post slug, a path like `/pricing`, or a full URL on your site
- `context`: optional sentence to pick the right spot

Preview (changes nothing):

```bash
npx tsx --env-file=.env.local lib/seo/scripts/add-internal-links.ts links.csv
```

Happy with the preview? Write it:

```bash
npx tsx --env-file=.env.local lib/seo/scripts/add-internal-links.ts links.csv --apply
```

It never links inside headings, existing links, images or code, never links a post
to itself, skips posts that already link to the target, links each keyword once
per post, and adds at most 3 new links per post per run (`--max-per-post=N`).
Every run writes `internal-links-report-<date>.json`. Changed posts get a new
`last_modified` (so the sitemap and IndexNow pick them up); add `--keep-dates`
to skip that.

## Good to know

- **Dates are kept honest.** A post counts as "updated" only if `last_modified`
  is on a *later day* than `published_at`. Pipelines often stamp both within
  milliseconds; advertising that as an update teaches Google to ignore your dates.
- **The sitemap and feed refresh hourly** (`revalidate = 3600`), so a new post shows
  up within an hour.
- **hreflang:** each post declares its own language. The schema has no column
  linking translations of the same article, so posts aren't grouped across
  languages by default. If you add translations, pass them to
  `buildPostMetadata(post, { translations: [...] })`.
- **FAQ markup** is generated when a post has a `## FAQ` (or "Frequently Asked
  Questions") section with `###` questions under it. Google shows FAQ rich results
  only for a few sites nowadays, but the markup is harmless and AI search engines read it.
- **Over 50,000 posts?** Split the sitemap with Next's `generateSitemaps`. Until then, one file is fine.
