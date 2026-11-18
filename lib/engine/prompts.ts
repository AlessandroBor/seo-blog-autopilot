/**
 * Every prompt the engine sends, in one place, so you can tune voice and rules
 * without touching pipeline code.
 */
import { siteConfig } from "@/config/site.config";

const year = () => new Date().getFullYear();

const nicheLine = () =>
  siteConfig.businessContext
    ? `\nContext about the website publishing this article: ${siteConfig.businessContext}`
    : "";

// ---------------------------------------------------------------- research
export const searchIntentSystem = (keyword: string) =>
  `Given these top 10 Google results titles for the keyword "${keyword}", return the most probable search intent of the user in JSON format.`;

// ---------------------------------------------------------------- titles
/**
 * Two-step title generation: first an LLM writes a tailored brief for the
 * title writer (it "plans"), then the titles are generated from that brief.
 * This consistently beat a single static prompt on CTR-style titles.
 */
export const titlePlanner = (keyword: string, searchIntent: string) =>
  `I need you to instruct the agent to generate 5 SEO SERP optimized meta titles with a length of 50-65 characters. The titles should be focused and include the following target keyword "${keyword}". Also, explain that the user intent is "${searchIntent}". The titles should be easily readable and optimized for answering the user's intent and maximizing click through rate (CTR). Make the prompt instruct the following agent to generate the titles for you. Return the prompt that should be passed on to the agent. Make sure the articles are not advertising external products or tools and are simply informational. Also make sure that the agent does not include the char amount/length in the title.
Keep the prompt plain text.`;

export const titleWriterTail = (languageLabel: string, maxLen: number) =>
  [
    "",
    `Now generate 5 distinct, click-worthy blog post titles in ${languageLabel}.`,
    `IMPORTANT: Each title MUST be under ${maxLen} characters.`,
    "Do NOT prefix with numbers or bullets.",
    "Return ONLY a JSON object that matches the schema.",
    "DO NOT include the characters length amount IN THE TITLE.",
    `We are in the year: ${year()}`,
  ].join("\n");

export const titleAuditSystem = (keyword: string, searchIntent: string) =>
  `You are a title quality auditor. Evaluate each title for:
1. **Language**: Is it grammatically correct, professional, and free of awkward phrasing?
2. **Readability**: Is it clear, easy to understand, and well-structured?
3. **Relevance**: Does it align with the keyword "${keyword}" and search intent "${searchIntent}"?

Be strict but fair. If a title has issues, provide a suggested fix that maintains the original intent but resolves the problems.`;

export const titleRewriteSystem = (keyword: string, searchIntent: string, maxLen: number) =>
  `You are a title writer. Generate a single improved blog post title.
STRICT REQUIREMENTS:
- Maximum ${maxLen} characters (this is non-negotiable)
- Must be relevant to keyword: "${keyword}"
- Must align with search intent: "${searchIntent}"
- Must be grammatically correct and readable
- Do NOT use numbering or bullet prefixes`;

// ---------------------------------------------------------------- outline
export const outlineSystem = (
  title: string,
  searchIntent: string,
  lsis: string[],
  languageLabel: string,
) =>
  `Given the title "${title}", search intent: "${searchIntent}", and LSI terms: ${JSON.stringify(lsis)}, generate an SEO outline. The article will be written in ${languageLabel}.

Rules:
- Start with an introduction and end with a conclusion.
- Spread the LSI terms across the sections; every term should appear in at least one section's "keywords".
- Give each section a realistic target word count (roughly 100-450).
- Use heading levels 2-4 and nest them logically: a level-3 section must follow a level-2 (or another level-3), never skip levels.
- Never make "link to a resource" a key point.
- The meta description must be 140-160 characters, include the main keyword naturally, and make the reader want to click.${nicheLine()}`;

// ---------------------------------------------------------------- writing
export const sectionSystem = (languageLabel: string) =>
  `You are writing the body text for a blog section. Write in ${languageLabel}. Return only JSON. Do NOT include any word count information, summaries, or metadata in the output. Generate only the clean body text. The current year is ${year()} just for you to know. Write the body text ONLY (no headings). Use Markdown formatting.${nicheLine()}`;

export const sectionUser = (s: {
  section_name: string;
  target_word_count: number;
  section_heading_level: number;
  key_points: string[];
  keywords: string[];
}) =>
  [
    `Section name: "${s.section_name}"`,
    `Target word count: ~${s.target_word_count}`,
    `Heading level: ${s.section_heading_level}`,
    `Key points: ${s.key_points.join(", ")}`,
    `Required keywords: ${s.keywords.join(", ")}. THESE ARE NON NEGOTIABLE! Find a way to include them intelligently.`,
    "Do not make markdown tables.",
    'Do NOT prefix with "Here is the text" or similar.',
    "DO NOT specify the word count EVER; it is only between you and me and must not appear in the content.",
    "Now, please return the markdown section only:",
  ].join("\n");

export const markdownFormatterSystem =
  "You are a backend markdown processor. Return only JSON with a single markdown field. Fix broken Markdown syntax only; do NOT rewrite, shorten, or summarize the text.";

// ---------------------------------------------------------------- images
export const iconQuerySystem =
  "You are an expert at providing short descriptive icon queries. Return JSON only.";

export const iconPickerSystem =
  "You are an expert icon selector. Given a user query and a list of icon names, choose the single best icon name from the list that semantically matches the query. Respond ONLY with the chosen icon name.";

export const altTextSystem =
  "You are an expert at generating concise, descriptive alt text for images. Focus on the main subject, key visual elements, and context. Keep it to one sentence.";

// ---------------------------------------------------------------- enrichment
export const categorySystem = (categories: { id: number; category: string }[], max: number) =>
  `You are a category assigner for blog posts.
You are given the following categories:
${JSON.stringify(categories, null, 2)}

You will be provided the article's content, title, and description.
Assign **up to ${max}** categories that best match the article.
Return ONLY the numeric ids.`;

export const TIP_PROMPTS: Record<string, string> = {
  en: `You are an expert blog editor.

Write ONE helpful tip for this article.

Rules:
- Max 60 words
- Practical and actionable
- No fluff, no emojis, no markdown
- No meta commentary ("this article", "below", etc.)
- Neutral, professional tone

Return ONLY the tip text.`,
  es: `Eres un editor experto de blogs.

Escribe UN consejo útil para este artículo.

Reglas:
- Máximo 60 palabras
- Práctico y accionable
- Sin relleno, sin emojis, sin markdown
- Sin comentarios meta ("este artículo", "a continuación", etc.)
- Tono neutral y profesional

Devuelve SOLO el texto del consejo.`,
  pt: `Você é um editor de blog especialista.

Escreva UMA dica útil para este artigo.

Regras:
- Máximo 60 palavras
- Prática e acionável
- Sem enrolação, sem emojis, sem markdown
- Sem meta comentários ("este artigo", "abaixo", etc.)
- Tom neutro e profissional

Retorne APENAS o texto da dica.`,
  it: `Sei un editor di blog esperto.

Scrivi UN consiglio utile per questo articolo.

Regole:
- Massimo 60 parole
- Pratico e attuabile
- Niente riempitivi, niente emoji, niente markdown
- Niente meta commenti ("questo articolo", "di seguito", ecc.)
- Tono neutro e professionale

Restituisci SOLO il testo del consiglio.`,
  fr: `Vous êtes un éditeur de blog expert.

Rédigez UN conseil utile pour cet article.

Règles :
- 60 mots maximum
- Pratique et actionnable
- Pas de remplissage, pas d'emojis, pas de markdown
- Pas de méta commentaires ("cet article", "ci-dessous", etc.)
- Ton neutre et professionnel

Retournez UNIQUEMENT le texte du conseil.`,
  de: `Du bist ein erfahrener Blog-Redakteur.

Schreibe EINEN hilfreichen Tipp für diesen Artikel.

Regeln:
- Maximal 60 Wörter
- Praktisch und umsetzbar
- Kein Fülltext, keine Emojis, kein Markdown
- Keine Meta-Kommentare („dieser Artikel", „unten", usw.)
- Neutraler, professioneller Ton

Gib NUR den Text des Tipps zurück.`,
  ca: `Ets un editor de blogs expert.

Escriu UN consell útil per a aquest article.

Regles:
- Màxim 60 paraules
- Pràctic i accionable
- Sense farciment, sense emojis, sense markdown
- Sense meta comentaris ("aquest article", "a continuació", etc.)
- To neutre i professional

Retorna NOMÉS el text del consell.`,
};
