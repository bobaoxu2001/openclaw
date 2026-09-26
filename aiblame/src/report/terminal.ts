import { agentInfo, HUMAN, isAI } from "../agents.js";
import type { Report } from "../analyze.js";
import type { DiffReport } from "../diff.js";
import { padEnd, padStart, type Painter, truncLeft, width } from "../util/ansi.js";
import {
  aiShare,
  allocate,
  directories,
  dominantAgent,
  headline,
  margin,
  num,
  pct,
  scopeLabel,
  segments,
  shortSha,
  timelineTitle,
  topAiFiles,
} from "./common.js";

const SPARK = "▁▂▃▄▅▆▇█";
const AI_ACCENT = "#C084FC";

export function renderTerminal(r: Report, p: Painter, opts: { columns?: number; top?: number } = {}): string {
  const W = Math.max(60, Math.min(opts.columns ?? 88, 110));
  const top = opts.top ?? 8;
  const out: string[] = [];
  const line = (s = "") => out.push(s ? `  ${s}` : "");
  const heading = (s: string) => {
    line();
    line(p.bold(p.dim(s.toUpperCase())));
  };

  // --- Header -------------------------------------------------------------
  line();
  const where = [r.repo.branch, `@ ${shortSha(r.repo.sha)}`].filter(Boolean).join(" ");
  line(`${p.bold(p.fg(AI_ACCENT, "aiblame"))}  ${p.bold(r.repo.name)} ${p.dim(where)}`);
  const unit = r.mode === "history" ? "lines added" : "lines";
  line(p.dim(`${num(r.totals.files)} files · ${num(r.totals.lines)} ${unit} · ${num(r.commits.total)} commits`));

  if (r.totals.lines === 0) {
    line();
    line("Nothing to attribute: no text files matched.");
    line();
    return out.join("\n");
  }

  // --- The big bar ----------------------------------------------------------
  const barW = W - 4;
  const segs = segments(r);
  const cells = allocate(segs.map((s) => s.lines), barW);
  line();
  line(segs.map((s, i) => p.fg(s.id === HUMAN.id ? "#3F3F46" : s.color, (s.id === HUMAN.id ? "░" : "█").repeat(cells[i]!))).join(""));
  const share = aiShare(r);
  const big = p.bold(p.fg(AI_ACCENT, headline(r))) + (margin(r) ? p.dim(` ${margin(r)}`) : "");
  const parts = [`${big} ${p.bold("written by AI")}`, `${pct(r.totals.human, r.totals.lines)} human`];
  if (r.totals.bot) parts.push(`${pct(r.totals.bot, r.totals.lines)} bots`);
  line(parts.join(p.dim("  ·  ")) + p.dim(`  ${scopeLabel(r)}`));
  if (r.sample) {
    line(p.dim(`Estimated from ${num(r.sample.files)} random files of ${num(r.sample.of)}. Use --full for exact numbers.`));
  }
  if (share === 0 && r.commits.ai === 0) {
    line(p.dim("No AI signatures found. Either this repo is hand-crafted, or its agents are keeping quiet."));
  }

  // --- Agents table -----------------------------------------------------------
  const rows = r.agents.filter((a) => a.lines > 0);
  if (rows.length) {
    heading("Who wrote it");
    const nameW = Math.max(14, ...rows.map((a) => width(a.name))) + 2;
    const mini = Math.max(6, W - nameW - 36);
    const maxLines = Math.max(...rows.map((a) => a.lines), r.totals.human);
    line(p.dim(`${padEnd("", nameW + 2)}${padStart("lines", 10)}${padStart("share", 8)}${padStart("commits", 9)}`));
    const row = (color: string, name: string, lines: number, commits: number | null, dim = false) => {
      const bar = "█".repeat(Math.max(lines > 0 ? 1 : 0, Math.round((lines / maxLines) * mini)));
      const text = `${padEnd(name, nameW)}${padStart(num(lines), 10)}${padStart(pct(lines, r.totals.lines), 8)}${padStart(commits === null ? "" : num(commits), 9)}  `;
      line(`${p.fg(color, "■")} ${dim ? p.dim(text) : text}${p.fg(color, bar)}`);
    };
    for (const a of rows) row(a.color, a.name, a.lines, a.commits);
    if (r.totals.bot) row(agentInfo("bot").color, agentInfo("bot").name, r.totals.bot, r.commits.bot, true);
    row(HUMAN.color, HUMAN.name, r.totals.human, r.commits.total - r.commits.ai - r.commits.bot, true);
  }

  // --- Timeline ---------------------------------------------------------------
  const tl = r.timeline.filter((m) => m.added > 0);
  if (tl.length >= 2 && r.commits.ai > 0) {
    heading(timelineTitle(r));
    const maxMonths = Math.max(6, Math.min(36, Math.floor((W - 30) / 2)));
    const recent = tl.slice(-maxMonths);
    const spark = recent
      .map((m) => {
        const s = m.ai / m.added;
        const ch = s === 0 ? p.dim("·") : SPARK[Math.min(SPARK.length - 1, Math.floor(s * SPARK.length))]!;
        const dom = dominantAgent(m.by);
        return (s === 0 ? ch : p.fg(dom ? agentInfo(dom).color : AI_ACCENT, ch)) + " ";
      })
      .join("");
    const peak = recent.reduce((a, b) => (b.ai / b.added > a.ai / a.added ? b : a));
    const last = recent[recent.length - 1]!;
    line(`${p.dim(recent[0]!.month)}  ${spark} ${p.dim(last.month)}`);
    line(
      p.dim(`latest ${pct(last.ai, last.added)} · peak ${pct(peak.ai, peak.added)} in ${peak.month}`) +
        (r.commits.firstAi
          ? p.dim(` · first AI commit ${r.commits.firstAi.date.slice(0, 10)} (${agentInfo(r.commits.firstAi.agent).name})`)
          : ""),
    );
  }

  // --- Files ------------------------------------------------------------------
  const files = topAiFiles(r.files, top);
  if (files.length) {
    heading("Most AI-written files");
    const pathW = W - 34;
    for (const f of files) {
      const dom = dominantAgent(f.by);
      const info = dom ? agentInfo(dom) : HUMAN;
      line(
        `${padStart(pct(f.ai, f.lines), 6)}  ${padEnd(truncLeft(f.path, pathW), pathW)} ${p.dim(padStart(num(f.lines), 7))}  ${p.fg(info.color, info.short)}`,
      );
    }
  }

  // --- Directories --------------------------------------------------------------
  const dirs = directories(r.files)
    .filter((d) => d.ai > 0)
    .sort((a, b) => b.ai - a.ai)
    .slice(0, top);
  if (dirs.length > 1) {
    heading("Where the AI code lives");
    const pathW = Math.min(40, W - 36);
    for (const d of dirs) {
      const barCells = 16;
      const filled = Math.round((d.ai / d.lines) * barCells);
      const dom = dominantAgent(d.by);
      const bar = p.fg(dom ? agentInfo(dom).color : AI_ACCENT, "█".repeat(filled)) + p.fg("#3F3F46", "░".repeat(barCells - filled));
      line(`${padStart(pct(d.ai, d.lines), 6)}  ${bar}  ${padEnd(truncLeft(d.path, pathW), pathW)} ${p.dim(num(d.lines) + " lines")}`);
    }
  }

  // --- Evidence -------------------------------------------------------------------
  heading("Evidence");
  line(
    `${num(r.evidence.signedCommits)} of ${num(r.commits.total)} commits are AI-signed` +
      p.dim(" (co-author trailers, bot accounts, agent footers)"),
  );
  if (r.evidence.transcripts.length) {
    const bits = r.evidence.transcripts.map((t) => `${agentInfo(t.agent).name}: ${t.files} session${t.files === 1 ? "" : "s"}`);
    line(
      (r.evidence.transcriptLines
        ? `${num(r.evidence.transcriptLines)} more lines matched in local agent transcripts `
        : "No unsigned agent code found in local agent transcripts ") + p.dim(`(${bits.join(", ")})`),
    );
  }
  const gone = r.agents.filter((a) => a.lines === 0 && a.commits > 0);
  if (gone.length) {
    line(
      p.dim("No surviving lines from: ") +
        gone.map((a) => `${a.name} ${p.dim(`(${num(a.commits)} commit${a.commits === 1 ? "" : "s"})`)}`).join(p.dim(", ")),
    );
  }
  if (r.commits.humanAuthors > 0 && r.commits.aiAssistedAuthors > 0) {
    line(`${num(r.commits.aiAssistedAuthors)} of ${num(r.commits.humanAuthors)} human contributors have shipped AI-assisted commits`);
  }
  if (r.repo.shallow) line(p.fg("#FACC15", "Shallow clone: lines older than the clone boundary are all blamed on one commit."));
  line(p.dim("This is a lower bound: AI code committed without a signature looks human to git."));
  line();
  line(`${p.dim("Share it:")} aiblame --card  ${p.dim("·")}  aiblame --badge  ${p.dim("·")}  aiblame --html`);
  line();
  return out.join("\n");
}

/** Terminal summary for `aiblame diff`. */
export function renderDiffTerminal(r: DiffReport, p: Painter, opts: { columns?: number; top?: number } = {}): string {
  const W = Math.max(60, Math.min(opts.columns ?? 88, 110));
  const out: string[] = [];
  const line = (s = "") => out.push(s ? `  ${s}` : "");
  const t = r.totals;
  line();
  line(
    `${p.bold(p.fg(AI_ACCENT, "aiblame diff"))}  ${p.bold(`${r.base}...${r.head}`)} ` +
      p.dim(`${num(r.commits.total)} commit${r.commits.total === 1 ? "" : "s"} · ${num(t.files)} files · +${num(t.lines)} lines`),
  );
  if (t.lines === 0) {
    line();
    line("This branch adds no lines to attribute.");
    line();
    return out.join("\n");
  }
  const rows: Array<{ id: string; name: string; color: string; lines: number }> = r.agents
    .filter((a) => a.lines > 0)
    .map((a) => ({ id: a.id, name: a.name, color: a.color, lines: a.lines }));
  if (t.bot) rows.push({ id: "bot", name: agentInfo("bot").name, color: agentInfo("bot").color, lines: t.bot });
  if (t.human) rows.push({ id: HUMAN.id, name: HUMAN.name, color: HUMAN.color, lines: t.human });
  const cells = allocate(rows.map((x) => x.lines), W - 4);
  line();
  line(rows.map((x, i) => p.fg(x.id === HUMAN.id ? "#3F3F46" : x.color, (x.id === HUMAN.id ? "░" : "█").repeat(cells[i]!))).join(""));
  line(`${p.bold(p.fg(AI_ACCENT, pct(t.ai, t.lines)))} ${p.bold("of the added lines were written by AI")}`);
  line();
  const nameW = Math.max(14, ...rows.map((x) => width(x.name))) + 2;
  for (const x of rows) {
    const text = `${padEnd(x.name, nameW)}${padStart(num(x.lines), 9)}${padStart(pct(x.lines, t.lines), 8)}`;
    line(`${p.fg(x.color, "■")} ${x.id === HUMAN.id || x.id === "bot" ? p.dim(text) : text}`);
  }
  const files = r.files.slice(0, opts.top ?? 8);
  if (files.length > 1) {
    line();
    line(p.bold(p.dim("FILES")));
    const pathW = W - 26;
    for (const f of files) {
      const ai = Object.entries(f.by).reduce((a, [id, n]) => a + (isAI(id) ? n : 0), 0);
      const dom = dominantAgent(f.by);
      const label = dom ? p.fg(agentInfo(dom).color, agentInfo(dom).short) : p.dim("human");
      line(`${padStart(pct(ai, f.lines), 6)}  ${padEnd(truncLeft(f.path, pathW), pathW)} ${p.dim(padStart("+" + num(f.lines), 7))}  ${label}`);
    }
  }
  line();
  line(p.dim(`${num(r.commits.ai)} of ${num(r.commits.total)} commits on this branch are AI-signed. A lower bound: unsigned AI code counts as human.`));
  line();
  return out.join("\n");
}
