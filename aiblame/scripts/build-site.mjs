#!/usr/bin/env node
// Build the leaderboard website from a folder of `aiblame --json` reports.
//
//   node scripts/build-site.mjs <reports-dir> <out-dir> [--repo-url URL]
//
// Writes <out-dir>/index.html (a complete page, e.g. for GitHub Pages) and
// <out-dir>/fragment.html (the same page without the document skeleton).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentInfo, HUMAN, isAI, isCode } from "../dist/index.js";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv.splice(i, 2)[1] : fallback;
};
const repoUrl = flag("--repo-url", "https://github.com/bobaoxu2001/openclaw/tree/main/aiblame");
const [dir, out] = argv;
if (!dir || !out) throw new Error("usage: build-site.mjs <reports-dir> <out-dir> [--repo-url URL]");

const aiOf = (by) => Object.entries(by).reduce((a, [id, n]) => a + (isAI(id) ? n : 0), 0);
const dominant = (by) => {
  let best = HUMAN.id;
  let n = 0;
  for (const [id, v] of Object.entries(by)) if (isAI(id) && v > n) [best, n] = [id, v];
  return best;
};

const repos = [];
const palette = {};
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  let r;
  try {
    r = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch {
    continue;
  }
  if (r?.tool?.name !== "aiblame" || r.mode !== "blame" || !r.totals?.lines) continue;
  let codeLines = 0;
  let codeAi = 0;
  for (const f of r.files) {
    if (!isCode(f.path)) continue;
    codeLines += f.lines;
    codeAi += aiOf(f.by);
  }
  const agents = r.agents.filter((a) => a.lines > 0 || a.commits > 0).map((a) => [a.id, a.lines, a.commits]);
  for (const [id] of agents) palette[id] = [agentInfo(id).name, agentInfo(id).color];
  const files = r.files
    .map((f) => ({ f, ai: aiOf(f.by) }))
    .filter((x) => x.ai > 0 && x.f.lines >= 20)
    .sort((a, b) => b.ai / b.f.lines - a.ai / a.f.lines || b.ai - a.ai)
    .slice(0, 10)
    .map(({ f, ai }) => [f.path, f.lines, ai, dominant(f.by)]);
  const dirs = new Map();
  for (const f of r.files) {
    const parts = f.path.split("/");
    const d = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join("/") + "/" : "./";
    const e = dirs.get(d) ?? { lines: 0, by: {} };
    e.lines += f.lines;
    for (const [id, n] of Object.entries(f.by)) e.by[id] = (e.by[id] ?? 0) + n;
    dirs.set(d, e);
  }
  const topDirs = [...dirs]
    .map(([path, e]) => [path, e.lines, aiOf(e.by), dominant(e.by)])
    .filter((d) => d[2] > 0)
    .sort((a, b) => b[2] - a[2])
    .slice(0, 8);
  const timeline = bucket(r.timeline.filter((m) => m.added > 0));
  repos.push({
    id: r.repo.name.replace("/", "__"),
    name: r.repo.name,
    sha: r.repo.sha.slice(0, 7),
    sample: r.sample ? [r.sample.files, r.sample.of, r.sample.margin] : null,
    lines: r.totals.lines,
    files: r.totals.files,
    ai: r.totals.ai,
    bot: r.totals.bot,
    code: codeLines ? codeAi / codeLines : 0,
    agents,
    commits: [r.commits.total, r.commits.ai],
    authors: [r.commits.humanAuthors, r.commits.aiAssistedAuthors],
    firstAi: r.commits.firstAi ? [r.commits.firstAi.date.slice(0, 10), r.commits.firstAi.agent] : null,
    timeline,
    topFiles: files,
    dirs: topDirs,
    langs: r.languages.slice(0, 6).map((l) => [l.name, l.lines, l.ai]),
    generatedAt: r.generatedAt,
  });
}
palette.human = [HUMAN.name, HUMAN.color];

/** Months, or quarters / years for long histories, as [label, lines, {agent: lines}]. */
function bucket(months) {
  const unit = months.length > 96 ? "year" : months.length > 36 ? "quarter" : "month";
  const out = new Map();
  for (const m of months) {
    const y = m.month.slice(0, 4);
    const key = unit === "year" ? y : unit === "quarter" ? `${y} Q${Math.floor((Number(m.month.slice(5, 7)) - 1) / 3) + 1}` : m.month;
    const e = out.get(key) ?? [key, 0, {}];
    e[1] += m.added;
    for (const [id, n] of Object.entries(m.by)) if (isAI(id)) e[2][id] = (e[2][id] ?? 0) + n;
    out.set(key, e);
  }
  return [...out.values()];
}
palette.bot = [agentInfo("bot").name, agentInfo("bot").color];

const measured = repos.map((r) => r.generatedAt).sort().pop()?.slice(0, 10) ?? "";
const meta = {
  count: repos.length,
  lines: repos.reduce((a, r) => a + r.lines, 0),
  aiCommits: repos.reduce((a, r) => a + r.commits[1], 0),
  measured,
  repoUrl,
};
const data = JSON.stringify({ meta, palette, repos }).replace(/</g, "\\u003c");

const fragment = `<title>aiblame Leaderboard</title>
<meta name="description" content="How much of ${repos.length} popular repositories was written by AI agents, traced line by line with aiblame.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Martian+Mono:wght@400;600;750&family=Onest:wght@400;500;600&display=swap">
<style>${CSS()}</style>
<main class="wrap">
  <header class="top">
    <span class="mark">aiblame</span>
    <a class="gh" href="${repoUrl}">Source on GitHub</a>
  </header>
  <section class="hero">
    <p class="eyebrow">git blame, for the AI era</p>
    <h1>How much of your favourite repo did AI write?</h1>
    <p class="lede">We traced every surviving line of ${repos.length} popular repositories back to the commit that wrote it.
    A line counts as AI-written only when that commit carries an agent's signature, such as
    <code class="trailer">Co-Authored-By: Claude &lt;noreply@anthropic.com&gt;</code>. Unsigned AI code looks human to git,
    so every number here is a floor.</p>
    <div class="cmd"><code id="cmd-hero">npx aiblame owner/repo</code><button type="button" class="copy" data-copy="npx aiblame owner/repo">Copy</button></div>
    <p class="stats" id="stats"></p>
  </section>
  <section class="board" aria-label="Leaderboard">
    <div class="controls">
      <label class="search"><span class="sr">Filter repositories</span><input id="q" type="search" placeholder="Filter repos, e.g. react" autocomplete="off"></label>
      <div class="seg" role="radiogroup" aria-label="Sort by">
        <button type="button" role="radio" aria-checked="true" data-sort="all">AI-written</button>
        <button type="button" role="radio" aria-checked="false" data-sort="code">Code only</button>
        <button type="button" role="radio" aria-checked="false" data-sort="name">A–Z</button>
      </div>
    </div>
    <p class="scale" aria-hidden="true"><span>0%</span><span>share of current lines written by AI</span><span>100%</span></p>
    <ol id="list" class="list"></ol>
    <p id="empty" class="empty" hidden>No repository matches that filter.</p>
    <div class="legend" id="legend" aria-label="Agent colours"></div>
  </section>
  <section class="how">
    <div>
      <h2>How it's measured</h2>
      <p>aiblame lists every text file at <code>HEAD</code>, skipping lockfiles, vendored and generated code. It runs
      <code>git blame -w</code> on each line and classifies the commit that wrote it. Co-author trailers, bot accounts and
      agent footers mark a commit as AI-written. Repos above 4,000 files are sampled; those numbers carry a <code>~</code>
      and a 95% margin of error.</p>
    </div>
    <div>
      <h2>Why the numbers are low</h2>
      <p>Only disclosed AI work counts. An agent run locally with its co-author trailer turned off, or code typed with
      autocomplete, leaves no trace in git. A repo can lean heavily on AI and still score near zero here. The ranking
      rewards disclosure as much as usage.</p>
    </div>
    <div>
      <h2>Measure your own repo</h2>
      <p>Run it on any checkout or public GitHub repo. Add <code>--card</code> for a README card, or use the GitHub Action
      to comment on every pull request.</p>
      <div class="cmd"><code>npx aiblame --card</code><button type="button" class="copy" data-copy="npx aiblame --card">Copy</button></div>
    </div>
  </section>
  <footer class="foot">Measured with aiblame on ${measured}. Numbers change as repos do.</footer>
</main>
<div id="tip" role="tooltip" hidden></div>
<script type="application/json" id="data">${data}</script>
<script>${JS()}</script>
`;

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "fragment.html"), fragment);
writeFileSync(
  join(out, "index.html"),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${fragment}</body>\n</html>\n`,
);
console.log(`${repos.length} repos → ${join(out, "index.html")}`);

function CSS() {
  return `
:root{
  --bg:#FBFAFD;--surface:#F2F0F7;--raised:#FFFFFF;--ink:#1B1726;--muted:#6B6680;--faint:#A39EB5;
  --line:#E4E0EE;--track:#E9E6F1;--accent:#7C3AED;--accent-ink:#FFFFFF;--code:#EFEBF7;
  --display:"Martian Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --body:"Onest",system-ui,-apple-system,"Segoe UI",sans-serif;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0E0C14;--surface:#17141F;--raised:#1D1927;--ink:#ECE9F5;--muted:#9A94AD;--faint:#6A647C;
  --line:#2A2636;--track:#221E2C;--accent:#C084FC;--accent-ink:#17101F;--code:#221D2E;color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#0E0C14;--surface:#17141F;--raised:#1D1927;--ink:#ECE9F5;--muted:#9A94AD;--faint:#6A647C;
  --line:#2A2636;--track:#221E2C;--accent:#C084FC;--accent-ink:#17101F;--code:#221D2E;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 var(--body)}
.wrap{max-width:1040px;margin:0 auto;padding-inline:20px;padding-block:20px 56px;display:grid;gap:56px}
code{font:0.86em/1.4 var(--display);background:var(--code);padding:1px 5px;border-radius:4px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.top{display:flex;justify-content:space-between;align-items:center;gap:16px}
.mark{font:600 15px/1 var(--display);color:var(--accent);letter-spacing:.02em}
.gh{color:var(--muted);font-size:14px;text-decoration:none;border-bottom:1px solid var(--line)}
.gh:hover{color:var(--ink)}
.hero{display:grid;gap:18px;max-width:760px}
.eyebrow{margin:0;font:600 12px/1 var(--display);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
h1{margin:0;font:750 clamp(30px,5.4vw,52px)/1.08 var(--display);letter-spacing:-.035em;text-wrap:balance}
.lede{margin:0;font-size:18px;color:var(--muted);max-width:65ch}
.lede code.trailer{color:var(--ink);overflow-wrap:anywhere}
.cmd{display:flex;align-items:center;gap:0;width:max-content;max-width:100%;border:1px solid var(--line);border-radius:8px;background:var(--raised);overflow:hidden}
.cmd code{background:none;padding:10px 14px;font-size:14px;overflow-x:auto;white-space:nowrap}
.copy{font:600 13px/1 var(--body);border:0;border-left:1px solid var(--line);background:var(--surface);color:var(--ink);padding:0 14px;align-self:stretch;cursor:pointer}
.copy:hover{background:var(--accent);color:var(--accent-ink)}
.stats{margin:0;font:13px/1.5 var(--display);color:var(--muted);font-variant-numeric:tabular-nums}
.board{display:grid;gap:14px}
.controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.search input{font:15px var(--body);color:var(--ink);background:var(--raised);border:1px solid var(--line);border-radius:8px;padding:9px 12px;width:min(320px,100%)}
.search{flex:1 1 220px;display:flex}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--raised)}
.seg button{font:500 13px/1 var(--body);color:var(--muted);background:none;border:0;padding:9px 12px;cursor:pointer}
.seg button+button{border-left:1px solid var(--line)}
.seg button[aria-checked="true"]{background:var(--ink);color:var(--bg)}
.scale{margin:0;display:grid;grid-template-columns:auto 1fr auto;gap:8px;font:11px/1 var(--display);color:var(--faint);padding-left:calc(2.6em + 30% + 28px);padding-right:calc(5.4em + 14px)}
.scale span:nth-child(2){text-align:center}
.list{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.list li{border-bottom:1px solid var(--line)}
.row{all:unset;box-sizing:border-box;display:grid;grid-template-columns:2.6em 30% 1fr 5.4em;align-items:center;gap:0 14px;width:100%;padding:12px 4px;cursor:pointer}
.row:hover{background:var(--surface)}
.row:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.rank{font:500 13px/1 var(--display);color:var(--faint);font-variant-numeric:tabular-nums}
.who{min-width:0;display:grid;gap:3px}
.name{font:500 15px/1.3 var(--body);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.name .owner{color:var(--muted)}
.name b{font-weight:600}
.agents{font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;vertical-align:0}
.bar{display:flex;height:14px;background:var(--track);border-radius:4px;overflow:hidden}
.bar i{display:block;height:100%;box-shadow:inset -2px 0 0 var(--bg)}
.pct{font:600 17px/1 var(--display);text-align:right;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.pct.zero{color:var(--faint)}
.detail{padding:6px 4px 26px calc(2.6em + 14px);display:grid;gap:22px}
.summary{margin:0;color:var(--muted);font-size:14px;max-width:80ch}
.summary b{color:var(--ink);font-weight:600}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:22px 36px}
.detail h3{margin:0 0 8px;font:600 11px/1 var(--display);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.tbl{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}
.tbl td{padding:5px 0;border-bottom:1px solid var(--line);vertical-align:baseline}
.tbl td.n{text-align:right;color:var(--muted);padding-left:10px;white-space:nowrap}
.tbl td.p{text-align:right;font-family:var(--display);font-size:12.5px;width:4.6em;white-space:nowrap}
.tbl td.p:first-child{padding-right:14px}
.detail>*,.cols>*,.who{min-width:0}
.summary{overflow-wrap:anywhere}
.tbl td.path{font:12.5px var(--display);word-break:break-all}
.months svg{width:100%;height:auto;display:block}
.months text{fill:var(--muted);font:10px var(--display)}
.actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.actions a{color:var(--ink);font-size:14px}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--muted);padding-top:6px}
.empty{color:var(--muted);margin:0;padding:18px 4px}
.how{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:28px;border-top:1px solid var(--line);padding-top:32px}
.how h2{margin:0 0 8px;font:600 15px/1.3 var(--display);letter-spacing:-.01em}
.how p{margin:0 0 12px;color:var(--muted);font-size:15px}
.foot{color:var(--faint);font-size:13px}
#tip{position:fixed;z-index:10;pointer-events:none;background:var(--raised);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px 9px;font-size:12.5px;box-shadow:0 6px 20px rgba(20,12,40,.18);max-width:260px}
@media (max-width:640px){
  .row{grid-template-columns:2em 1fr 4.6em;gap:6px 10px}
  .row .bar{grid-column:2 / 4;grid-row:2}
  .scale{display:none}
  .detail{padding-left:4px}
  .pct{font-size:15px}
}
@media (prefers-reduced-motion:no-preference){.bar i{transition:width .5s ease}}
`;
}

function JS() {
  return String.raw`
(function () {
  var D = JSON.parse(document.getElementById("data").textContent);
  var P = D.palette, repos = D.repos;
  var $ = function (id) { return document.getElementById(id); };
  function num(n) { return n.toLocaleString("en-US"); }
  function pct(s) {
    if (!s) return "0%";
    var p = s * 100;
    if (p < 0.1) return "<0.1%";
    return (p >= 10 ? p.toFixed(1).replace(/\.0$/, "") : p.toFixed(1)) + "%";
  }
  function name(id) { return (P[id] || [id])[0]; }
  function color(id) { return (P[id] || [id, "#C084FC"])[1]; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  repos.forEach(function (r) { r.share = r.ai / r.lines; });
  $("stats").textContent = D.meta.count + " repos · " + num(D.meta.lines) + " lines traced · " +
    num(D.meta.aiCommits) + " AI-signed commits · measured " + D.meta.measured;

  // Legend: every agent that appears, most-used first.
  var used = {};
  repos.forEach(function (r) { r.agents.forEach(function (a) { if (a[1] > 0) used[a[0]] = (used[a[0]] || 0) + a[1] / r.lines; }); });
  Object.keys(used).sort(function (a, b) { return used[b] - used[a]; }).forEach(function (id) {
    $("legend").appendChild(el("span", "", '<i class="dot" style="background:' + color(id) + '"></i>' + esc(name(id))));
  });

  var tip = $("tip");
  function showTip(e, html) {
    tip.innerHTML = html; tip.hidden = false;
    var x = e.clientX + 12, y = e.clientY + 14, r = tip.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 12;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.hidden = true; }

  function bar(r) {
    var b = el("span", "bar");
    b.setAttribute("role", "img");
    b.setAttribute("aria-label", pct(r.share) + " written by AI");
    r.agents.forEach(function (a) {
      if (!a[1]) return;
      var s = el("i");
      s.style.width = (a[1] / r.lines * 100) + "%";
      s.style.background = color(a[0]);
      s.addEventListener("mousemove", function (e) {
        showTip(e, "<b>" + esc(name(a[0])) + "</b> " + pct(a[1] / r.lines) + "<br>" + num(a[1]) + " lines, " + num(a[2]) + " commits");
      });
      s.addEventListener("mouseleave", hideTip);
      b.appendChild(s);
    });
    return b;
  }

  function monthsChart(r) {
    var ms = r.timeline;
    if (ms.length < 2) return null;
    var ns = "http://www.w3.org/2000/svg", W = 600, H = 120, pad = 16, n = ms.length, cw = W / n, gap = Math.min(2, cw * 0.25);
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + (H + pad));
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Share of surviving lines written by AI, by when they were written");
    ms.forEach(function (m, i) {
      var track = document.createElementNS(ns, "rect");
      track.setAttribute("x", i * cw + gap / 2); track.setAttribute("y", 0);
      track.setAttribute("width", Math.max(1, cw - gap)); track.setAttribute("height", H);
      track.setAttribute("rx", 2); track.setAttribute("fill", "var(--track)");
      svg.appendChild(track);
      var y = H, ai = 0;
      Object.keys(m[2]).sort(function (a, b) { return m[2][b] - m[2][a]; }).forEach(function (id) {
        var h = m[2][id] / m[1] * H; ai += m[2][id];
        if (h <= 0) return;
        var rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", i * cw + gap / 2); rect.setAttribute("width", Math.max(1, cw - gap));
        rect.setAttribute("y", y - h); rect.setAttribute("height", h); rect.setAttribute("fill", color(id));
        svg.appendChild(rect); y -= h;
      });
      var hit = document.createElementNS(ns, "rect");
      hit.setAttribute("x", i * cw); hit.setAttribute("y", 0); hit.setAttribute("width", cw); hit.setAttribute("height", H);
      hit.setAttribute("fill", "transparent");
      hit.addEventListener("mousemove", function (e) {
        var rows = Object.keys(m[2]).sort(function (a, b) { return m[2][b] - m[2][a]; }).slice(0, 4).map(function (id) {
          return '<i class="dot" style="background:' + color(id) + '"></i>' + esc(name(id)) + " " + pct(m[2][id] / m[1]);
        }).join("<br>");
        showTip(e, "<b>" + m[0] + "</b>: " + pct(ai / m[1]) + " AI of " + num(m[1]) + " surviving lines" + (rows ? "<br>" + rows : ""));
      });
      hit.addEventListener("mouseleave", hideTip);
      svg.appendChild(hit);
    });
    [[0, "start"], [n - 1, "end"]].forEach(function (p) {
      var t = document.createElementNS(ns, "text");
      t.setAttribute("x", p[1] === "start" ? 0 : W); t.setAttribute("y", H + 12);
      t.setAttribute("text-anchor", p[1]); t.textContent = ms[p[0]][0];
      svg.appendChild(t);
    });
    return svg;
  }

  function table(rows, cols) {
    var t = el("table", "tbl");
    rows.forEach(function (r) { var tr = el("tr"); cols(r).forEach(function (c) { tr.appendChild(el("td", c[0], c[1])); }); t.appendChild(tr); });
    return t;
  }

  function detail(r) {
    var d = el("div", "detail");
    d.id = "d-" + r.id;
    d.hidden = true;
    var bits = ["<b>" + num(r.lines) + "</b> lines in " + num(r.files) + " files",
      "<b>" + num(r.commits[1]) + "</b> of " + num(r.commits[0]) + " commits AI-signed"];
    if (r.firstAi) bits.push("first AI commit " + r.firstAi[0] + " (" + esc(name(r.firstAi[1])) + ")");
    if (r.authors[0]) bits.push(pct(r.authors[1] / r.authors[0]) + " of human contributors ship AI commits");
    if (r.sample) bits.push("estimated from " + num(r.sample[0]) + " random files of " + num(r.sample[1]) + ", ±" + (r.sample[2] * 100).toFixed(1) + "%");
    d.appendChild(el("p", "summary", bits.join(" · ")));

    var cols = el("div", "cols");
    var who = el("div");
    who.appendChild(el("h3", "", "Who wrote it"));
    var rows = r.agents.filter(function (a) { return a[1] > 0; }).map(function (a) { return [a[0], a[1], a[2]]; });
    if (r.bot) rows.push(["bot", r.bot, null]);
    rows.push(["human", r.lines - r.ai - r.bot, null]);
    who.appendChild(table(rows, function (a) {
      return [["", '<i class="dot" style="background:' + color(a[0]) + '"></i>' + esc(name(a[0]))],
        ["n", num(a[1]) + " lines"], ["p", pct(a[1] / r.lines)]];
    }));
    var quiet = r.agents.filter(function (a) { return !a[1] && a[2]; });
    if (quiet.length) who.appendChild(el("p", "summary", "Also in history, with no surviving lines: " +
      quiet.map(function (a) { return esc(name(a[0])) + " (" + num(a[2]) + ")"; }).join(", ")));
    cols.appendChild(who);
    var chart = monthsChart(r);
    if (chart) {
      var m = el("div", "months");
      m.appendChild(el("h3", "", "Current code, by when it was written"));
      m.appendChild(chart);
      cols.appendChild(m);
    }
    if (r.topFiles.length) {
      var f = el("div");
      f.appendChild(el("h3", "", "Most AI-written files"));
      f.appendChild(table(r.topFiles, function (x) {
        return [["p", pct(x[2] / x[1])], ["path", esc(x[0])], ["n", '<i class="dot" style="background:' + color(x[3]) + '"></i>' + num(x[1])]];
      }));
      cols.appendChild(f);
    }
    if (r.dirs.length) {
      var g = el("div");
      g.appendChild(el("h3", "", "Where the AI code lives"));
      g.appendChild(table(r.dirs, function (x) {
        return [["p", pct(x[2] / x[1])], ["path", esc(x[0])], ["n", num(x[1]) + " lines"]];
      }));
      cols.appendChild(g);
    }
    d.appendChild(cols);
    var cmd = "npx aiblame " + r.name;
    var act = el("div", "actions");
    act.innerHTML = '<div class="cmd"><code>' + esc(cmd) + '</code><button type="button" class="copy" data-copy="' + esc(cmd) + '">Copy</button></div>' +
      '<a href="https://github.com/' + esc(r.name) + '">' + esc(r.name) + " on GitHub</a>";
    d.appendChild(act);
    return d;
  }

  // Build every row once; sorting and filtering only reorder and hide them.
  var items = repos.map(function (r) {
    var li = el("li");
    li.id = r.id;
    var btn = el("button", "row");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "d-" + r.id);
    var parts = r.name.split("/");
    var top = r.agents.filter(function (a) { return a[1] > 0; }).slice(0, 3).map(function (a) {
      return '<i class="dot" style="background:' + color(a[0]) + '"></i>' + esc(name(a[0])) + " " + pct(a[1] / r.lines);
    }).join(" &nbsp;");
    btn.innerHTML = '<span class="rank"></span><span class="who"><span class="name"><span class="owner">' + esc(parts[0]) + "/</span><b>" +
      esc(parts[1]) + '</b></span><span class="agents">' + (top || "No AI signatures found") + "</span></span>";
    btn.appendChild(bar(r));
    btn.appendChild(el("span", "pct"));
    var d = detail(r);
    btn.addEventListener("click", function () { toggle(r, btn, d); });
    li.appendChild(btn);
    li.appendChild(d);
    return { r: r, li: li, btn: btn, d: d };
  });

  function toggle(r, btn, d, open) {
    var show = open != null ? open : d.hidden;
    d.hidden = !show;
    btn.setAttribute("aria-expanded", String(show));
    try { history.replaceState(null, "", show ? "#" + r.id : location.pathname + location.search); } catch (e) {}
  }

  var sortBy = "all";
  function render() {
    var q = $("q").value.trim().toLowerCase();
    var key = function (r) { return sortBy === "code" ? r.code : r.share; };
    var sorted = items.slice().sort(function (a, b) {
      return sortBy === "name" ? a.r.name.localeCompare(b.r.name) : key(b.r) - key(a.r) || a.r.name.localeCompare(b.r.name);
    });
    var list = $("list"), shown = 0;
    sorted.forEach(function (it, i) {
      it.li.querySelector(".rank").textContent = String(i + 1).padStart(2, "0");
      var p = it.li.querySelector(".pct");
      var v = key(it.r);
      p.textContent = (it.r.sample ? "~" : "") + pct(v);
      p.classList.toggle("zero", v === 0);
      it.li.hidden = q !== "" && it.r.name.toLowerCase().indexOf(q) < 0;
      if (!it.li.hidden) shown++;
      list.appendChild(it.li);
    });
    $("empty").hidden = shown > 0;
  }
  $("q").addEventListener("input", render);
  Array.prototype.forEach.call(document.querySelectorAll(".seg button"), function (b) {
    b.addEventListener("click", function () {
      sortBy = b.getAttribute("data-sort");
      Array.prototype.forEach.call(document.querySelectorAll(".seg button"), function (x) { x.setAttribute("aria-checked", String(x === b)); });
      render();
    });
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".copy");
    if (!b) return;
    e.stopPropagation();
    var text = b.getAttribute("data-copy");
    var done = function () { var t = b.textContent; b.textContent = "Copied"; setTimeout(function () { b.textContent = t; }, 1400); };
    try {
      navigator.clipboard.writeText(text).then(done, function () { select(b); });
    } catch (err) { select(b); }
  });
  function select(b) {
    var code = b.parentNode.querySelector("code");
    var range = document.createRange(); range.selectNodeContents(code);
    var s = getSelection(); s.removeAllRanges(); s.addRange(range);
  }
  render();
  var hash = location.hash.slice(1);
  var target = items.filter(function (it) { return it.r.id === hash; })[0] || null;
  if (target) { toggle(target.r, target.btn, target.d, true); target.li.scrollIntoView({ block: "start" }); }
  else if (items.length) {
    // Open the leader so the page shows what a breakdown looks like.
    var first = $("list").firstChild;
    var it = items.filter(function (x) { return x.li === first; })[0];
    if (it) { it.d.hidden = false; it.btn.setAttribute("aria-expanded", "true"); }
  }
})();
`;
}
