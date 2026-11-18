/**
 * Public, read-only Supabase access for the blog.
 *
 * Uses the ANON key, so it is safe on the server and in the browser. Your
 * database must allow anonymous reads of published posts (a Row Level
 * Security policy — see README). Never put the service-role key in here.
 *
 * Every helper filters to what the public may see:
 *   status = 'published'  (drafts and 'draft_error' rows never leak)
 *   noindex = false       (for lists, sitemap, feed, IndexNow)
 * getPostBySlug() is the one exception on noindex: a noindex post still has a
 * page (people can visit it), it just tells search engines not to index it.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  content: string | null;
  meta_description: string | null;
  status: 'draft' | 'published' | 'draft_error';
  language: string | null;
  featured_image: string | null;
  categories: number[] | null;
  tip: string | null;
  noindex: boolean;
  source: string | null;
  created_at: string;
  published_at: string | null;
  last_modified: string | null;
}

export interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  h1: string | null;
  markdown_intro: string | null;
  created_at: string;
}

/** The light columns most list views need (no `content`, which is large). */
export type PostSummary = Pick<
  BlogPost,
  | 'id'
  | 'title'
  | 'slug'
  | 'meta_description'
  | 'language'
  | 'featured_image'
  | 'categories'
  | 'published_at'
  | 'last_modified'
  | 'created_at'
>;

const SUMMARY_COLUMNS =
  'id, title, slug, meta_description, language, featured_image, categories, published_at, last_modified, created_at';

let client: SupabaseClient | null = null;

export function getPublicSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return client;
}

// Supabase (PostgREST) returns at most 1000 rows per request by default, and
// silently — a blog with 1,200 posts would lose 200 from the sitemap. Page
// through explicitly instead.
const PAGE_SIZE = 1000;
const SAFETY_CAP = 50_000; // Google's per-sitemap URL limit

export interface GetPostsOptions {
  /** Only posts in this language. Omit for all languages. */
  language?: string;
  /** Only posts in this category id. */
  categoryId?: number;
  /** Max posts to return (newest first). Omit for all. */
  limit?: number;
}

/** Published, indexable posts, newest first. */
export async function getPublishedPosts(
  options: GetPostsOptions = {}
): Promise<PostSummary[]> {
  const supabase = getPublicSupabase();
  const max = Math.min(options.limit ?? SAFETY_CAP, SAFETY_CAP);
  let posts: PostSummary[] = [];

  for (let offset = 0; offset < max; offset += PAGE_SIZE) {
    const end = Math.min(offset + PAGE_SIZE, max) - 1;
    let query = supabase
      .from('blog_posts')
      .select(SUMMARY_COLUMNS)
      .eq('status', 'published')
      .eq('noindex', false)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false }) // stable order across pages
      .range(offset, end);
    if (options.language) query = query.eq('language', options.language);
    if (options.categoryId !== undefined) {
      query = query.contains('categories', [options.categoryId]);
    }

    const { data, error } = await query;
    if (error) throw new Error(`getPublishedPosts: ${error.message}`);
    if (!data || data.length === 0) break;
    posts = posts.concat(data as PostSummary[]);
    if (data.length < end - offset + 1) break;
  }
  return posts;
}

/**
 * One published post by slug (full content), or null. Includes noindex posts
 * — check `post.noindex` and let buildPostMetadata() emit the robots tag.
 */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const { data, error } = await getPublicSupabase()
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw new Error(`getPostBySlug: ${error.message}`);
  return (data as BlogPost | null) ?? null;
}

/** All categories (small table, one request). */
export async function getCategories(): Promise<BlogCategory[]> {
  const { data, error } = await getPublicSupabase()
    .from('blog_categories')
    .select('*')
    .order('name');
  if (error) throw new Error(`getCategories: ${error.message}`);
  return (data as BlogCategory[]) ?? [];
}

/** The categories of one post, in the post's own order. */
export async function getCategoriesForPost(
  post: Pick<BlogPost, 'categories'>
): Promise<BlogCategory[]> {
  const ids = post.categories ?? [];
  if (ids.length === 0) return [];
  const { data, error } = await getPublicSupabase()
    .from('blog_categories')
    .select('*')
    .in('id', ids);
  if (error) throw new Error(`getCategoriesForPost: ${error.message}`);
  const byId = new Map((data as BlogCategory[]).map((c) => [c.id, c]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Indexable posts published or edited since `sinceIso` (used by IndexNow). */
export async function getPostsChangedSince(
  sinceIso: string
): Promise<Pick<BlogPost, 'slug' | 'language'>[]> {
  const { data, error } = await getPublicSupabase()
    .from('blog_posts')
    .select('slug, language')
    .eq('status', 'published')
    .eq('noindex', false)
    .or(`published_at.gte.${sinceIso},last_modified.gte.${sinceIso}`);
  if (error) throw new Error(`getPostsChangedSince: ${error.message}`);
  return (data as Pick<BlogPost, 'slug' | 'language'>[]) ?? [];
}

// ── Dates ────────────────────────────────────────────────────────────────────

/**
 * True when the post was genuinely revised on a LATER calendar day than it
 * was published. Automated pipelines often stamp last_modified a few
 * milliseconds after published_at; advertising that as an "update" is fake
 * freshness, and search engines learn to ignore a site's dates when they
 * see it. Only a later day counts.
 */
export function hasMeaningfulUpdate(
  post: Pick<BlogPost, 'published_at' | 'last_modified'>
): boolean {
  const pub = post.published_at;
  const mod = post.last_modified;
  if (!pub || !mod) return false;
  return new Date(mod).toISOString().slice(0, 10) >
    new Date(pub).toISOString().slice(0, 10);
}

/** ISO date the post was published (falls back to created_at). */
export function postPublishedDate(
  post: Pick<BlogPost, 'published_at' | 'created_at'>
): string {
  return new Date(post.published_at ?? post.created_at).toISOString();
}

/** ISO "last modified" date: the revision date if meaningful, else published. */
export function postModifiedDate(
  post: Pick<BlogPost, 'published_at' | 'last_modified' | 'created_at'>
): string {
  if (hasMeaningfulUpdate(post) && post.last_modified) {
    return new Date(post.last_modified).toISOString();
  }
  return postPublishedDate(post);
}
