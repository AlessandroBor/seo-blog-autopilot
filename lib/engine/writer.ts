import { z } from "zod";
import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/sync";
import { LANGUAGES } from "@/config/site.config";
import { structured } from "./llm";
import * as P from "./prompts";
import type { Outline, Section } from "./types";

const SectionSchema = z.object({
  body: z.string().describe("Markdown formatted body text for the section."),
});
const MarkdownSchema = z.object({
  markdown: z.string().describe("Clean, ready-to-parse markdown."),
});

/** Em dashes are the #1 "written by AI" tell; swap them for plain hyphens. */
export const replaceEmDashes = (s: string) => s.replace(/\s*—\s*/g, " - ");

/**
 * markdownlint rules that are safe to auto-fix. (The original code passed
 * `{ default: false }` with no rules, which silently disabled linting.)
 */
const LINT_CONFIG = {
  default: false,
  MD009: true, // trailing spaces
  MD010: true, // hard tabs
  MD012: true, // multiple blank lines
  MD018: true, // "#Heading" -> "# Heading"
  MD019: true, // multiple spaces after #
  MD022: true, // blank lines around headings
  MD023: true, // indented headings
  MD026: { punctuation: ".,;:" }, // trailing punctuation in headings
  MD027: true, // multiple spaces after >
  MD030: true, // spaces after list markers
  MD031: true, // blank lines around fenced code
  MD032: true, // blank lines around lists
  MD034: true, // bare URLs
  MD037: true, // spaces inside emphasis
  MD038: true, // spaces inside code spans
  MD039: true, // spaces inside link text
  MD047: true, // file ends with newline
};

export function lintAndFix(markdown: string): string {
  let md = markdown
    // "##Heading" -> "## Heading". The next char must be neither "#" nor space:
    // a plain (\S) lets #{1,6} backtrack and turns "## Intro" into "# # Intro",
    // which the next line then collapses to "# Intro" (demoting every heading).
    .replace(/^(#{1,6})([^#\s])/gm, "$1 $2")
    .replace(/^(#{1,6})\s#\s/gm, "$1 ") // "## # Heading"
    .replace(/^```?markdown\s*/i, "") // stray "markdown" fence label at the top
    .trim();

  // One rule per pass, re-linting each time. Applying every rule's fixes in a
  // single applyFixes() call corrupts headings when several rules touch the
  // same lines (e.g. MD022 inserting lines + MD026 editing one + MD012 deleting).
  for (const [rule, setting] of Object.entries(LINT_CONFIG)) {
    if (rule === "default") continue;
    const errors = lint({ strings: { content: md }, config: { default: false, [rule]: setting } }).content;
    if (errors.length > 0) md = applyFixes(md, errors);
  }
  return md.trim() + "\n";
}

async function writeSection(section: Section, languageLabel: string): Promise<string> {
  const heading = `${"#".repeat(section.section_heading_level || 2)} ${section.section_name}`;
  try {
    const { body } = await structured({
      schema: SectionSchema,
      name: "section_body",
      messages: [
        { role: "system", content: P.sectionSystem(languageLabel) },
        { role: "user", content: P.sectionUser(section) },
      ],
    });
    if (!body.trim()) throw new Error("empty body");
    return `${heading}\n\n${replaceEmDashes(body.trim())}`;
  } catch (err) {
    // One failed section shouldn't sink the article; the quality gate will catch thin posts.
    console.error(`[writer] section "${section.section_name}" failed:`, err);
    return `${heading}\n\n`;
  }
}

/**
 * Stage 6: every section is written in parallel (fast, and each gets the
 * model's full attention on its own key points + required keywords), then the
 * merged article gets one formatting pass and a lint auto-fix.
 */
export async function writeArticle(outline: Outline): Promise<string> {
  const languageLabel = LANGUAGES[outline.language];
  const sections = await Promise.all(outline.sections.map((s) => writeSection(s, languageLabel)));
  const merged = sections.join("\n\n");

  let markdown = merged;
  try {
    const formatted = await structured({
      schema: MarkdownSchema,
      name: "markdown_article",
      messages: [
        { role: "system", content: P.markdownFormatterSystem },
        { role: "user", content: `Format this article into fully valid Markdown:\n\n${merged}` },
      ],
    });
    // Guard: if the "formatter" lost a big chunk of the text, keep the original.
    if (formatted.markdown.length > merged.length * 0.85) markdown = formatted.markdown;
    else console.warn("[writer] formatter output was much shorter than input; keeping unformatted text");
  } catch (err) {
    console.warn("[writer] formatting pass failed, using raw sections:", err);
  }

  return lintAndFix(replaceEmDashes(markdown));
}

export function countWords(markdown: string): number {
  return markdown
    .replace(/[#>*_`\-[\]()!]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}
