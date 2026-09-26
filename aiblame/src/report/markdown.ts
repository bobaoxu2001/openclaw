import { agentInfo, HUMAN, isAI } from "../agents.js";
import type { DiffReport } from "../diff.js";
import { rgb } from "../util/ansi.js";
import { allocate, num, pct } from "./common.js";

/** Marker used to find (and update) the bot's own comment on a pull request. */
export const COMMENT_MARKER = "<!-- aiblame -->";

const SQUARES: Array<[string, string]> = [
  ["🟥", "#DD2E44"],
  ["🟧", "#F4900C"],
  ["🟨", "#FDCB58"],
  ["🟩", "#78B159"],
  ["🟦", "#55ACEE"],
  ["🟪", "#AA8ED6"],
  ["🟫", "#C1694F"],
];

/** Hand-picked squares for the agents people will recognise at a glance. */
const FIXED: Record<string, string> = {
  "claude-code": "🟧",
  copilot: "🟪",
  cursor: "🟦",
  codex: "🟩",
  gemini: "🟦",
  amp: "🟥",
  openhands: "🟨",
  aider: "🟩",
  devin: "🟩",
  jules: "🟪",
};

/** The coloured emoji square for an agent (Markdown has no colours of its own). */
export function square(id: string): string {
  if (id === HUMAN.id) return "⬜";
  if (id === "bot") return "⬛";
  if (FIXED[id]) return FIXED[id]!;
  const [r, g, b] = rgb(agentInfo(id).color);
  let best = SQUARES[0]!;
  let bestD = Infinity;
  for (const s of SQUARES) {
    const [r2, g2, b2] = rgb(s[1]);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best[0];
}

/** A pull-request comment: how much of what this PR adds was written by AI. */
export function renderDiffMarkdown(r: DiffReport, opts: { maxFiles?: number } = {}): string {
  const out: string[] = [COMMENT_MARKER];
  const t = r.totals;
  if (t.lines === 0) {
    out.push("### aiblame: this pull request adds no lines to attribute");
    return out.join("\n") + "\n";
  }
  const share = pct(t.ai, t.lines);
  out.push(
    t.ai > 0
      ? `### 🤖 aiblame: ${share} of the lines this pull request adds were written by AI`
      : "### aiblame: no AI signatures on the lines this pull request adds",
  );
  out.push("");

  const rows: Array<{ id: string; name: string; lines: number }> = r.agents
    .filter((a) => a.lines > 0)
    .map((a) => ({ id: a.id, name: a.name, lines: a.lines }));
  if (t.bot) rows.push({ id: "bot", name: agentInfo("bot").name, lines: t.bot });
  if (t.human) rows.push({ id: HUMAN.id, name: HUMAN.name, lines: t.human });
  const cells = allocate(rows.map((x) => x.lines), 20);
  out.push(rows.map((x, i) => square(x.id).repeat(cells[i]!)).join(""));
  out.push("");
  out.push("| | Lines | Share |");
  out.push("|---|---:|---:|");
  for (const x of rows) out.push(`| ${square(x.id)} ${x.name} | ${num(x.lines)} | ${pct(x.lines, t.lines)} |`);
  out.push("");

  const maxFiles = opts.maxFiles ?? 15;
  if (r.files.length > 1) {
    out.push(`<details><summary>By file (${num(r.files.length)})</summary>`);
    out.push("");
    out.push("| File | Added | AI | Mostly |");
    out.push("|---|---:|---:|---|");
    for (const f of r.files.slice(0, maxFiles)) {
      let ai = 0;
      let top: string = HUMAN.id;
      let topN = 0;
      for (const [id, n] of Object.entries(f.by)) {
        if (isAI(id)) ai += n;
        if (n > topN) {
          top = id;
          topN = n;
        }
      }
      const name = top === HUMAN.id ? HUMAN.name : agentInfo(top).name;
      out.push(`| \`${f.path.replace(/\|/g, "\\|")}\` | ${num(f.lines)} | ${pct(ai, f.lines)} | ${square(top)} ${name} |`);
    }
    if (r.files.length > maxFiles) out.push(`| …and ${num(r.files.length - maxFiles)} more | | | |`);
    out.push("");
    out.push("</details>");
    out.push("");
  }

  const commits = `${num(r.commits.ai)} of ${num(r.commits.total)} commit${r.commits.total === 1 ? "" : "s"} carry an AI signature`;
  out.push(
    `<sub>${commits}. Measured by <a href="https://www.npmjs.com/package/aiblame">aiblame</a> from co-author trailers, ` +
      "bot accounts and agent footers. A lower bound: unsigned AI code counts as human.</sub>",
  );
  return out.join("\n") + "\n";
}
