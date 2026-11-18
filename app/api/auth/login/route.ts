import { NextResponse } from "next/server";
import { createSessionToken, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return NextResponse.json({ error: "ADMIN_PASSWORD is not set." }, { status: 500 });

  if (!password || !safeEqual(password, expected)) {
    await new Promise((r) => setTimeout(r, 750)); // slow down guessing
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
