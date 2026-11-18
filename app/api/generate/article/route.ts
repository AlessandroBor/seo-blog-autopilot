import { NextResponse } from "next/server";
import { writeAndSave } from "@/lib/engine/pipeline";
import { normalizeHeadingLevels } from "@/lib/engine/outline";
import type { Outline } from "@/lib/engine/types";

export const maxDuration = 300;

/** Manual wizard step 3: (possibly edited) outline -> written, illustrated, saved draft. */
export async function POST(req: Request) {
  const { outline } = (await req.json()) as { outline?: Outline };
  if (!outline?.meta_title || !outline.meta_description || !outline.sections?.length) {
    return NextResponse.json({ error: "A complete outline is required." }, { status: 400 });
  }

  try {
    // Re-normalise: the user may have edited heading levels in the wizard.
    const post = await writeAndSave({ ...outline, sections: normalizeHeadingLevels(outline.sections) });
    return NextResponse.json({ post });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
