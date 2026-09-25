import { closeSync, existsSync, openSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";
import { git } from "./util/proc.js";

export interface RepoInfo {
  /** Directory git commands run in (work tree root, or the git dir for bare repos). */
  dir: string;
  gitDir: string;
  bare: boolean;
  shallow: boolean;
}

export async function openRepo(path: string): Promise<RepoInfo> {
  const out = await git(
    ["rev-parse", "--is-bare-repository", "--absolute-git-dir", "--is-shallow-repository"],
    { cwd: path },
  );
  const [bareS, gitDir, shallowS] = out.trim().split("\n");
  const bare = bareS === "true";
  const dir = bare ? gitDir! : (await git(["rev-parse", "--show-toplevel"], { cwd: path })).trim();
  return { dir, gitDir: gitDir!, bare, shallow: shallowS === "true" };
}

export async function resolveRev(repo: RepoInfo, rev: string): Promise<string> {
  return (await git(["rev-parse", "--verify", `${rev}^{commit}`], { cwd: repo.dir })).trim();
}

export async function currentBranch(repo: RepoInfo): Promise<string | null> {
  try {
    return (await git(["symbolic-ref", "--short", "-q", "HEAD"], { cwd: repo.dir })).trim() || null;
  } catch {
    return null;
  }
}

export async function remoteUrl(repo: RepoInfo): Promise<string | null> {
  try {
    return (await git(["remote", "get-url", "origin"], { cwd: repo.dir })).trim() || null;
  } catch {
    return null;
  }
}

export interface TreeFile {
  path: string;
  lines: number;
}

/**
 * Every text file at `sha` with its line count. Binary files are dropped.
 * Uses a single diff against the empty tree, so it is fast even on huge repos.
 */
export async function listTextFiles(repo: RepoInfo, sha: string): Promise<TreeFile[]> {
  const empty = (await git(["hash-object", "-t", "tree", "--stdin"], { cwd: repo.dir, input: "" })).trim();
  const out = await git(["diff", "--numstat", "-z", "--no-renames", empty, sha], { cwd: repo.dir });
  const files: TreeFile[] = [];
  // Format with -z: "<added>\t<deleted>\t<path>\0"
  for (const rec of out.split("\0")) {
    if (!rec) continue;
    const t1 = rec.indexOf("\t");
    const t2 = rec.indexOf("\t", t1 + 1);
    if (t1 < 0 || t2 < 0) continue;
    const added = rec.slice(0, t1);
    if (added === "-") continue; // binary
    files.push({ path: rec.slice(t2 + 1), lines: Number(added) });
  }
  return files;
}

/** Paths marked `linguist-generated` or `linguist-vendored` in .gitattributes. */
export async function linguistExcluded(repo: RepoInfo, sha: string, paths: string[]): Promise<Set<string>> {
  const excluded = new Set<string>();
  if (paths.length === 0) return excluded;
  const args = ["check-attr", "--stdin", "-z", "linguist-generated", "linguist-vendored"];
  if (repo.bare) args.splice(1, 0, `--source=${sha}`);
  let out: string;
  try {
    out = await git(args, { cwd: repo.dir, input: paths.join("\0") + "\0" });
  } catch {
    return excluded; // older git without --source, or no attributes at all
  }
  // -z output: "<path>\0<attr>\0<value>\0" repeated
  const parts = out.split("\0");
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const value = parts[i + 2];
    if (value === "set" || value === "true") excluded.add(parts[i]!);
  }
  return excluded;
}

export interface Commit {
  sha: string;
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  /** Unix seconds. */
  authorTime: number;
  commitTime: number;
  message: string;
  numstat: Array<{ added: number; deleted: number; path: string }>;
}

const FS = "\x1f";
const RS = "\x1e";

/**
 * Stream every commit reachable from `sha` (with numstat), newest first.
 * The callback is invoked once per commit so memory stays flat on big histories.
 */
export async function walkLog(
  repo: RepoInfo,
  sha: string,
  onCommit: (c: Commit) => void,
  opts: { since?: string; numstat?: boolean; noMerges?: boolean } = {},
): Promise<void> {
  const format = `${RS}%H${FS}%an${FS}%ae${FS}%cn${FS}%ce${FS}%at${FS}%ct${FS}%B${FS}`;
  const args = ["log", `--format=${format}`, "--no-color"];
  // Line counts need a diff per commit, which dominates run time on big histories.
  if (opts.numstat) args.push("--numstat", "-M");
  if (opts.since) args.push(`--since=${opts.since}`);
  if (opts.noMerges) args.push("--no-merges");
  args.push(sha, "--");
  let buf = "";
  const flush = (rec: string) => {
    if (!rec.trim()) return;
    const f = rec.split(FS);
    if (f.length < 9) return;
    const numstat: Commit["numstat"] = [];
    for (const line of f[8]!.split("\n")) {
      if (!line) continue;
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
      if (!m || m[1] === "-") continue;
      numstat.push({ added: Number(m[1]), deleted: Number(m[2]), path: renamedPath(m[3]!) });
    }
    onCommit({
      sha: f[0]!,
      authorName: f[1]!,
      authorEmail: f[2]!,
      committerName: f[3]!,
      committerEmail: f[4]!,
      authorTime: Number(f[5]),
      commitTime: Number(f[6]),
      message: f[7]!,
      numstat,
    });
  };
  await git(args, {
    cwd: repo.dir,
    onData: (chunk) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf(RS, 1)) > 0) {
        flush(buf.slice(1, i));
        buf = buf.slice(i);
      }
    },
  });
  if (buf.startsWith(RS)) flush(buf.slice(1));
}

/** "src/{old => new}/a.ts" or "old.ts => new.ts" to the new path. */
export function renamedPath(p: string): string {
  if (!p.includes(" => ")) return p;
  if (p.includes("{")) {
    return p.replace(/\{[^{}]*? => ([^{}]*?)\}/g, "$1").replace(/\/{2,}/g, "/").replace(/^\//, "");
  }
  return p.slice(p.indexOf(" => ") + 4);
}

/** Commits that are shallow-clone boundaries (their diffs contain the whole tree). */
export function shallowBoundaries(repo: RepoInfo): Set<string> {
  const f = join(repo.gitDir, "shallow");
  if (!existsSync(f)) return new Set();
  return new Set(readFileSync(f, "utf8").split("\n").filter(Boolean));
}

export interface BlameLine {
  sha: string;
  text: string;
}

/** `git blame` a single file at `sha`, returning the originating commit of each line. */
export async function blameFile(
  repo: RepoInfo,
  sha: string,
  path: string,
  opts: { ignoreRevsFile?: string; ranges?: Array<[start: number, count: number]> } = {},
): Promise<BlameLine[]> {
  const args = ["blame", "--porcelain", "-w"];
  if (opts.ignoreRevsFile) args.push("--ignore-revs-file", opts.ignoreRevsFile);
  for (const [start, count] of opts.ranges ?? []) args.push("-L", `${start},+${count}`);
  args.push(sha, "--", path);
  const out = await git(args, { cwd: repo.dir });
  const lines: BlameLine[] = [];
  let current = "";
  let start = 0;
  while (start < out.length) {
    let end = out.indexOf("\n", start);
    if (end < 0) end = out.length;
    const line = out.slice(start, end);
    start = end + 1;
    if (line.charCodeAt(0) === 9 /* \t */) {
      lines.push({ sha: current, text: line.slice(1) });
    } else {
      const sp = line.indexOf(" ");
      if (sp === 40 || sp === 64) {
        const head = line.slice(0, sp);
        if (/^[0-9a-f]+$/.test(head)) current = head;
      }
    }
  }
  return lines;
}

/** Path of `.git-blame-ignore-revs` if the work tree has one. */
export function findIgnoreRevsFile(repo: RepoInfo): string | undefined {
  if (repo.bare) return undefined;
  const f = join(repo.dir, ".git-blame-ignore-revs");
  return existsSync(f) ? f : undefined;
}

/** Metadata for specific commits (no diffs), e.g. the ones a single blame touched. */
export async function commitsBySha(repo: RepoInfo, shas: string[]): Promise<Commit[]> {
  const out: Commit[] = [];
  if (shas.length === 0) return out;
  const format = `${RS}%H${FS}%an${FS}%ae${FS}%cn${FS}%ce${FS}%at${FS}%ct${FS}%B${FS}`;
  const raw = await git(["log", "--no-walk=unsorted", "--stdin", `--format=${format}`], {
    cwd: repo.dir,
    input: shas.join("\n") + "\n",
  });
  for (const rec of raw.split(RS)) {
    const f = rec.split(FS);
    if (f.length < 8) continue;
    out.push({
      sha: f[0]!,
      authorName: f[1]!,
      authorEmail: f[2]!,
      committerName: f[3]!,
      committerEmail: f[4]!,
      authorTime: Number(f[5]),
      commitTime: Number(f[6]),
      message: f[7]!,
      numstat: [],
    });
  }
  return out;
}

/** Does the repo have a commit-graph with changed-path Bloom filters (which make blame ~5x faster)? */
export function hasBloomCommitGraph(repo: RepoInfo): boolean {
  const info = join(repo.gitDir, "objects", "info");
  const candidates: string[] = [join(info, "commit-graph")];
  const chain = join(info, "commit-graphs", "commit-graph-chain");
  if (existsSync(chain)) {
    const tip = readFileSync(chain, "utf8").trim().split("\n").pop();
    if (tip) candidates.push(join(info, "commit-graphs", `graph-${tip}.graph`));
  }
  for (const f of candidates) {
    if (!existsSync(f)) continue;
    try {
      // Only the header and chunk table matter; the file itself can be huge.
      const head = Buffer.alloc(8 + 12 * 16);
      const fd = openSync(f, "r");
      try {
        readSync(fd, head, 0, head.length, 0);
      } finally {
        closeSync(fd);
      }
      if (head.subarray(0, 4).toString("latin1") !== "CGPH") continue;
      const chunks = head[6]!;
      if (head.subarray(8, 8 + 12 * (chunks + 1)).toString("latin1").includes("BDAT")) return true;
    } catch {
      /* unreadable: treat as missing */
    }
  }
  return false;
}

/** Write a commit-graph with Bloom filters. It is a cache: `git gc` and `git maintenance` write the same file. */
export async function writeCommitGraph(repo: RepoInfo): Promise<void> {
  await git(["commit-graph", "write", "--reachable", "--changed-paths"], { cwd: repo.dir });
}
