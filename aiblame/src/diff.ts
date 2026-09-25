/**
 * `aiblame diff`: how much of what a branch or pull request adds was written by AI?
 *
 * Takes the lines the branch adds relative to its merge base, blames exactly
 * those lines at the head, and attributes them like the full analysis does.
 */

import { agentInfo, explainCommit, HUMAN, isAI } from "./agents.js";
import { attributeLines, type CommitMeta, type FileStat } from "./analyze.js";
import { makeFilter, type FilterOptions } from "./files.js";
import { blameFile, commitsBySha, openRepo, resolveRev, walkLog, type RepoInfo } from "./git.js";
import { loadTranscripts, type TranscriptIndex } from "./transcripts.js";
import { git, pool } from "./util/proc.js";
import { VERSION } from "./version.js";

export interface DiffOptions extends FilterOptions {
  path: string;
  /** Base branch or commit. Defaults to origin's default branch, then main/master. */
  base?: string;
  head?: string;
  transcripts?: boolean;
  jobs?: number;
}

export interface DiffReport {
  tool: { name: "aiblame"; version: string };
  mode: "diff";
  generatedAt: string;
  base: string;
  head: string;
  mergeBase: string;
  headSha: string;
  commits: { total: number; ai: number; byAgent: Record<string, number> };
  /** Lines the branch adds (as they exist at head), by author. */
  totals: { files: number; lines: number; ai: number; human: number; bot: number };
  agents: Array<{ id: string; name: string; color: string; lines: number; commits: number }>;
  files: FileStat[];
  evidence: { transcriptLines: number };
}

const BASE_CANDIDATES = ["origin/HEAD", "origin/main", "origin/master", "main", "master"];

async function defaultBase(repo: RepoInfo): Promise<string> {
  for (const c of BASE_CANDIDATES) {
    try {
      await resolveRev(repo, c);
      return c;
    } catch {
      /* try the next one */
    }
  }
  throw new Error("could not find a base branch; pass one, e.g. `aiblame diff origin/main`");
}

/** Parse `git diff -U0` output into the added line ranges of each file (new-side numbering). */
export function parseAddedRanges(patch: string): Map<string, Array<[number, number]>> {
  const out = new Map<string, Array<[number, number]>>();
  let file: string | null = null;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = unquote(line.slice(4));
      file = target === "/dev/null" ? null : target.replace(/^b\//, "");
      continue;
    }
    if (!file || !line.startsWith("@@")) continue;
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) continue;
    let list = out.get(file);
    if (!list) out.set(file, (list = []));
    list.push([start, count]);
  }
  return out;
}

/** Undo git's C-style quoting of unusual paths ("b/na\"me"). */
function unquote(p: string): string {
  if (!p.startsWith('"')) return p;
  return p
    .slice(1, -1)
    .replace(/\\([0-7]{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\(.)/g, (_, c: string) => ({ n: "\n", t: "\t" })[c] ?? c);
}

export async function analyzeDiff(opts: DiffOptions): Promise<DiffReport> {
  const repo = await openRepo(opts.path);
  const head = opts.head ?? "HEAD";
  const base = opts.base ?? (await defaultBase(repo));
  const headSha = await resolveRev(repo, head);
  const baseSha = await resolveRev(repo, base);
  const mergeBase = (await git(["merge-base", baseSha, headSha], { cwd: repo.dir })).trim();
  const filter = makeFilter(opts);

  // Commits on the branch. Merges are left out: they add no code of their own, and on CI
  // the checked-out head is usually a synthetic merge of the PR into its base.
  const commits = new Map<string, CommitMeta>();
  const commitCount = { total: 0, ai: 0, byAgent: {} as Record<string, number> };
  await walkLog(repo, `${mergeBase}..${headSha}`, (c) => {
    const agent = explainCommit(c).id;
    commits.set(c.sha, { agent, time: c.commitTime * 1000 });
    commitCount.total++;
    if (isAI(agent)) {
      commitCount.ai++;
      commitCount.byAgent[agent] = (commitCount.byAgent[agent] ?? 0) + 1;
    }
  }, { noMerges: true });

  // Lines the branch adds, then who wrote each of them.
  const patch = await git(
    ["diff", "-U0", "--no-color", "--no-ext-diff", "--no-renames", "--src-prefix=a/", "--dst-prefix=b/", mergeBase, headSha],
    { cwd: repo.dir },
  );
  const ranges = [...parseAddedRanges(patch)].filter(([path]) => filter(path));
  const transcripts: TranscriptIndex | null = opts.transcripts === false || repo.bare ? null : loadTranscripts(repo.dir);
  const blamed = await pool(ranges, opts.jobs ?? 8, async ([path, r]) => ({
    path,
    lines: await blameFile(repo, headSha, path, { ranges: r }).catch(() => []),
  }));
  // Whitespace-only edits (blame -w) can point at commits older than the branch.
  const missing = [...new Set(blamed.flatMap((b) => b.lines.map((l) => l.sha)))].filter((s) => !commits.has(s));
  for (const c of await commitsBySha(repo, missing)) commits.set(c.sha, { agent: explainCommit(c).id, time: c.commitTime * 1000 });

  const transcriptTally = new Map<string, number>();
  const files = blamed
    .map((b) => attributeLines(b.path, b.lines, commits, transcripts, transcriptTally).stat)
    .filter((f) => f.lines > 0)
    .sort((a, b) => b.lines - a.lines);

  const totals = { files: files.length, lines: 0, ai: 0, human: 0, bot: 0 };
  const byAgent = new Map<string, number>();
  for (const f of files) {
    totals.lines += f.lines;
    for (const [id, n] of Object.entries(f.by)) {
      if (id === HUMAN.id) totals.human += n;
      else if (id === "bot") totals.bot += n;
      else {
        totals.ai += n;
        byAgent.set(id, (byAgent.get(id) ?? 0) + n);
      }
    }
  }
  const ids = new Set([...byAgent.keys(), ...Object.keys(commitCount.byAgent)]);
  const agents = [...ids]
    .map((id) => ({
      id,
      name: agentInfo(id).name,
      color: agentInfo(id).color,
      lines: byAgent.get(id) ?? 0,
      commits: commitCount.byAgent[id] ?? 0,
    }))
    .sort((a, b) => b.lines - a.lines || b.commits - a.commits);

  return {
    tool: { name: "aiblame", version: VERSION },
    mode: "diff",
    generatedAt: new Date().toISOString(),
    base,
    head,
    mergeBase,
    headSha,
    commits: commitCount,
    totals,
    agents,
    files,
    evidence: { transcriptLines: [...transcriptTally.values()].reduce((a, b) => a + b, 0) },
  };
}
