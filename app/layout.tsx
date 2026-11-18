import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site.config";
import "./globals.css";

export const metadata: Metadata = {
  title: `${siteConfig.name} · Blog Autopilot`,
  robots: { index: false, follow: false }, // admin panel: never index
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/keywords", label: "Keyword queue" },
  { href: "/generate", label: "Generate" },
  { href: "/posts", label: "Posts" },
  { href: "/categories", label: "Categories" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-zinc-200 bg-white">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <span className="font-semibold">{siteConfig.name}</span>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-sm text-zinc-600 hover:text-zinc-900">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
