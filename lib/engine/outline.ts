import { z } from "zod";
import { LANGUAGES, type Language } from "@/config/site.config";
import { structured } from "./llm";
import { outlineSystem } from "./prompts";
import type { Outline, Section } from "./types";

const OutlineSchema = z.object({
  meta_description: z.string().describe("SEO optimized meta description, 140-160 characters"),
  sections: z.array(
    z.object({
      section_name: z.string(),
      section_heading_level: z.enum(["2", "3", "4"]),
      target_word_count: z.number(),
      key_points: z.array(z.string()),
      keywords: z.array(z.string()),
    }),
  ),
});

/**
 * Headings must not skip levels (H2 -> H4) — screen readers and Google both use
 * the hierarchy to understand structure. The model is told this, but we enforce
 * it here so a bad outline can't produce a broken document.
 */
export function normalizeHeadingLevels(sections: Section[]): Section[] {
  let previous = 1; // the post title is the H1
  return sections.map((s) => {
    const level = Math.min(Math.max(s.section_heading_level, 2), previous + 1);
    previous = level;
    return { ...s, section_heading_level: level };
  });
}

/** Stage 5: title + intent + LSI terms -> structured outline with per-section keyword assignments. */
export async function generateOutline(input: {
  title: string;
  keyword: string;
  searchIntent: string;
  lsis: string[];
  language: Language;
}): Promise<Outline> {
  const parsed = await structured({
    schema: OutlineSchema,
    name: "outline",
    messages: [
      {
        role: "system",
        content: outlineSystem(input.title, input.searchIntent, input.lsis, LANGUAGES[input.language]),
      },
    ],
  });

  return {
    meta_title: input.title,
    meta_description: parsed.meta_description,
    search_intent: input.searchIntent,
    keyword: input.keyword,
    lsis: input.lsis,
    language: input.language,
    sections: normalizeHeadingLevels(
      parsed.sections.map((s) => ({ ...s, section_heading_level: Number(s.section_heading_level) })),
    ),
  };
}
