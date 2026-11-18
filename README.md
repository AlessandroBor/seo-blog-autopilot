# SEO Blog Autopilot

Drop keywords into a queue. Every day, the system researches what already ranks
on Google for the next keyword, writes a better-structured article around it,
illustrates it, categorises it, and saves it to your database as a draft (or
publishes it, if you trust it).

It has two halves:

| Part | What it is | Where it runs |
|---|---|---|
| **This app** (root folder) | Admin panel + generation engine + daily cron | Its own Vercel project, e.g. `blog-admin.yoursite.com` |
| **`seo-kit/`** | Sitemap, RSS, JSON-LD, meta tags, IndexNow, robots, internal links | Copied into **your public website** |

Both read and write the same Supabase database.

---

## How one article is made

```
keyword
  │
  ├─ 1. SERP research   Google top 10 → scrape each page → TF-IDF terms + common 2–3 word phrases (LSI keywords)
  ├─ 2. Search intent   LLM reads the 10 ranking titles: "what does this searcher actually want?"
  ├─ 3. Titles          LLM writes a tailored brief → 5 titles → strict audit (language, readability,
  │                     relevance, ≤72 chars) → failed titles rewritten by a reasoning model (2 rounds)
  ├─ 4. Outline         sections, H2–H4 hierarchy, word targets, LSI keywords assigned per section,
  │                     meta description
  ├─ 5. Writing         every section written in parallel with its required keywords
  │                     → one Markdown repair pass → markdownlint auto-fix → em dashes removed
  ├─ 6. Images          LLM picks a matching icon → rendered on your brand colour (1920×1080)
  │                     → vision model writes alt text → uploaded to Supabase Storage
  │                     (one featured image + one placed mid-article)
  ├─ 7. Enrichment      up to 2 categories picked from yours, a 60-word "pro tip", unique slug
  └─ 8. Save            draft, or published if AUTO_PUBLISH=true AND the quality gate passes
```

All the prompts live in [`lib/engine/prompts.ts`](lib/engine/prompts.ts), so you can tune
the voice without touching pipeline code.

---

## Setup (about 20 minutes)

### 1. Accounts you need

- **Supabase** (free tier is fine): https://supabase.com
- **An LLM API**: any OpenAI-compatible provider. The defaults are for **xAI Grok**
  (`grok-4-fast-*`: cheap and fast, about one to a few cents per article). OpenAI or OpenRouter work too; just change the
  `LLM_*` variables.
- **Google Programmable Search** (100 free searches/day, one per article):
  1. Create a search engine at https://programmablesearchengine.google.com and set it to **"Search the entire web"**. Copy the *Search engine ID*.
  2. In Google Cloud Console, enable **Custom Search API** and create an API key.
- **Vercel** for hosting + the daily cron.

### 2. Database

In Supabase, open **SQL Editor**, paste the whole of
[`supabase/migrations/0001_blog_schema.sql`](supabase/migrations/0001_blog_schema.sql), and click **Run**.

That creates the tables, the queue logic, read-only public access to published posts,
the `blog-images` storage bucket, and three starter categories.

### 3. Configure

1. `cp .env.example .env.local` and fill in every value (the file explains each one).
2. Edit [`config/site.config.ts`](config/site.config.ts): your site name, default language,
   image colour, and **`businessContext`**, a sentence about your site so the
   articles stay relevant to your niche.
3. In the admin's **Categories** page, replace the starter categories with your own.
   Write a real description for each one, because the AI uses it to pick categories.

### 4. Run it

```bash
npm install
npm run build && npm start      # production build on http://localhost:3000
```

Log in with `ADMIN_PASSWORD`.

> `npm run dev` works for editing UI, but always test with `build && start`.
> Dev mode hides production-only bugs.

### 5. Deploy

1. Push this repo to GitHub, then import it in Vercel.
2. Add every variable from `.env.local` in **Vercel → Settings → Environment Variables**.
3. Deploy. `vercel.json` registers the cron (`/api/cron/process-queue`, daily at 09:00 UTC).
   Vercel automatically sends your `CRON_SECRET` with each cron call.

On the **Hobby** plan crons run at most once a day. On **Pro** you can change the
schedule (e.g. `"0 */6 * * *"` = 4 posts/day) or raise `keywordsPerCronRun`.

### 6. Show the posts on your website

Follow [`seo-kit/README.md`](seo-kit/README.md). It covers the post page, sitemap, RSS,
structured data, IndexNow and internal links.

---

## Daily use

| Page | What you do there |
|---|---|
| **Keyword queue** | Paste keywords (one per line, pick a language). Reorder, retry failures. |
| **Generate** | Manual mode: pick the title yourself and edit the outline before it writes. |
| **Posts** | Review drafts, bulk publish/unpublish. Click a post to edit Markdown with live preview. |
| **Dashboard** | Counts, plus **Run next keyword now** so you don't have to wait for the cron. |

Or from a terminal: `npm run generate -- "your keyword" en`.

### Picking keywords

The engine writes well for any keyword, but rankings come from choosing the *right*
ones: specific, long-tail, informational queries ("how to fix a squeaky door hinge")
where the current top results are weak. Avoid head terms ("doors") and commercial
"best X" keywords dominated by big sites.

### Auto-publish

Start with `AUTO_PUBLISH=false` and read the first 10–20 drafts. When you're happy,
switch it on. Every post is still checked by the quality gate in
[`lib/engine/quality.ts`](lib/engine/quality.ts) (length, empty sections, meta description),
and anything that fails stays a draft. Tighten those rules for your site.

---

## Project map

```
config/site.config.ts       ← edit me: brand, languages, limits
lib/engine/
  pipeline.ts               the whole flow, start here
  serp.ts                   Google search, scraping, TF-IDF LSI extraction
  titles.ts                 search intent, title generation, audit/rewrite loop
  outline.ts                outline + heading hierarchy fix
  writer.ts                 parallel section writing, Markdown repair, lint auto-fix
  images.ts                 icon images, alt text, upload
  enrich.ts                 categories, tip, slug
  quality.ts                auto-publish gate
  queue.ts                  claims queued keywords and runs the pipeline
  prompts.ts                every prompt in one place
  llm.ts                    OpenAI-compatible client, retries, structured output
app/                        admin UI + API routes (cron, generate, auth)
proxy.ts                    password-protects the whole admin
supabase/migrations/        database schema
seo-kit/                    public-site SEO modules
```

## Costs (rough)

Per article: about 10–14 LLM calls on a fast model (a few cents at most), 1 Google search
(free up to 100/day), and two small PNGs in Supabase Storage.

## Troubleshooting

- **Keyword stuck on "failed"**: hover the error in the queue. Usually a missing/invalid API key or
  Google quota. Fix it, then click **Retry**.
- **Cron returns 401**: `CRON_SECRET` isn't set in Vercel, or was changed after the cron was created.
- **No images / alt text says "illustration"**: your `LLM_MODEL_VISION` doesn't accept images; pick one that does.
- **Function timeout**: one article needs up to ~3 minutes. On Vercel make sure Fluid Compute is on (the default
  for new projects) so `maxDuration = 300` is honoured.
