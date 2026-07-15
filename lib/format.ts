export function timeAgo(sqliteUtc: string): string {
  const then = new Date(sqliteUtc.replace(" ", "T") + "Z").getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Deterministic gradient pair for placeholder thumbnails. */
export function gradientFor(id: string): [string, string] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 60 + (h % 90)) % 360;
  return [`hsl(${hue1} 70% 45%)`, `hsl(${hue2} 70% 30%)`];
}
