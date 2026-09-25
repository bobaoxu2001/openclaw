import { agentInfo, HUMAN, isAI } from "../agents.js";
import type { FileStat, Report } from "../analyze.js";

export function pct(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return "0%";
  const p = (part / whole) * 100;
  if (p < 0.1) return "<0.1%";
  if (p > 99.9 && part < whole) return ">99.9%";
  return `${p >= 10 ? p.toFixed(1).replace(/\.0$/, "") : p.toFixed(1)}%`;
}

export function num(n: number): string {
  return n.toLocaleString("en-US");
}

/** The headline number, marked approximate when it comes from a sample. */
export function headline(r: Report): string {
  return (r.sample ? "~" : "") + pct(r.totals.ai, r.totals.lines);
}

export function margin(r: Report): string | null {
  if (!r.sample) return null;
  const m = r.sample.margin * 100;
  return `±${m < 0.1 ? "0.1" : m.toFixed(1)}%`;
}

export function aiShare(r: Report): number {
  return r.totals.lines ? r.totals.ai / r.totals.lines : 0;
}

export interface Segment {
  id: string;
  name: string;
  color: string;
  lines: number;
}

/** Agents first (largest first), then bots, then humans. */
export function segments(r: Report): Segment[] {
  const segs: Segment[] = r.agents
    .filter((a) => a.lines > 0)
    .map((a) => ({ id: a.id, name: a.name, color: a.color, lines: a.lines }));
  if (r.totals.bot > 0) segs.push({ id: "bot", name: agentInfo("bot").name, color: agentInfo("bot").color, lines: r.totals.bot });
  if (r.totals.human > 0) segs.push({ id: HUMAN.id, name: HUMAN.name, color: HUMAN.color, lines: r.totals.human });
  return segs;
}

/**
 * Split `cells` between segments proportionally (largest remainder), giving
 * every non-empty segment at least one cell when there is room.
 */
export function allocate(values: number[], cells: number): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0 || cells <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * cells);
  const out = exact.map(Math.floor);
  let left = cells - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]!++;
    left--;
  }
  for (let i = 0; i < out.length; i++) {
    if (values[i]! > 0 && out[i] === 0) {
      const donor = out.indexOf(Math.max(...out));
      if (out[donor]! > 1) {
        out[donor]!--;
        out[i] = 1;
      }
    }
  }
  return out;
}

export function fileAi(f: FileStat): number {
  let n = 0;
  for (const [id, v] of Object.entries(f.by)) if (isAI(id)) n += v;
  return n;
}

export function dominantAgent(by: Record<string, number>): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of Object.entries(by)) {
    if (isAI(id) && n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

export interface DirStat {
  path: string;
  lines: number;
  ai: number;
  by: Record<string, number>;
}

/** Roll files up into directories `depth` levels deep. */
export function directories(files: FileStat[], depth = 2): DirStat[] {
  const dirs = new Map<string, DirStat>();
  for (const f of files) {
    const parts = f.path.split("/");
    const dir = parts.length > 1 ? parts.slice(0, Math.min(depth, parts.length - 1)).join("/") + "/" : "./";
    let d = dirs.get(dir);
    if (!d) dirs.set(dir, (d = { path: dir, lines: 0, ai: 0, by: {} }));
    d.lines += f.lines;
    for (const [id, n] of Object.entries(f.by)) {
      d.by[id] = (d.by[id] ?? 0) + n;
      if (isAI(id)) d.ai += n;
    }
  }
  return [...dirs.values()];
}

/** Files with the most AI-written code, favouring fully AI-written ones. */
export function topAiFiles(files: FileStat[], limit: number, minLines = 20): Array<FileStat & { ai: number }> {
  const withAi = files.map((f) => ({ ...f, ai: fileAi(f) })).filter((f) => f.ai > 0);
  const rank = (a: FileStat & { ai: number }, b: FileStat & { ai: number }) =>
    b.ai / b.lines - a.ai / a.lines || b.ai - a.ai;
  const big = withAi.filter((f) => f.lines >= minLines).sort(rank);
  const small = withAi.filter((f) => f.lines < minLines).sort(rank);
  return [...big, ...small].slice(0, limit);
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function scopeLabel(r: Report): string {
  const what = r.codeOnly ? "code" : "lines";
  if (r.mode === "history") return r.since ? `of ${what} added since ${r.since}` : `of all ${what} ever added`;
  return r.codeOnly ? "of the current code (docs, config & data excluded)" : "of the current code";
}

export function timelineTitle(r: Report): string {
  return r.mode === "history" ? "AI share of lines added, by month" : "Current code, by the month it was written";
}
