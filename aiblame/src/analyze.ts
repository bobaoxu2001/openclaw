import { availableParallelism } from "node:os";
import { basename } from "node:path";
import { agentInfo, classifyCommit, HUMAN, isAI } from "./agents.js";
import { languageOf, makeFilter } from "./files.js";
import {
  blameFile,
  currentBranch,
  findIgnoreRevsFile,
  hasBloomCommitGraph,
  linguistExcluded,
  listTextFiles,
  openRepo,
  remoteUrl,
  resolveRev,
  shallowBoundaries,
  walkLog,
  writeCommitGraph,
  type BlameLine,
  type RepoInfo,
  type TreeFile,
} from "./git.js";
import { isTrivial, loadTranscripts, normalize, type TranscriptIndex, type TranscriptSource } from "./transcripts.js";
import { pool } from "./util/proc.js";
import { VERSION } from "./version.js";

export type Mode = "blame" | "history";

/** Above this many files, blame mode samples unless told otherwise. */
export const AUTO_SAMPLE_THRESHOLD = 4000;
export const AUTO_SAMPLE_SIZE = 2500;

export interface AnalyzeOptions {
  /** Local path of the repository (remote targets are cloned by the caller). */
  path: string;
  /** Display name override (e.g. "owner/repo" for a cloned remote). */
  name?: string;
  rev?: string;
  mode?: Mode;
  /** History mode only: count commits newer than this (any `git log --since` value). */
  since?: string;
  include?: string[];
  exclude?: string[];
  noDefaultExcludes?: boolean;
  /** Only count programming languages (skip docs, config and data). */
  codeOnly?: boolean;
  /** Use local agent transcripts as extra evidence (default: true for work trees). */
  transcripts?: boolean;
  jobs?: number;
  /**
   * Blame mode: number of files to blame, chosen at random, with the result
   * extrapolated. "auto" samples only big repos; 0 or Infinity blames everything.
   */
  sample?: number | "auto";
  /** Write a commit-graph cache when blame would otherwise be slow (default "auto"). */
  commitGraph?: "auto" | "always" | "never";
  onProgress?: (phase: string, done: number, total: number) => void;
}

export interface AgentStat {
  id: string;
  name: string;
  color: string;
  lines: number;
  commits: number;
  files: number;
  /** Lines credited through local transcripts rather than commit signatures. */
  transcriptLines: number;
}

export interface FileStat {
  path: string;
  lang: string;
  lines: number;
  /** Lines per author id ("human", "bot", or an agent id). */
  by: Record<string, number>;
}

export interface MonthStat {
  month: string;
  /** Blame mode: surviving lines first written that month. History mode: lines added that month. */
  added: number;
  ai: number;
  by: Record<string, number>;
}

export interface Report {
  tool: { name: "aiblame"; version: string };
  mode: Mode;
  generatedAt: string;
  repo: {
    name: string;
    path: string;
    remote: string | null;
    branch: string | null;
    rev: string;
    sha: string;
    shallow: boolean;
  };
  since: string | null;
  /** True when docs, config and data files were left out (`--code`). */
  codeOnly: boolean;
  /** Set when blame ran on a random sample of files and totals are estimates. */
  sample: { files: number; of: number; margin: number } | null;
  totals: { files: number; lines: number; ai: number; human: number; bot: number };
  agents: AgentStat[];
  files: FileStat[];
  languages: Array<{ name: string; lines: number; ai: number }>;
  timeline: MonthStat[];
  commits: {
    total: number;
    ai: number;
    bot: number;
    humanAuthors: number;
    aiAssistedAuthors: number;
    firstAi: { sha: string; date: string; agent: string } | null;
    latestAi: { sha: string; date: string; agent: string } | null;
  };
  evidence: { signedCommits: number; transcriptLines: number; transcripts: TranscriptSource[] };
}

export interface CommitMeta {
  agent: string;
  /** Commit time, ms. */
  time: number;
  /** Author month, "YYYY-MM". */
  month?: string;
}

export async function analyze(opts: AnalyzeOptions): Promise<Report> {
  const progress = opts.onProgress ?? (() => {});
  const mode: Mode = opts.mode ?? "blame";
  const repo = await openRepo(opts.path);
  const rev = opts.rev ?? "HEAD";
  const sha = await resolveRev(repo, rev);
  const filter = makeFilter(opts);

  progress("files", 0, 1);
  let files = (await listTextFiles(repo, sha)).filter((f) => filter(f.path));
  const linguist = await linguistExcluded(repo, sha, files.map((f) => f.path));
  files = files.filter((f) => !linguist.has(f.path) && f.lines > 0);

  // --- One pass over history: classify every commit. -------------------------
  const commits = new Map<string, CommitMeta>();
  const months = new Map<string, MonthStat>();
  const historyByFile = new Map<string, Record<string, number>>();
  const agentCommits = new Map<string, number>();
  const humanAuthors = new Set<string>();
  const aiAuthors = new Set<string>();
  const tracked = new Set(files.map((f) => f.path));
  const boundaries = shallowBoundaries(repo);
  let firstAi: Report["commits"]["firstAi"] = null;
  let latestAi: Report["commits"]["latestAi"] = null;
  let total = 0;
  let aiCommits = 0;
  let botCommits = 0;
  progress("history", 0, 0);
  await walkLog(
    repo,
    sha,
    (c) => {
      const agent = classifyCommit(c);
      const month = new Date(c.authorTime * 1000).toISOString().slice(0, 7);
      commits.set(c.sha, { agent, time: c.commitTime * 1000, month });
      total++;
      if (agent === "bot") botCommits++;
      else if (classifyCommit({ ...c, message: "" }) === HUMAN.id) {
        const person = c.authorEmail.toLowerCase();
        humanAuthors.add(person);
        if (isAI(agent)) aiAuthors.add(person);
      }
      if (isAI(agent)) {
        aiCommits++;
        agentCommits.set(agent, (agentCommits.get(agent) ?? 0) + 1);
        const date = new Date(c.authorTime * 1000).toISOString();
        if (!latestAi) latestAi = { sha: c.sha, date, agent };
        firstAi = { sha: c.sha, date, agent }; // log is newest-first
      }
      if (total % 500 === 0) progress("history", total, 0);
      if (mode !== "history" || boundaries.has(c.sha)) return;
      for (const n of c.numstat) {
        if (n.added === 0 || !filter(n.path) || linguist.has(n.path)) continue;
        addMonth(months, month, agent, n.added);
        if (tracked.has(n.path)) {
          let h = historyByFile.get(n.path);
          if (!h) historyByFile.set(n.path, (h = {}));
          h[agent] = (h[agent] ?? 0) + n.added;
        }
      }
    },
    { since: mode === "history" ? opts.since : undefined, numstat: mode === "history" },
  );
  progress("history", total, total);

  // --- Evidence #2: local agent transcripts. ------------------------------
  let transcripts: TranscriptIndex | null = null;
  if ((opts.transcripts ?? true) && !repo.bare && mode === "blame") {
    progress("transcripts", 0, 1);
    transcripts = loadTranscripts(repo.dir);
    progress("transcripts", 1, 1);
  }

  // --- Attribute every surviving line. -------------------------------------
  let fileStats: FileStat[];
  let sample: Report["sample"] = null;
  const transcriptLinesByAgent = new Map<string, number>();
  if (mode === "blame") {
    const sampleSize = opts.sample === "auto" || opts.sample === undefined
      ? (files.length > AUTO_SAMPLE_THRESHOLD ? AUTO_SAMPLE_SIZE : Infinity)
      : opts.sample > 0 ? opts.sample : Infinity;
    const toBlame = sampleSize < files.length ? sampleFiles(files, sampleSize, sha) : files;

    const cg = opts.commitGraph ?? "auto";
    if (cg === "always" || (cg === "auto" && toBlame.length > 300 && total > 2000 && !hasBloomCommitGraph(repo))) {
      progress("commit-graph", 0, 0);
      await writeCommitGraph(repo).catch(() => {});
    }

    const ignoreRevs = findIgnoreRevsFile(repo);
    let done = 0;
    progress("blame", 0, toBlame.length);
    const jobs = Math.max(1, opts.jobs ?? Math.min(16, availableParallelism() * 2));
    fileStats = await pool(toBlame, jobs, async (f) => {
      let lines: BlameLine[];
      try {
        lines = await blameFile(repo, sha, f.path, { ignoreRevsFile: ignoreRevs });
      } catch {
        lines = await blameFile(repo, sha, f.path).catch(() => []);
      }
      const { stat, perLine } = attributeLines(f.path, lines, commits, transcripts, transcriptLinesByAgent);
      for (let i = 0; i < lines.length; i++) {
        const month = commits.get(lines[i]!.sha)?.month;
        if (month) addMonth(months, month, perLine[i]!, 1);
      }
      progress("blame", ++done, toBlame.length);
      return stat;
    });
    if (toBlame !== files) {
      sample = { files: toBlame.length, of: files.length, margin: 0 };
    }
  } else {
    fileStats = files.map((f) => {
      const by = historyByFile.get(f.path) ?? {};
      const lines = Object.values(by).reduce((a, b) => a + b, 0);
      return { path: f.path, lang: languageOf(f.path), lines, by };
    });
  }
  fileStats = fileStats.filter((f) => f.lines > 0).sort((a, b) => (a.path < b.path ? -1 : 1));

  // --- Roll up. ------------------------------------------------------------
  const totals = { files: fileStats.length, lines: 0, ai: 0, human: 0, bot: 0 };
  const agentLines = new Map<string, { lines: number; files: number }>();
  const langs = new Map<string, { name: string; lines: number; ai: number }>();
  for (const f of fileStats) {
    totals.lines += f.lines;
    let lang = langs.get(f.lang);
    if (!lang) langs.set(f.lang, (lang = { name: f.lang, lines: 0, ai: 0 }));
    lang.lines += f.lines;
    for (const [id, n] of Object.entries(f.by)) {
      if (id === HUMAN.id) totals.human += n;
      else if (id === "bot") totals.bot += n;
      else {
        totals.ai += n;
        lang.ai += n;
        const a = agentLines.get(id) ?? { lines: 0, files: 0 };
        a.lines += n;
        a.files++;
        agentLines.set(id, a);
      }
    }
  }
  let timeline = [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  let languages = [...langs.values()];

  if (sample) {
    // Ratio estimator: scale the sampled shares up to the known size of the whole tree.
    const allLines = files.reduce((a, f) => a + f.lines, 0);
    const k = totals.lines ? allLines / totals.lines : 0;
    sample.margin = ratioMargin(fileStats, sample.of);
    const scale = (n: number) => Math.round(n * k);
    for (const a of agentLines.values()) {
      a.lines = scale(a.lines);
      a.files = Math.round((a.files * sample.of) / sample.files);
    }
    for (const key of ["ai", "human", "bot"] as const) totals[key] = scale(totals[key]);
    totals.lines = allLines;
    totals.files = files.length;
    totals.human = Math.max(0, allLines - totals.ai - totals.bot);
    timeline = timeline.map((m) => ({
      month: m.month,
      added: scale(m.added),
      ai: scale(m.ai),
      by: Object.fromEntries(Object.entries(m.by).map(([id, n]) => [id, scale(n)])),
    }));
    // Languages: exact line totals, AI share from the sample.
    const allByLang = new Map<string, number>();
    for (const f of files) allByLang.set(languageOf(f.path), (allByLang.get(languageOf(f.path)) ?? 0) + f.lines);
    languages = [...allByLang].map(([name, lines]) => {
      const s = langs.get(name);
      return { name, lines, ai: s && s.lines ? Math.round((s.ai / s.lines) * lines) : 0 };
    });
  }

  const agentIds = new Set([...agentLines.keys(), ...agentCommits.keys()]);
  const agents: AgentStat[] = [...agentIds]
    .map((id) => {
      const info = agentInfo(id);
      return {
        id,
        name: info.name,
        color: info.color,
        lines: agentLines.get(id)?.lines ?? 0,
        files: agentLines.get(id)?.files ?? 0,
        commits: agentCommits.get(id) ?? 0,
        transcriptLines: transcriptLinesByAgent.get(id) ?? 0,
      };
    })
    .sort((a, b) => b.lines - a.lines || b.commits - a.commits);

  const transcriptLines = [...transcriptLinesByAgent.values()].reduce((a, b) => a + b, 0);
  const remote = redactUrl(await remoteUrl(repo));
  return {
    tool: { name: "aiblame", version: VERSION },
    mode,
    generatedAt: new Date().toISOString(),
    repo: {
      name: opts.name ?? repoName(remote, repo),
      path: repo.dir,
      remote,
      branch: await currentBranch(repo),
      rev,
      sha,
      shallow: repo.shallow,
    },
    since: mode === "history" ? (opts.since ?? null) : null,
    codeOnly: opts.codeOnly ?? false,
    sample,
    totals,
    agents,
    files: fileStats,
    languages: languages.sort((a, b) => b.lines - a.lines),
    timeline,
    commits: {
      total,
      ai: aiCommits,
      bot: botCommits,
      humanAuthors: humanAuthors.size,
      aiAssistedAuthors: aiAuthors.size,
      firstAi,
      latestAi,
    },
    evidence: {
      signedCommits: aiCommits,
      transcriptLines,
      transcripts: transcripts ? [...transcripts.sources.values()].filter((s) => s.writes > 0) : [],
    },
  };
}

function addMonth(months: Map<string, MonthStat>, month: string, id: string, n: number): void {
  let m = months.get(month);
  if (!m) months.set(month, (m = { month, added: 0, ai: 0, by: {} }));
  m.added += n;
  if (isAI(id)) m.ai += n;
  m.by[id] = (m.by[id] ?? 0) + n;
}

/**
 * Pick `n` files uniformly at random, seeded by the commit so the same commit
 * always yields the same estimate.
 */
export function sampleFiles(files: TreeFile[], n: number, seed: string): TreeFile[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rand = () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = files.slice();
  for (let i = 0; i < n && i < copy.length; i++) {
    const j = i + Math.floor(rand() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

/** 95% margin of error of the AI line share, for a ratio estimator over sampled files. */
export function ratioMargin(sampled: FileStat[], population: number): number {
  const n = sampled.length;
  if (n < 2) return 1;
  let sumL = 0;
  let sumA = 0;
  const ai = sampled.map((f) => Object.entries(f.by).reduce((a, [id, v]) => a + (isAI(id) ? v : 0), 0));
  for (let i = 0; i < n; i++) {
    sumL += sampled[i]!.lines;
    sumA += ai[i]!;
  }
  if (sumL === 0) return 0;
  const r = sumA / sumL;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ai[i]! - r * sampled[i]!.lines) ** 2;
  const meanL = sumL / n;
  const fpc = Math.max(0, 1 - n / population);
  return 1.96 * Math.sqrt((fpc * ss) / ((n - 1) * n * meanL * meanL));
}

/**
 * Decide the author of every line of one file. Commit signatures win; lines
 * blamed on human commits may be reclaimed by an agent via transcripts.
 */
export function attributeLines(
  path: string,
  lines: BlameLine[],
  commits: Map<string, CommitMeta>,
  transcripts: TranscriptIndex | null,
  transcriptTally?: Map<string, number>,
): { stat: FileStat; perLine: string[]; viaTranscript: boolean[] } {
  const ids: string[] = new Array(lines.length);
  const viaTranscript: boolean[] = new Array(lines.length).fill(false);
  const checkTranscripts = transcripts?.hasFile(path) ?? false;
  for (let i = 0; i < lines.length; i++) {
    const { sha, text } = lines[i]!;
    const meta = commits.get(sha);
    let id = meta?.agent ?? HUMAN.id;
    if (id === HUMAN.id && checkTranscripts) {
      // Unknown commits (e.g. uncommitted lines) count as written "now".
      const agent = transcripts!.claim(path, text, meta?.time ?? Date.now());
      if (agent) {
        id = agent;
        viaTranscript[i] = true;
      }
    }
    ids[i] = id;
  }
  if (checkTranscripts) fillTrivialGaps(lines, ids, viaTranscript);

  const by: Record<string, number> = {};
  for (let i = 0; i < ids.length; i++) {
    by[ids[i]!] = (by[ids[i]!] ?? 0) + 1;
    if (viaTranscript[i] && transcriptTally) transcriptTally.set(ids[i]!, (transcriptTally.get(ids[i]!) ?? 0) + 1);
  }
  return { stat: { path, lang: languageOf(path), lines: lines.length, by }, perLine: ids, viaTranscript };
}

/**
 * Transcript matching skips generic lines like "}" or "". When such a line
 * sits inside a run that was credited to one agent from the same commit,
 * credit it too, so a fully agent-written function does not end up striped.
 */
function fillTrivialGaps(lines: BlameLine[], ids: string[], via: boolean[]): void {
  let i = 0;
  while (i < lines.length) {
    if (!(ids[i] === HUMAN.id && isTrivial(normalize(lines[i]!.text)))) {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && ids[j] === HUMAN.id && isTrivial(normalize(lines[j]!.text))) j++;
    const prev = i - 1;
    const next = j;
    if (
      prev >= 0 && via[prev] &&
      (next >= lines.length || (via[next] && ids[next] === ids[prev] && lines[next]!.sha === lines[prev]!.sha))
    ) {
      const sameCommit = lines.slice(i, j).every((l) => l.sha === lines[prev]!.sha);
      if (sameCommit) {
        for (let k = i; k < j; k++) {
          ids[k] = ids[prev]!;
          via[k] = true;
        }
      }
    }
    i = j;
  }
}

/** Drop credentials from a remote URL (https://user:token@host/...) before it lands in a report. */
export function redactUrl(url: string | null): string | null {
  return url ? url.replace(/^([a-z][\w+.-]*:\/\/)[^@/]+@/i, "$1") : url;
}

function repoName(remote: string | null, repo: RepoInfo): string {
  if (remote) {
    const m = /[:/]([^/:]+\/[^/]+?)(\.git)?\/?$/.exec(remote);
    if (m) return m[1]!;
  }
  return basename(repo.bare ? repo.dir.replace(/\/\.git$|\.git$/, "") : repo.dir);
}
