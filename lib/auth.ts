/**
 * Minimal single-password admin login. The session cookie is
 * "<expiry>.<HMAC(expiry)>": stateless, can't be forged without
 * ADMIN_SESSION_SECRET, and expires on its own. Uses Web Crypto so it runs in
 * the proxy as well as route handlers.
 */
export const SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

const enc = new TextEncoder();

async function hmac(value: string): Promise<string> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("ADMIN_SESSION_SECRET missing or too short.");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Buffer.from(sig).toString("base64url");
}

/** Constant-time string compare (avoids leaking how many characters matched). */
export function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function createSessionToken(): Promise<string> {
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE);
  return `${expires}.${await hmac(expires)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || Number(expires) < Date.now() / 1000) return false;
  try {
    return safeEqual(sig, await hmac(expires));
  } catch {
    return false;
  }
}

export function isValidCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
