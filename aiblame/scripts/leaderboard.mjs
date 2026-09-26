#!/usr/bin/env node
// Turn a folder of `aiblame --json` reports into the README leaderboard table.
//
//   for r in facebook/react vercel/next.js; do npx aiblame $r --quiet --json "${r/\//__}.json"; done
//   node scripts/leaderboard.mjs . [--svg leaderboard.svg] [--top 30]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentInfo, isAI, isCode } from "../dist/index.js";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv.splice(i, 2)[1] : undefined;
};
const svgOut = flag("--svg");
const top = Number(flag("--top") ?? 1000);
const dir = argv[0] ?? ".";
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
    total: r.totals.lines,
    agentLines: r.agents.filter((a) => a.lines > 0).map((a) => [a.id, a.lines]),
    sampled: Boolean(r.sample),
  });
}
rows.sort((a, b) => b.share - a.share);
rows.splice(top);
console.log("| Repository | AI-written | Code only | Top agents | AI-signed commits |");
console.log("|---|---:|---:|---|---:|");
for (const r of rows) {
  console.log(`| [${r.name}](https://github.com/${r.name}) | **${r.all}** | ${r.code} | ${r.agents} | ${r.commits} |`);
}

if (svgOut) writeFileSync(svgOut, chart(rows));

/** Horizontal stacked bars, one per repo, coloured by agent. Follows light/dark mode. */
function chart(rows) {
  const W = 820;
  const rowH = 26;
  const top = 64;
  const labelW = 250;
  const barX = labelW + 12;
  const barW = W - barX - 70;
  const used = new Map();
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const body = rows
    .map((r, i) => {
      const y = top + i * rowH;
      let x = barX;
      const segs = r.agentLines
        .map(([id, n]) => {
          const w = (n / r.total) * barW;
          if (w < 0.3) return "";
          used.set(id, (used.get(id) ?? 0) + n / r.total);
          const rect = `<rect x="${x.toFixed(1)}" y="${y + 5}" width="${w.toFixed(1)}" height="${rowH - 10}" fill="${agentInfo(id).color}"><title>${esc(agentInfo(id).name)}</title></rect>`;
          x += w;
          return rect;
        })
        .join("");
      return (
        `<text x="${labelW}" y="${y + rowH / 2 + 4}" text-anchor="end" class="l">${esc(r.name)}</text>` +
        `<rect x="${barX}" y="${y + 5}" width="${barW}" height="${rowH - 10}" rx="2" class="track"/>` +
        segs +
        `<text x="${(x + 6).toFixed(1)}" y="${y + rowH / 2 + 4}" class="v">${r.all}</text>`
      );
    })
    .join("\n");
  const legendItems = [...used].sort((a, b) => b[1] - a[1]).slice(0, 14);
  let legendY = top + rows.length * rowH + 24;
  let lx = 24;
  const legend = legendItems
    .map(([id]) => {
      const name = agentInfo(id).name;
      const w = 26 + name.length * 6.8;
      if (lx + w > W - 24) {
        lx = 24;
        legendY += 20;
      }
      const item = `<circle cx="${lx + 5}" cy="${legendY - 4}" r="5" fill="${agentInfo(id).color}"/><text x="${lx + 14}" y="${legendY}" class="m">${esc(name)}</text>`;
      lx += w;
      return item;
    })
    .join("");
  const H = legendY + 22;
  const date = new Date().toISOString().slice(0, 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of current code written by AI agents in popular repositories">
<style>
svg{--bg:#ffffff;--fg:#1f2328;--muted:#656d76;--track:#eaeef2}
@media (prefers-color-scheme:dark){svg{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0;--track:#21262d}}
text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;fill:var(--fg)}
.bg{fill:var(--bg)}.track{fill:var(--track)}.l{font-size:13px}.v{font-size:12px;font-weight:600}.m{font-size:12px;fill:var(--muted)}.h{font-size:17px;font-weight:700}
</style>
<rect width="${W}" height="${H}" rx="10" class="bg"/>
<text x="24" y="34" class="h">How much of the current code did AI agents write?</text>
<text x="24" y="52" class="m">Share of surviving lines with an AI signature, measured by aiblame (${date}). A lower bound: unsigned AI code counts as human.</text>
${body}
${legend}
</svg>
`;
}
