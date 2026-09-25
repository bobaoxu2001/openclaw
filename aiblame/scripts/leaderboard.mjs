#!/usr/bin/env node
// Turn a folder of `aiblame --json` reports into the README leaderboard table.
//
//   for r in facebook/react vercel/next.js; do npx aiblame $r --quiet --json "${r/\//__}.json"; done
//   node scripts/leaderboard.mjs .
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isAI, isCode } from "../dist/index.js";

const dir = process.argv[2] ?? ".";
const pct = (a, b) => {
  if (!b) return "n/a";
  const p = (a / b) * 100;
  return p === 0 ? "0%" : p < 0.1 ? "<0.1%" : `${p.toFixed(1)}%`;
};

const rows = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  let r;
  try {
    r = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch {
    continue;
  }
  if (r?.tool?.name !== "aiblame" || !r.totals?.lines) continue;
  // Code-only share: programming languages only (for sampled reports, from the sampled files).
  let codeLines = 0;
  let codeAi = 0;
  for (const f of r.files) {
    if (!isCode(f.path)) continue;
    codeLines += f.lines;
    for (const [id, n] of Object.entries(f.by)) if (isAI(id)) codeAi += n;
  }
  const agents = r.agents
    .filter((a) => a.lines > 0 && a.lines / r.totals.lines >= 0.001)
    .slice(0, 3)
    .map((a) => `${a.name} ${pct(a.lines, r.totals.lines)}`)
    .join(", ");
  rows.push({
    name: r.repo.name,
    share: r.totals.ai / r.totals.lines,
    all: (r.sample ? "~" : "") + pct(r.totals.ai, r.totals.lines),
    code: (r.sample ? "~" : "") + pct(codeAi, codeLines),
    agents: agents || "none found",
    commits: `${r.commits.ai.toLocaleString("en-US")} / ${r.commits.total.toLocaleString("en-US")}`,
    lines: r.totals.lines,
  });
}
rows.sort((a, b) => b.share - a.share);
console.log("| Repository | AI-written | Code only | Top agents | AI-signed commits |");
console.log("|---|---:|---:|---|---:|");
for (const r of rows) {
  console.log(`| [${r.name}](https://github.com/${r.name}) | **${r.all}** | ${r.code} | ${r.agents} | ${r.commits} |`);
}
