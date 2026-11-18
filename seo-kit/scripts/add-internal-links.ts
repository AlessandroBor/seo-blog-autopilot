/**
 * Add internal links to blog posts from a CSV of link ideas.
 *
 * Internal links (one of your posts linking to another) help search engines
 * discover pages and understand what each one is about, and keep readers on
 * your site. This script inserts them into the markdown of your posts in
 * Supabase — carefully, and only where it's safe.
 *
 * DRY RUN BY DEFAULT: it prints what it WOULD change and writes a JSON report.
 * Nothing is saved until you add --apply.
 *
 * Run (from your project root, with your env file):
 *   npx tsx --env-file=.env.local lib/seo/scripts/add-internal-links.ts links.csv
 *   npx tsx --env-file=.env.local lib/seo/scripts/add-internal-links.ts links.csv --apply
 *
 * Options:
 *   --apply            actually write the changes to the database
 *   --dry-run          (default) preview only
 *   --max-per-post=N   max links added to any one post in this run (default 3)
 *   --keep-dates       don't bump last_modified when a post is changed
 *
 * CSV format (comma or tab separated, header row required, names are
 * case-insensitive):
 *
 *   source,keyword,target,context
 *   my-first-post,email marketing,/blog/email-marketing-guide,
 *   *,keyword research,keyword-research-basics,
 *   https://example.com/blog/seo-tips,link building,https://example.com/blog/link-building,"Good link building takes time"
 *
 *   source   slug or full URL of the post to edit. "*" (or empty) = every
 *            published post in the target's language that mentions the keyword.
 *   keyword  the exact words to turn into a link (matched case-insensitively,
 *            whole words only; the original capitalization is kept)
 *   target   where the link goes: a post slug, a site path ("/pricing") or a
 *            full URL on your site
 *   context  optional: a sentence from the post, to pick the right occurrence
 *
 * Exports from SEO tools' "internal link opportunities" reports also work:
 * the columns "Source page", "Keyword", "Target page" and "Keyword context"
 * are recognized automatically.
 *
 * Safety rules — a keyword is never linked when it is:
 *   inside a heading, an existing link or image, inline code or a code block,
 *   a raw URL or an HTML tag; or when the post already links to the target;
 *   or when the target is the post itself. Each keyword is linked once per post.
 *
 * Needs: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * (writes need the service-role key — keep it out of client code), and
 * NEXT_PUBLIC_SITE_URL so full URLs can be recognized as your own.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { SITE_URL, postPath, resolveLanguage } from '../config';

// ── CLI ──────────────────────────────────────────────────────────────────────

interface Options {
  csvPath: string;
  apply: boolean;
  maxPerPost: number;
  keepDates: boolean;
}

function parseArgs(argv: string[]): Options {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flag = (name: string) => argv.includes(`--${name}`);
  const value = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

  if (positional.length === 0) {
    console.error('Usage: add-internal-links.ts <links.csv> [--apply] [--max-per-post=3] [--keep-dates]');
    process.exit(1);
  }
  const maxPerPost = Number(value('max-per-post') ?? 3);
  return {
    csvPath: positional[0],
    apply: flag('apply') && !flag('dry-run'),
    maxPerPost: Number.isFinite(maxPerPost) && maxPerPost > 0 ? maxPerPost : 3,
    keepDates: flag('keep-dates')
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

interface LinkRow {
  source: string; // slug, URL, or "*"
  keyword: string;
  target: string;
  context: string;
}

/** Split one CSV line, honoring "quoted, values" and "" escapes. */
function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

const HEADER_ALIASES: Record<keyof LinkRow, string[]> = {
  source: ['source', 'source page', 'source url', 'source slug'],
  keyword: ['keyword', 'anchor', 'anchor text'],
  target: ['target', 'target page', 'target url', 'target slug'],
  context: ['context', 'keyword context']
};

function readCsv(filePath: string): LinkRow[] {
  // Strip a BOM (spreadsheet exports often add one) and split lines.
  const text = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('CSV has no data rows');

  const delimiter =
    (lines[0].match(/\t/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? '\t' : ',';
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase());
  const col = (field: keyof LinkRow) =>
    headers.findIndex((h) => HEADER_ALIASES[field].includes(h));

  const idx = {
    source: col('source'),
    keyword: col('keyword'),
    target: col('target'),
    context: col('context')
  };
  if (idx.keyword === -1 || idx.target === -1) {
    throw new Error(
      `CSV needs at least "keyword" and "target" columns. Found: ${headers.join(', ')}`
    );
  }

  return lines.slice(1).map((line) => {
    const v = parseCsvLine(line, delimiter);
    const get = (i: number) => (i >= 0 ? (v[i] ?? '').trim() : '');
    return {
      source: get(idx.source) || '*',
      keyword: get(idx.keyword),
      target: get(idx.target),
      context: get(idx.context)
    };
  });
}

// ── Database ─────────────────────────────────────────────────────────────────

interface Post {
  id: number;
  slug: string;
  title: string;
  language: string | null;
  content: string | null;
}

function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchPublishedPosts(supabase: SupabaseClient): Promise<Post[]> {
  const PAGE = 1000;
  let all: Post[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, slug, title, language, content')
      .eq('status', 'published')
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data as Post[]);
    if (data.length < PAGE) break;
  }
  return all;
}

// ── URL helpers ──────────────────────────────────────────────────────────────

const SITE_HOST = new URL(SITE_URL).host;

/** "https://site/fr/blog/my-post" or "/blog/my-post" or "my-post" → "my-post". */
function slugFrom(ref: string): string {
  let p = ref.trim();
  if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
  return p.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? '';
}

/**
 * Turn a CSV target into the href to write into markdown. Your own URLs
 * become root-relative paths (they survive a domain change); a bare slug
 * becomes that post's canonical path.
 */
function resolveTarget(
  target: string,
  postsBySlug: Map<string, Post>
): { href: string; post: Post | null } | null {
  const t = target.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    const u = new URL(t);
    if (u.host !== SITE_HOST) return null; // external links aren't internal links
    const post = postsBySlug.get(slugFrom(t)) ?? null;
    return { href: `${u.pathname}${u.search}${u.hash}`, post };
  }
  if (t.startsWith('/')) {
    return { href: t, post: postsBySlug.get(slugFrom(t)) ?? null };
  }
  const post = postsBySlug.get(t);
  if (!post) return null;
  return { href: postPath(post.slug, resolveLanguage(post.language)), post };
}

// ── Markdown editing ─────────────────────────────────────────────────────────

/** Character ranges where a link must never be inserted. */
function protectedRanges(md: string): Array<[number, number]> {
  const patterns = [
    /```[\s\S]*?```|~~~[\s\S]*?~~~/g, // fenced code blocks
    /`[^`\n]+`/g, // inline code
    /!?\[[^\]]*\]\([^)]*\)/g, // existing links and images
    /!?\[[^\]]*\]\[[^\]]*\]/g, // reference-style links
    /^\s*\[[^\]]+\]:.*$/gm, // reference definitions
    /^\s{0,3}#{1,6}\s.*$/gm, // headings
    /<[^>\n]+>/g, // HTML tags / autolinks
    /https?:\/\/\S+/g // bare URLs
  ];
  const ranges: Array<[number, number]> = [];
  for (const re of patterns) {
    for (const m of md.matchAll(re)) {
      ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    }
  }
  return ranges;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True if the markdown already contains a link to this href. */
function alreadyLinksTo(md: string, href: string): boolean {
  const re = new RegExp(`\\]\\(\\s*(?:https?://[^/)]+)?${escapeRegExp(href)}/?(?:[?#][^)]*)?\\s*\\)`, 'i');
  return re.test(md);
}

interface Insertion {
  newContent: string;
  before: string;
  after: string;
}

/**
 * Link the first safe, whole-word occurrence of `keyword` (inside `context`
 * if given and found). Returns null when there is no safe occurrence.
 */
function insertLink(md: string, keyword: string, href: string, context: string): Insertion | null {
  const ranges = protectedRanges(md);
  const isProtected = (start: number, end: number) =>
    ranges.some(([a, b]) => start < b && end > a);

  // Whole words only, in any script: "seo" must not match inside "seoul".
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegExp(keyword)}(?![\\p{L}\\p{N}_])`,
    'giu'
  );

  let windowStart = 0;
  let windowEnd = md.length;
  if (context) {
    const at = md.indexOf(context);
    if (at !== -1) {
      windowStart = at;
      windowEnd = at + context.length;
    }
  }

  for (const m of md.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (start < windowStart || end > windowEnd || isProtected(start, end)) continue;
    const linked = `[${m[0]}](${href})`;
    const newContent = md.slice(0, start) + linked + md.slice(end);
    const s = Math.max(0, start - 40);
    return {
      newContent,
      before: md.slice(s, end + 40).replace(/\s+/g, ' '),
      after: newContent.slice(s, start + linked.length + 40).replace(/\s+/g, ' ')
    };
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface ReportEntry {
  source: string;
  keyword: string;
  href: string;
  status: 'planned' | 'applied' | 'skipped' | 'error';
  reason?: string;
  before?: string;
  after?: string;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`\nInternal links — ${opts.apply ? 'APPLY (writing to database)' : 'DRY RUN (no changes saved)'}`);
  console.log(`CSV: ${opts.csvPath}\n`);

  const rows = readCsv(opts.csvPath).filter((r) => r.keyword && r.target);
  const supabase = getAdminClient();
  const posts = await fetchPublishedPosts(supabase);
  const postsBySlug = new Map(posts.map((p) => [p.slug, p]));
  console.log(`${rows.length} link rows, ${posts.length} published posts\n`);

  const edited = new Map<number, string>(); // post id → new content
  const addedPerPost = new Map<number, number>();
  const report: ReportEntry[] = [];

  for (const row of rows) {
    const resolved = resolveTarget(row.target, postsBySlug);
    if (!resolved) {
      report.push({ source: row.source, keyword: row.keyword, href: row.target, status: 'skipped', reason: 'target not found or not on this site' });
      continue;
    }
    const { href, post: targetPost } = resolved;

    // Which posts to edit: one named post, or every post (same language as
    // the target post, when the target is a post) for "*".
    const wildcard = row.source === '*';
    const sources: Post[] = wildcard
      ? posts.filter(
          (p) =>
            !targetPost ||
            resolveLanguage(p.language) === resolveLanguage(targetPost.language)
        )
      : [postsBySlug.get(slugFrom(row.source))].filter((p): p is Post => Boolean(p));

    if (sources.length === 0) {
      report.push({ source: row.source, keyword: row.keyword, href, status: 'skipped', reason: 'source post not found (or not published)' });
      continue;
    }

    for (const post of sources) {
      const skip = (reason: string) => {
        // For "*" rows, only report real hits — not every post that lacks the keyword.
        if (!wildcard) report.push({ source: post.slug, keyword: row.keyword, href, status: 'skipped', reason });
      };
      if (targetPost && targetPost.id === post.id) { skip('target is the post itself'); continue; }
      if ((addedPerPost.get(post.id) ?? 0) >= opts.maxPerPost) { skip(`already ${opts.maxPerPost} new links in this post`); continue; }

      const content = edited.get(post.id) ?? post.content ?? '';
      if (alreadyLinksTo(content, href)) { skip('post already links to target'); continue; }

      const result = insertLink(content, row.keyword, href, wildcard ? '' : row.context);
      if (!result) { skip('no safe, unlinked occurrence of the keyword'); continue; }

      edited.set(post.id, result.newContent);
      addedPerPost.set(post.id, (addedPerPost.get(post.id) ?? 0) + 1);
      report.push({ source: post.slug, keyword: row.keyword, href, status: 'planned', before: result.before, after: result.after });
      console.log(`+ ${post.slug}: "${row.keyword}" → ${href}`);
      console.log(`    before: …${result.before}…`);
      console.log(`    after:  …${result.after}…`);
    }
  }

  const planned = report.filter((r) => r.status === 'planned').length;
  console.log(`\n${planned} link(s) planned across ${edited.size} post(s); ${report.filter((r) => r.status === 'skipped').length} skipped.`);

  if (opts.apply && edited.size > 0) {
    console.log('\nWriting changes...');
    for (const [id, content] of edited) {
      const slug = posts.find((p) => p.id === id)?.slug ?? String(id);
      const update: { content: string; last_modified?: string } = { content };
      if (!opts.keepDates) update.last_modified = new Date().toISOString();
      const { error } = await supabase.from('blog_posts').update(update).eq('id', id);
      for (const entry of report) {
        if (entry.source === slug && entry.status === 'planned') {
          entry.status = error ? 'error' : 'applied';
          if (error) entry.reason = error.message;
        }
      }
      console.log(`${error ? 'FAILED' : 'updated'}: ${slug}${error ? ` (${error.message})` : ''}`);
    }
  } else if (!opts.apply && planned > 0) {
    console.log('\nDry run — nothing was saved. Re-run with --apply to write these changes.');
  }

  const reportPath = path.resolve(`internal-links-report-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report: ${reportPath}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
