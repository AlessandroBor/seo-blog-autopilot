import type { Outline } from "./types";
import { countWords } from "./writer";

export interface QualityReport {
  passed: boolean;
  reasons: string[];
  wordCount: number;
}

/**
 * Decides whether a freshly generated post may go live without a human
 * looking at it (only matters when AUTO_PUBLISH=true). Anything that fails
 * is saved as a draft with the reasons logged, so nothing is lost.
 */
export function checkQuality(markdown: string, outline: Outline): QualityReport {
  const reasons: string[] = [];
  const wordCount = countWords(markdown);
  const target = outline.sections.reduce((sum, s) => sum + s.target_word_count, 0);

  // Sections that failed to generate are left as a bare heading.
  const emptySections = markdown
    .split(/^#{1,6}\s+.+$/m)
    .slice(1)
    .filter((body) => body.trim().length === 0).length;

  // TODO(you): decide what "good enough to publish unseen" means for your site.
  // You have: wordCount, target (sum of the outline's targets), emptySections,
  // outline.meta_description, outline.keyword, and the markdown itself.
  // Push a human-readable string onto `reasons` for each failed rule.
  // The defaults below are a sensible starting point:
  if (wordCount < Math.max(600, target * 0.6)) reasons.push(`Too short: ${wordCount} words (target ~${target})`);
  if (emptySections > 0) reasons.push(`${emptySections} section(s) came back empty`);
  const md = outline.meta_description.length;
  if (md < 70 || md > 170) reasons.push(`Meta description is ${md} chars (want ~140-160)`);

  return { passed: reasons.length === 0, reasons, wordCount };
}
