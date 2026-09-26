import { agentInfo, explainCommit, HUMAN } from "./agents.js";
import { openRepo, resolveRev, walkLog } from "./git.js";
import { num } from "./report/common.js";
import { padStart, type Painter } from "./util/ansi.js";

/**
 * `aiblame evidence`: which signatures matched in this repo, and how often.
 * Use it to check that every commit credited to an agent deserves it.
 */
export async function renderEvidence(opts: { path: string; rev?: string; top?: number }, p: Painter): Promise<string> {
  const repo = await openRepo(opts.path);
  const sha = await resolveRev(repo, opts.rev ?? "HEAD");
  const byAgent = new Map<string, Map<string, { count: number; example: string }>>();
  let total = 0;
  await walkLog(repo, sha, (c) => {
    total++;
    const v = explainCommit(c);
    if (v.id === HUMAN.id) return;
    // Session / thread URLs are unique per commit: group them.
    const key = v.evidence.replace(/(https?:\/\/\S+?[/_-])[\w-]{12,}\b/g, "$1…").replace(/\s+/g, " ").slice(0, 110);
    let m = byAgent.get(v.id);
    if (!m) byAgent.set(v.id, (m = new Map()));
    const e = m.get(key) ?? { count: 0, example: c.sha.slice(0, 7) };
    e.count++;
    m.set(key, e);
  });
  const top = opts.top ?? 6;
  const out: string[] = ["", `  ${p.bold("Signatures found")} ${p.dim(`in ${num(total)} commits`)}`];
  const order = [...byAgent].sort((a, b) => sum(b[1]) - sum(a[1]));
  for (const [id, m] of order) {
    const info = agentInfo(id);
    out.push("");
    out.push(`  ${p.fg(info.color, "■")} ${p.bold(info.name)} ${p.dim(`${num(sum(m))} commits`)}`);
    const rows = [...m].sort((a, b) => b[1].count - a[1].count);
    for (const [key, e] of rows.slice(0, top)) {
      out.push(`    ${padStart(num(e.count), 7)}  ${key}  ${p.dim(`e.g. ${e.example}`)}`);
    }
    if (rows.length > top) out.push(p.dim(`             …and ${rows.length - top} more variants`));
  }
  if (!order.length) out.push("", "  No agent or bot signatures in this history.");
  out.push("");
  return out.join("\n");
}

function sum(m: Map<string, { count: number }>): number {
  let n = 0;
  for (const e of m.values()) n += e.count;
  return n;
}
