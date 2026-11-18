import type { Language } from "@/config/site.config";

export interface Section {
  section_name: string;
  /** 2 = H2 ... 5 = H5 */
  section_heading_level: number;
  target_word_count: number;
  key_points: string[];
  /** LSI keywords this section must work in. */
  keywords: string[];
}

export interface Outline {
  meta_title: string;
  meta_description: string;
  search_intent: string;
  keyword: string;
  lsis: string[];
  language: Language;
  sections: Section[];
}

export interface Research {
  keyword: string;
  serpTitles: string[];
  searchIntent: string;
  /** Top TF-IDF single terms from the ranking pages. */
  keywords: { term: string; score: number }[];
  /** Most frequent 2-3 word phrases from the ranking pages. */
  keyphrases: { phrase: string; frequency: number }[];
  /** keyphrases + keywords, flattened: what the outline distributes across sections. */
  lsis: string[];
}

export interface TitleResult extends Research {
  titles: string[];
}
