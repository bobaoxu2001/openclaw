import type { Report } from "../analyze.js";
import { aiShare, allocate, headline, num, pct, segments } from "./common.js";

/** Verdana 11px advance widths (the shields.io font), for badge text layout. */
const NARROW = new Set("fijlrtI!.,:;'|()[]{} ".split(""));
const WIDE = new Set("mwMW%@".split(""));
function textWidth(s: string, size = 11): number {
  let w = 0;
  for (const ch of s) w += NARROW.has(ch) ? 3.9 : WIDE.has(ch) ? 10.2 : /[A-Z0-9]/.test(ch) ? 7.5 : 6.6;
  return (w * size) / 11;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * A shields-style badge whose value side carries a tiny stacked bar of the
 * agents that wrote the code:  [ AI-written | ▮▮▮ 41% ]
 */
export function renderBadge(r: Report, opts: { label?: string } = {}): string {
  const label = opts.label ?? "AI-written";
  const value = headline(r);
  const segs = segments(r).filter((s) => s.id !== "human" && s.id !== "bot");
  const barW = segs.length ? 26 : 0;
  const lw = Math.round(textWidth(label) + 12);
  const vw = Math.round(textWidth(value) + 12 + (barW ? barW + 5 : 0));
  const w = lw + vw;
  const ai = r.totals.ai;
  const cells = allocate(segs.map((s) => s.lines), barW);
  let x = lw + 6;
  const rects = segs
    .map((s, i) => {
      const rect = cells[i] ? `<rect x="${x}" y="6" width="${cells[i]}" height="8" fill="${s.color}"/>` : "";
      x += cells[i]!;
      return rect;
    })
    .join("");
  const bar = barW ? `<rect x="${lw + 6}" y="6" width="${barW}" height="8" fill="#3f3f46"/>${ai ? rects : ""}` : "";
  const tx = lw + 6 + (barW ? barW + 5 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)} (aiblame)</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="#1f1b2e"/>${bar}<rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="start" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
<text x="6" y="15" fill="#010101" fill-opacity=".3">${esc(label)}</text><text x="6" y="14">${esc(label)}</text>
<text x="${tx}" y="15" fill="#010101" fill-opacity=".3">${esc(value)}</text><text x="${tx}" y="14">${esc(value)}</text>
</g></svg>
`;
}

/** JSON for https://img.shields.io/endpoint?url=... */
export function renderShieldsEndpoint(r: Report, opts: { label?: string } = {}): string {
  const share = aiShare(r);
  return (
    JSON.stringify(
      {
        schemaVersion: 1,
        label: opts.label ?? "AI-written",
        message: headline(r),
        color: share >= 0.5 ? "a371f7" : share >= 0.2 ? "c084fc" : share > 0 ? "d8b4fe" : "lightgrey",
        namedLogo: "githubcopilot",
      },
      null,
      2,
    ) + "\n"
  );
}

/**
 * A README card, in the spirit of github-readme-stats. Adapts to light/dark
 * via prefers-color-scheme, which GitHub honours for images.
 */
export function renderCard(r: Report): string {
  const W = 480;
  const H = 172;
  const segs = segments(r);
  const barW = W - 48;
  const cells = allocate(segs.map((s) => s.lines), barW);
  let x = 24;
  const bar = segs
    .map((s, i) => {
      const rect = `<rect x="${x}" y="92" width="${cells[i]}" height="12" ${s.id === "human" ? 'class="hu"' : `fill="${s.color}"`}/>`;
      x += cells[i]!;
      return rect;
    })
    .join("");
  const agents = r.agents.filter((a) => a.lines > 0).slice(0, 4);
  const legend = agents
    .map((a, i) => {
      const lx = 24 + (i % 2) * 216;
      const ly = 128 + Math.floor(i / 2) * 20;
      return `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${a.color}"/><text x="${lx + 16}" y="${ly}" class="t">${esc(a.name)} <tspan class="m">${pct(a.lines, r.totals.lines)}</tspan></text>`;
    })
    .join("");
  const none = agents.length ? "" : `<text x="24" y="132" class="m">No AI signatures found. Hand-crafted, apparently.</text>`;
  const scope = r.mode === "history" ? (r.since ? `of lines added since ${r.since}` : "of all lines ever added") : "of the code is AI-written";
  const name = r.repo.name.length > 34 ? "…" + r.repo.name.slice(-33) : r.repo.name;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(r.repo.name)}: ${pct(r.totals.ai, r.totals.lines)} AI-written">
<title>${esc(r.repo.name)}: ${pct(r.totals.ai, r.totals.lines)} written by AI (aiblame)</title>
<style>
svg{--bg:#ffffff;--fg:#1f2328;--muted:#656d76;--border:#d0d7de;--human:#d0d7de;--accent:#8250df}
@media (prefers-color-scheme:dark){svg{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0;--border:#30363d;--human:#30363d;--accent:#c084fc}}
text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;fill:var(--fg)}
.t{font-size:12px}.m{fill:var(--muted);font-size:12px}.h{font-size:14px;font-weight:600}
.big{font-size:34px;font-weight:700;fill:var(--accent)}.s{font-size:13px;fill:var(--muted)}
.bg{fill:var(--bg);stroke:var(--border)}.hu{fill:var(--human)}
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" class="bg"/>
<text x="24" y="32" class="h">${esc(name)}</text>
<text x="${W - 24}" y="32" class="m" text-anchor="end">${num(r.totals.lines)} lines · aiblame</text>
<text x="24" y="76"><tspan class="big">${headline(r)}</tspan><tspan class="s" dx="10">${esc(scope)}</tspan></text>
<clipPath id="bar"><rect x="24" y="92" width="${barW}" height="12" rx="6"/></clipPath>
<g clip-path="url(#bar)">${bar}</g>
${legend}${none}
</svg>
`;
}
