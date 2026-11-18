/**
 * SERP research: what is already ranking for the keyword, and which terms do
 * those pages share? Those shared terms (LSI keywords) get woven into the
 * article so it covers the topic as thoroughly as the current top 10.
 */
import * as cheerio from "cheerio";
// natural has no bundled ESM types worth fighting with; it is server-only.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const natural = require("natural");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const stopwords: string[] = require("natural/lib/natural/util/stopwords").words;

/** Extra words that kept ranking high but carry no topical meaning. Extend for your niche. */
const CUSTOM_STOPWORDS = new Set([
  "center", "annual", "together", "especially", "learn", "enter", "chapter",
  "ever", "helps", "click", "read", "more", "cookie", "cookies", "privacy",
  "subscribe", "newsletter", "share", "menu", "login", "sign",
]);
const STOP = new Set(stopwords);

interface SearchItem {
  title: string;
  link: string;
}

async function googleSearch(keyword: string): Promise<SearchItem[]> {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!key || !cx) throw new Error("Missing GOOGLE_API_KEY or GOOGLE_SEARCH_ENGINE_ID.");

  const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(keyword)}&key=${key}&cx=${cx}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Google Custom Search failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { items?: SearchItem[] };
  return data.items ?? [];
}

async function scrapeContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BlogResearch/1.0)" },
    });
    if (!res.ok) return "";
    const $ = cheerio.load(await res.text());
    $("script, style, noscript, iframe, nav, footer, header, aside, form, .comments").remove();
    const text = $("article, main, .post, .content, p").text().replace(/\s+/g, " ").trim();
    return text.length > 100 ? text : "";
  } catch {
    return ""; // timeouts, blocked bots, TLS errors: just skip that page
  }
}

function tokenize(text: string): string[] {
  const tokenizer = new natural.WordTokenizer();
  return (tokenizer.tokenize(text.toLowerCase()) as string[]).filter(
    (t) => t.length > 2 && !STOP.has(t) && !CUSTOM_STOPWORDS.has(t) && !/\d/.test(t),
  );
}

export function extractLSIKeywords(documents: string[]) {
  const tfidf = new natural.TfIdf();
  const docsTokens = documents.map(tokenize).filter((t) => t.length > 0);
  docsTokens.forEach((tokens) => tfidf.addDocument(tokens.join(" ")));

  // Sum each term's TF-IDF across all ranking pages.
  const termScores = new Map<string, number>();
  docsTokens.forEach((_, i) => {
    tfidf.listTerms(i).forEach((item: { term: string; tfidf: number }) => {
      termScores.set(item.term, (termScores.get(item.term) ?? 0) + item.tfidf);
    });
  });

  // Count 2- and 3-word phrases across pages.
  const phraseScores = new Map<string, number>();
  docsTokens.forEach((tokens) => {
    const grams: string[][] = [...natural.NGrams.bigrams(tokens), ...natural.NGrams.trigrams(tokens)];
    grams.forEach((g) => {
      const phrase = g.join(" ");
      phraseScores.set(phrase, (phraseScores.get(phrase) ?? 0) + 1);
    });
  });

  const keywords = [...termScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([term, score]) => ({ term, score }));

  const keyphrases = [...phraseScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([phrase, frequency]) => ({ phrase, frequency }));

  return { keywords, keyphrases };
}

/** Google top 10 -> scrape each page -> TF-IDF terms + frequent phrases. */
export async function analyzeSerp(keyword: string) {
  const results = await googleSearch(keyword);
  const documents = await Promise.all(results.map((r) => scrapeContent(r.link)));
  const scraped = documents.filter(Boolean);
  console.log(`[serp] "${keyword}": ${results.length} results, ${scraped.length} pages scraped`);
  return {
    titles: results.map((r) => r.title),
    ...extractLSIKeywords(scraped),
  };
}
