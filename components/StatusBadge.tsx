const STYLES: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-700",
  processing: "bg-amber-100 text-amber-800",
  done: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
  draft: "bg-zinc-100 text-zinc-700",
  published: "bg-green-100 text-green-800",
  draft_error: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STYLES[status] ?? "bg-zinc-100"}`}>{status.replace("_", " ")}</span>;
}
