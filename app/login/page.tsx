"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Login failed.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-16 max-w-sm space-y-4">
      <h1 className="text-lg font-semibold">Admin login</h1>
      <input
        type="password"
        className="input"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !password}>
        {busy ? "Checking..." : "Log in"}
      </button>
    </form>
  );
}
