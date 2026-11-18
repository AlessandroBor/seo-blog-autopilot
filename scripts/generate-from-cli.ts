/**
 * Generate one post from the terminal, without the admin UI or the queue.
 *
 *   npm run generate -- "how to start a vegetable garden"
 *   npm run generate -- "cómo empezar un huerto" es
 *
 * Reads .env.local. The post is saved as a draft.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { LANGUAGES, siteConfig, type Language } from "../config/site.config";
import { generatePostFromKeyword } from "../lib/engine/pipeline";

async function main() {
  const [keyword, lang = siteConfig.defaultLanguage] = process.argv.slice(2);
  if (!keyword) {
    console.error('Usage: npm run generate -- "<keyword>" [language]');
    process.exit(1);
  }
  if (!(lang in LANGUAGES)) {
    console.error(`Unknown language "${lang}". Options: ${Object.keys(LANGUAGES).join(", ")}`);
    process.exit(1);
  }
  const post = await generatePostFromKeyword(keyword, lang as Language);
  console.log(`\nSaved post #${post.id} "${post.title}" as ${post.status} (slug: ${post.slug})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
