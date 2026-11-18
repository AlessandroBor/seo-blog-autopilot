/**
 * The one file to edit when adapting this system to a new website.
 * Everything brand- or niche-specific lives here; the engine reads it.
 */

export const LANGUAGES = {
  en: "English",
  es: "Español",
  pt: "Português",
  it: "Italiano",
  fr: "Français",
  de: "Deutsch",
  ca: "Català",
} as const;

export type Language = keyof typeof LANGUAGES;

export const siteConfig = {
  /** Shown in the admin header. */
  name: "My Blog",

  /** Default language for new keywords. Must be a key of LANGUAGES. */
  defaultLanguage: "en" as Language,

  /**
   * One or two sentences about the site. Given to the writer so articles stay
   * on-topic for YOUR niche. Leave empty for fully neutral articles.
   */
  businessContext: "",

  /** Generated featured/body images: a white icon on this background colour. */
  imageBackground: "#2563EB",
  imageSize: { width: 1920, height: 1080 },
  iconSize: 328,

  /** Supabase Storage bucket for generated and uploaded images (public). */
  storageBucket: "blog-images",

  /** Hard cap on title length (characters). Longer titles get rewritten. */
  maxTitleLength: 72,

  /** How many audit -> rewrite rounds titles get before falling back to truncation. */
  titleAuditRounds: 2,

  /** Max categories the AI may assign per post. */
  maxCategoriesPerPost: 2,

  /** How many keywords one cron run processes. Keep at 1 on Vercel Hobby (time limits). */
  keywordsPerCronRun: 1,

  /** A keyword that failed this many times is parked as "failed" instead of retried. */
  maxKeywordAttempts: 3,
} as const;
