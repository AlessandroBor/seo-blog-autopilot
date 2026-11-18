import { z } from "zod";
import { LANGUAGES, siteConfig, type Language } from "@/config/site.config";
import { analyzeSerp } from "./serp";
import { models, structured, text } from "./llm";
import * as P from "./prompts";
import type { TitleResult } from "./types";

const SearchIntentSchema = z.object({
  search_intent: z
    .string()
    .describe("A short 2-3 sentence explanation of the most probable search intent."),
});

const TitlesSchema = z.object({
  titles: z.array(z.string().describe("An SEO optimized title.")),
});

const AuditSchema = z.object({
  audits: z.array(
    z.object({
      title: z.string(),
      language: z.object({ passed: z.boolean(), issue: z.string().optional() }),
      readability: z.object({ passed: z.boolean(), issue: z.string().optional() }),
      relevance: z.object({ passed: z.boolean(), issue: z.string().optional() }),
      overall_passed: z.boolean(),
      suggested_fix: z.string().optional(),
    }),
  ),
});

const RewriteSchema = z.object({ title: z.string() });

const MAX = siteConfig.maxTitleLength;

/** Strips "1. ", "2) ", "- " style prefixes models sometimes add. */
const cleanTitle = (t: string) => t.replace(/^\s*(\d+\s*[.):\-]?|[-*•])\s*/, "").trim();

/** Last resort: cut at a word boundary. */
function truncate(title: string): string {
  if (title.length <= MAX) return title;
  const cut = title.slice(0, MAX - 3);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > MAX * 0.6 ? cut.slice(0, lastSpace) : cut) + "...";
}

async function auditTitles(titles: string[], keyword: string, searchIntent: string) {
  const { audits } = await structured({
    schema: AuditSchema,
    name: "title_audit",
    messages: [
      { role: "system", content: P.titleAuditSystem(keyword, searchIntent) },
      { role: "user", content: `Audit these titles:\n${JSON.stringify(titles, null, 2)}` },
    ],
  });

  return titles.map((title, i) => {
    const a = audits[i];
    const issues: string[] = [];
    // Length is a hard rule: checked in code, never trusted to the model.
    if (title.length > MAX) issues.push(`Title is ${title.length} chars (max ${MAX})`);
    if (a && !a.language.passed && a.language.issue) issues.push(`Language: ${a.language.issue}`);
    if (a && !a.readability.passed && a.readability.issue) issues.push(`Readability: ${a.readability.issue}`);
    if (a && !a.relevance.passed && a.relevance.issue) issues.push(`Relevance: ${a.relevance.issue}`);
    return { title, passed: title.length <= MAX && (a?.overall_passed ?? true), issues };
  });
}

async function rewriteTitle(keyword: string, searchIntent: string, failed: string, issues: string[]) {
  const { title } = await structured({
    schema: RewriteSchema,
    name: "rewritten_title",
    model: models.reasoning,
    messages: [
      { role: "system", content: P.titleRewriteSystem(keyword, searchIntent, MAX) },
      {
        role: "user",
        content: `The following title failed quality audit:\n"${failed}"\n\nIssues found:\n${issues
          .map((i) => `- ${i}`)
          .join("\n")}\n\nGenerate a single improved title that fixes these issues while staying under ${MAX} characters.`,
      },
    ],
  });
  return cleanTitle(title);
}

/**
 * Stage 1-4 of the pipeline:
 *   SERP + LSI research -> search intent -> planned prompt -> 5 titles -> audit/rewrite loop.
 */
export async function researchAndTitles(keyword: string, language: Language): Promise<TitleResult> {
  const serp = await analyzeSerp(keyword);

  const { search_intent: searchIntent } = await structured({
    schema: SearchIntentSchema,
    name: "search_intent",
    messages: [
      { role: "system", content: P.searchIntentSystem(keyword) },
      { role: "user", content: JSON.stringify(serp.titles, null, 2) },
    ],
  });

  const planPrompt = await text({
    messages: [{ role: "user", content: P.titlePlanner(keyword, searchIntent) }],
  });
  if (!planPrompt) throw new Error("Title planner returned an empty prompt.");

  const generated = await structured({
    schema: TitlesSchema,
    name: "titles",
    messages: [{ role: "user", content: planPrompt + P.titleWriterTail(LANGUAGES[language], MAX) }],
  });
  let titles = generated.titles.map(cleanTitle).filter(Boolean).slice(0, 5);
  if (titles.length === 0) throw new Error("Title generation returned no titles.");

  for (let round = 0; round < siteConfig.titleAuditRounds; round++) {
    const results = await auditTitles(titles, keyword, searchIntent);
    const failed = results.filter((r) => !r.passed);
    console.log(`[titles] audit round ${round + 1}: ${failed.length}/${titles.length} failed`);
    if (failed.length === 0) break;

    titles = await Promise.all(
      results.map(async (r) => {
        if (r.passed) return r.title;
        try {
          return truncate(await rewriteTitle(keyword, searchIntent, r.title, r.issues));
        } catch (err) {
          console.error("[titles] rewrite failed, truncating original:", err);
          return truncate(r.title);
        }
      }),
    );
  }

  titles = titles.map(truncate);

  return {
    keyword,
    serpTitles: serp.titles,
    searchIntent,
    keywords: serp.keywords,
    keyphrases: serp.keyphrases,
    lsis: [...serp.keyphrases.map((p) => p.phrase), ...serp.keywords.map((k) => k.term)],
    titles,
  };
}
