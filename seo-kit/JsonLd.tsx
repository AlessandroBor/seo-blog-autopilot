/**
 * <JsonLd data={...} /> — renders a JSON-LD <script> tag safely.
 *
 * Works in Server Components (no 'use client' needed). Always goes through
 * serializeJsonLd(), which escapes `<` so a title like "</script>" in your
 * database can't break out of the tag. Don't hand-roll
 * JSON.stringify + dangerouslySetInnerHTML elsewhere.
 */
import { serializeJsonLd } from './json-ld';

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

export default JsonLd;
