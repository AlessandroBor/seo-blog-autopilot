"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUAGES, siteConfig } from "@/config/site.config";
import type { Outline, TitleResult } from "@/lib/engine/types";

type Step = "keyword" | "titles" | "outline";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

/**
 * Manual, step-by-step version of the autopilot: lets you choose the title and
 * edit the outline before the (expensive) writing step.
 */
export default function GeneratePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("keyword");
  const [keyword, setKeyword] = useState("");
  const [language, setLanguage] = useState<string>(siteConfig.defaultLanguage);
  const [research, setResearch] = useState<TitleResult | null>(null);
  const [title, setTitle] = useState("");
  const [outline, setOutline] = useState<Outline | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const getTitles = () =>
    run("Analysing the top 10 Google results and writing titles...", async () => {
      const r = await post<TitleResult>("/api/generate/titles", { keyword, language });
      setResearch(r);
      setTitle(r.titles[0] ?? "");
      setStep("titles");
    });

  const getOutline = () =>
    run("Building the outline...", async () => {
      if (!research) return;
      const { outline } = await post<{ outline: Outline }>("/api/generate/outline", {
        title,
        keyword: research.keyword,
        searchIntent: research.searchIntent,
        lsis: research.lsis,
        language,
      });
      setOutline(outline);
      setStep("outline");
    });

  const writeArticle = () =>
    run("Writing every section, creating images, categorising... (1-3 min)", async () => {
      const { post: saved } = await post<{ post: { id: number } }>("/api/generate/article", { outline });
      router.push(`/posts/${saved.id}`);
    });

  const updateSection = (i: number, patch: Partial<Outline["sections"][number]>) =>
    outline && setOutline({ ...outline, sections: outline.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Generate a post</h1>

      <div className="card space-y-3">
        <label className="block text-sm font-medium">1. Target keyword</label>
        <div className="flex flex-wrap gap-3">
          <input className="input flex-1" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. how to start a vegetable garden" />
          <select className="input w-auto" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {Object.entries(LANGUAGES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
          </select>
          <button className="btn-primary" disabled={!keyword.trim() || !!busy} onClick={getTitles}>Research</button>
        </div>
      </div>

      {research && step !== "keyword" && (
        <div className="card space-y-3">
          <label className="block text-sm font-medium">2. Pick or edit a title</label>
          <p className="text-sm text-zinc-600"><strong>Search intent:</strong> {research.searchIntent}</p>
          <div className="space-y-2">
            {research.titles.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" checked={title === t} onChange={() => setTitle(t)} />
                {t} <span className="text-zinc-400">({t.length})</span>
              </label>
            ))}
          </div>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          <details className="text-sm text-zinc-600">
            <summary className="cursor-pointer">LSI terms found ({research.lsis.length})</summary>
            <p className="mt-2">{research.lsis.join(", ")}</p>
          </details>
          <button className="btn-primary" disabled={!title.trim() || !!busy} onClick={getOutline}>Build outline</button>
        </div>
      )}

      {outline && step === "outline" && (
        <div className="card space-y-4">
          <label className="block text-sm font-medium">3. Review the outline</label>
          <div>
            <span className="text-xs text-zinc-500">Meta description ({outline.meta_description.length} chars)</span>
            <textarea className="input" rows={2} value={outline.meta_description} onChange={(e) => setOutline({ ...outline, meta_description: e.target.value })} />
          </div>
          {outline.sections.map((s, i) => (
            <div key={i} className="grid grid-cols-[4rem_1fr_6rem] gap-2" style={{ paddingLeft: (s.section_heading_level - 2) * 16 }}>
              <select className="input" value={s.section_heading_level} onChange={(e) => updateSection(i, { section_heading_level: Number(e.target.value) })}>
                {[2, 3, 4].map((l) => <option key={l} value={l}>H{l}</option>)}
              </select>
              <input className="input" value={s.section_name} onChange={(e) => updateSection(i, { section_name: e.target.value })} />
              <input className="input" type="number" value={s.target_word_count} onChange={(e) => updateSection(i, { target_word_count: Number(e.target.value) })} title="Target words" />
              <p className="col-span-3 text-xs text-zinc-500">Keywords: {s.keywords.join(", ")}</p>
            </div>
          ))}
          <button className="btn-primary" disabled={!!busy} onClick={writeArticle}>Write article</button>
        </div>
      )}

      {busy && <p className="text-sm text-zinc-600">{busy}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
