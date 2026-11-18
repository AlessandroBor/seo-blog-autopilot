import { NextResponse } from "next/server";
import { LANGUAGES, siteConfig, type Language } from "@/config/site.config";
import { generateOutline } from "@/lib/engine/pipeline";

export const maxDuration = 120;

/** Manual wizard step 2: chosen title + research -> outline. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    title?: string;
    keyword?: string;
    searchIntent?: string;
    lsis?: string[];
    language?: string;
  };
  if (!body.title || !body.keyword || !body.searchIntent || !Array.isArray(body.lsis)) {
    return NextResponse.json({ error: "title, keyword, searchIntent and lsis are required." }, { status: 400 });
  }
  const language = (body.language && body.language in LANGUAGES ? body.language : siteConfig.defaultLanguage) as Language;

  try {
    const outline = await generateOutline({
      title: body.title,
      keyword: body.keyword,
      searchIntent: body.searchIntent,
      lsis: body.lsis,
      language,
    });
    return NextResponse.json({ outline });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
