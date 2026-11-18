/**
 * Featured + in-body images without an image model: the LLM picks the best
 * matching Lucide icon, we render it white on the brand colour with sharp,
 * write alt text with a vision model, and upload to Supabase Storage.
 * Cheap, on-brand, consistent, and never "AI-art weird".
 */
import sharp from "sharp";
import { icons } from "lucide";
import { z } from "zod";
import { siteConfig } from "@/config/site.config";
import { db } from "@/lib/supabase";
import { models, structured, text } from "./llm";
import * as P from "./prompts";

type IconNode = [string, Record<string, string | number>][];
const ICON_NAMES = Object.keys(icons);
const IconQuerySchema = z.object({ icon_query: z.string().describe("Short descriptive phrase for an icon.") });

function iconToSvg(node: IconNode, size: number, color: string): string {
  const children = node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${a}/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

async function pickIcon(query: string): Promise<string> {
  const answer = await text({
    temperature: 0.1,
    maxTokens: 50,
    messages: [
      { role: "system", content: P.iconPickerSystem },
      {
        role: "user",
        content: `Given the user query "${query}", select the single best matching icon name from the following list. Respond ONLY with the chosen icon name.\n\nAvailable icon names:\n${ICON_NAMES.join(", ")}\n\nQuery: "${query}"\nBest Icon Name:`,
      },
    ],
  });
  const name = answer.replace(/[^A-Za-z0-9]/g, "");
  return name in icons ? name : "Image";
}

async function altTextFor(pngDataUrl: string, fallback: string): Promise<string> {
  try {
    const alt = await text({
      model: models.vision,
      temperature: 0.3,
      maxTokens: 60,
      messages: [
        { role: "system", content: P.altTextSystem },
        {
          role: "user",
          content: [
            { type: "text", text: "Generate alt text for this image." },
            { type: "image_url", image_url: { url: pngDataUrl, detail: "low" } },
          ],
        },
      ],
    });
    return alt || fallback;
  } catch (err) {
    // Model without vision support, etc. A descriptive fallback beats no alt.
    console.warn("[images] alt text failed, using fallback:", err);
    return fallback;
  }
}

export interface MediaRow {
  id: number;
  src: string;
  alt: string | null;
}

/** Renders, uploads and registers one icon image. Returns null on failure (images are optional). */
export async function createIconImage(iconQuery: string): Promise<MediaRow | null> {
  try {
    const iconName = await pickIcon(iconQuery);
    const node = icons[iconName as keyof typeof icons] as unknown as IconNode;
    const { width, height } = siteConfig.imageSize;

    const iconPng = await sharp(Buffer.from(iconToSvg(node, siteConfig.iconSize, "white")))
      .resize(siteConfig.iconSize, siteConfig.iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const png = await sharp({
      create: { width, height, channels: 4, background: siteConfig.imageBackground },
    })
      .composite([{ input: iconPng, gravity: "center" }])
      .png()
      .toBuffer();

    const alt = await altTextFor(`data:image/png;base64,${png.toString("base64")}`, `${iconQuery} illustration`);

    const fileName = `${iconQuery.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) || "icon"}-${Date.now()}.png`;
    const storage = db().storage.from(siteConfig.storageBucket);
    const { data: up, error: upErr } = await storage.upload(fileName, png, { contentType: "image/png" });
    if (upErr) throw upErr;
    const src = storage.getPublicUrl(up.path).data.publicUrl;

    const { data, error } = await db().from("blog_media").insert({ src, alt }).select("id, src, alt").single();
    if (error) throw error;
    console.log(`[images] "${iconQuery}" -> ${iconName} -> ${src}`);
    return data as MediaRow;
  } catch (err) {
    console.error(`[images] failed for "${iconQuery}":`, err);
    return null;
  }
}

/** Asks the LLM for a short icon idea from any text (title or full article). */
export async function iconQueryFor(content: string): Promise<string | null> {
  try {
    const { icon_query } = await structured({
      schema: IconQuerySchema,
      name: "icon_query",
      messages: [
        { role: "system", content: P.iconQuerySystem },
        { role: "user", content: `Suggest an icon query for this blog content:\n\n${content.slice(0, 6000)}` },
      ],
    });
    return icon_query;
  } catch {
    return null;
  }
}

/** Inserts the image before the middle heading (or at the end if there are no headings). */
export function insertImageMidArticle(markdown: string, image: { src: string; alt: string | null }): string {
  // Blank lines on both sides, or Markdown glues the image onto the previous paragraph.
  const tag = `![${(image.alt ?? "").replace(/[[\]]/g, "")}](${image.src})`;
  const headings = [...markdown.matchAll(/^#{1,6}\s+.+$/gm)];
  if (headings.length < 2) return `${markdown.trimEnd()}\n\n${tag}\n`;
  const middle = headings[Math.floor(headings.length / 2)];
  const at = middle.index ?? markdown.length;
  return `${markdown.slice(0, at).trimEnd()}\n\n${tag}\n\n${markdown.slice(at)}`;
}
