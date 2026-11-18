import { NextResponse } from "next/server";
import { LANGUAGES, siteConfig, type Language } from "@/config/site.config";
import { researchAndTitles } from "@/lib/engine/pipeline";

export const maxDuration = 120;

/** Manual wizard step 1: keyword -> research + 5 audited titles. */
export async function POST(req: Request) {
  const { keyword, language } = (await req.json()) as { keyword?: string; language?: string };
  if (!keyword?.trim()) return NextResponse.json({ error: "Keyword is required." }, { status: 400 });
  const lang = (language && language in LANGUAGES ? language : siteConfig.defaultLanguage) as Language;

  try {
    return NextResponse.json(await researchAndTitles(keyword.trim(), lang));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
