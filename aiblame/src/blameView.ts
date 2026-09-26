import { relative, resolve, sep } from "node:path";
import { agentInfo, classifyCommit, HUMAN } from "./agents.js";
import { attributeLines, type CommitMeta } from "./analyze.js";
import { blameFile, commitsBySha, openRepo, resolveRev } from "./git.js";
import { num, pct } from "./report/common.js";
import { loadTranscripts } from "./transcripts.js";
import { padEnd, padStart, type Painter } from "./util/ansi.js";

export interface BlameViewOptions {
  file: string;
  cwd?: string;
  rev?: string;
  transcripts?: boolean;
  columns?: number;
}

/** `aiblame blame <file>`: git blame, but the gutter says which agent wrote each line. */
export async function renderBlameView(opts: BlameViewOptions, p: Painter): Promise<string> {
  const cwd = opts.cwd ?? process.cwd();
  const repo = await openRepo(cwd);
  const rel = relative(repo.dir, resolve(cwd, opts.file)).split(sep).join("/");
  const sha = await resolveRev(repo, opts.rev ?? "HEAD");
  const lines = await blameFile(repo, sha, rel);
  const shas = [...new Set(lines.map((l) => l.sha))];
  const commits = new Map<string, CommitMeta>();
  for (const c of await commitsBySha(repo, shas)) {
    commits.set(c.sha, { agent: classifyCommit(c), time: c.commitTime * 1000 });
  }
  const transcripts = opts.transcripts === false || repo.bare ? null : loadTranscripts(repo.dir);
  const { stat, perLine, viaTranscript } = attributeLines(rel, lines, commits, transcripts);

  const out: string[] = [];
  const ai = Object.entries(stat.by).filter(([id]) => id !== HUMAN.id && id !== "bot");
  const aiLines = ai.reduce((a, [, n]) => a + n, 0);
  const parts = ai
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => p.fg(agentInfo(id).color, `${agentInfo(id).name} ${pct(n, stat.lines)}`));
  if (stat.by[HUMAN.id]) parts.push(p.dim(`human ${pct(stat.by[HUMAN.id]!, stat.lines)}`));
  out.push("");
  out.push(`  ${p.bold(rel)} ${p.dim(`@ ${sha.slice(0, 7)} · ${num(stat.lines)} lines`)}`);
  out.push(`  ${p.bold(pct(aiLines, stat.lines) + " AI")}  ${parts.join(p.dim("  ·  "))}`);
  out.push("");
  const numW = String(lines.length).length;
  const cols = opts.columns ?? 0;
  let prevSha = "";
  let prevId = "";
  let anyTranscript = false;
  for (let i = 0; i < lines.length; i++) {
    const id = perLine[i]!;
    const info = id === HUMAN.id ? HUMAN : agentInfo(id);
    const start = lines[i]!.sha !== prevSha || id !== prevId;
    prevSha = lines[i]!.sha;
    prevId = id;
    const mark = viaTranscript[i] ? "*" : " ";
    anyTranscript ||= viaTranscript[i]!;
    const label = start ? padEnd(info.short + mark, 10) + p.dim(lines[i]!.sha.slice(0, 7)) : " ".repeat(17);
    const gutter = p.fg(info.color, "▌");
    let code = lines[i]!.text.replace(/\t/g, "    ");
    const room = cols ? cols - (numW + 24) : 0;
    if (room > 10 && code.length > room) code = code.slice(0, room - 1) + "…";
    const labelColored = id === HUMAN.id ? p.dim(label) : p.fg(info.color, label);
    out.push(`${gutter} ${labelColored} ${p.dim(padStart(String(i + 1), numW))} ${p.dim("│")} ${code}`);
  }
  out.push("");
  if (anyTranscript) out.push(p.dim("  * no signature on the commit; matched against a local agent transcript"));
  out.push("");
  return out.join("\n");
}
