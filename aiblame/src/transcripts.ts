/**
 * Local agent transcripts: the second source of evidence.
 *
 * Coding agents keep session logs on disk. Every file write or edit they make
 * is in there, verbatim. We index the lines agents wrote into this repo, then
 * match them against lines that `git blame` attributes to humans. That catches
 * AI code committed without any co-author trailer.
 *
 * A line is only credited to an agent when the agent wrote it *before* the
 * commit that introduced it, so a human who typed the same line earlier keeps it.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Clock skew / amend tolerance when comparing write time to commit time. */
const SLACK_MS = 10 * 60 * 1000;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_FILES_PER_SOURCE = 50_000;

interface Write {
  time: number | null;
  agent: string;
  used: boolean;
}

export interface TranscriptSource {
  agent: string;
  files: number;
  writes: number;
  lines: number;
}

export class TranscriptIndex {
  private byFile = new Map<string, Map<string, Write[]>>();
  readonly sources = new Map<string, TranscriptSource>();

  addText(relPath: string, text: string, time: number | null, agent: string): void {
    let file = this.byFile.get(relPath);
    if (!file) this.byFile.set(relPath, (file = new Map()));
    const src = this.source(agent);
    src.writes++;
    for (const raw of text.split("\n")) {
      const key = normalize(raw);
      if (isTrivial(key)) continue;
      let list = file.get(key);
      if (!list) file.set(key, (list = []));
      list.push({ time, agent, used: false });
      src.lines++;
    }
  }

  source(agent: string): TranscriptSource {
    let s = this.sources.get(agent);
    if (!s) this.sources.set(agent, (s = { agent, files: 0, writes: 0, lines: 0 }));
    return s;
  }

  hasFile(relPath: string): boolean {
    return this.byFile.has(relPath);
  }

  get size(): number {
    return this.byFile.size;
  }

  /**
   * If an agent wrote `line` into `relPath` no later than `commitTimeMs`, claim
   * that write and return the agent id. Each write can be claimed once.
   */
  claim(relPath: string, line: string, commitTimeMs: number): string | null {
    const list = this.byFile.get(relPath)?.get(normalize(line));
    if (!list) return null;
    for (const w of list) {
      if (!w.used && (w.time === null || w.time <= commitTimeMs + SLACK_MS)) {
        w.used = true;
        return w.agent;
      }
    }
    return null;
  }
}

export function normalize(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

/** Lines too generic to prove anything on their own ("}", "", "end", "*\/"). */
export function isTrivial(normalized: string): boolean {
  if (normalized.length < 4) return true;
  let alnum = 0;
  for (let i = 0; i < normalized.length && alnum < 2; i++) {
    const c = normalized.charCodeAt(i);
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c > 127) alnum++;
  }
  return alnum < 2;
}

// ---------------------------------------------------------------------------
// Discovery

interface SourceSpec {
  agent: string;
  dirs: string[];
  ext: RegExp;
  /** Optional filter on the first-level directory name below each dir. */
  topDir?: (name: string) => boolean;
}

function sourceSpecs(roots: string[]): SourceSpec[] {
  const home = homedir();
  const env = process.env;
  const xdgData = env.XDG_DATA_HOME || join(home, ".local", "share");
  const claudeHome = env.CLAUDE_CONFIG_DIR || join(home, ".claude");
  const codexHome = env.CODEX_HOME || join(home, ".codex");
  // Claude Code names project dirs after the cwd with every non-alphanumeric char replaced by "-".
  const encoded = roots.map((r) => r.replace(/[^a-zA-Z0-9]/g, "-"));
  return [
    {
      agent: "claude-code",
      dirs: [join(claudeHome, "projects")],
      ext: /\.jsonl$/,
      topDir: (name) => encoded.some((e) => name === e || name.startsWith(e + "-")),
    },
    { agent: "codex", dirs: [join(codexHome, "sessions"), join(codexHome, "archived_sessions")], ext: /\.jsonl$/ },
    { agent: "gemini", dirs: [join(home, ".gemini", "tmp")], ext: /\.jsonl?$/ },
    { agent: "qwen", dirs: [join(home, ".qwen", "tmp")], ext: /\.jsonl?$/ },
    {
      agent: "openclaw",
      dirs: ["openclaw", "clawdbot", "moltbot"].map((d) => join(home, `.${d}`, "agents")),
      ext: /\.jsonl$/,
    },
    { agent: "opencode", dirs: [join(xdgData, "opencode", "storage")], ext: /\.json$/ },
    { agent: "droid", dirs: [join(home, ".factory", "sessions")], ext: /\.jsonl$/ },
    { agent: "pi", dirs: [join(home, ".pi", "agent", "sessions")], ext: /\.jsonl$/ },
  ];
}

function* walkFiles(dir: string, ext: RegExp, topDir?: (name: string) => boolean): Generator<string> {
  const stack: Array<{ path: string; depth: number }> = [{ path: dir, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const { path, depth } = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (depth === 0 && topDir && !topDir(e.name)) continue;
      const p = join(path, e.name);
      if (e.isDirectory()) {
        if (depth < 8 && e.name !== "node_modules") stack.push({ path: p, depth: depth + 1 });
      } else if (e.isFile() && ext.test(e.name)) {
        if (++count > MAX_FILES_PER_SOURCE) return;
        yield p;
      }
    }
  }
}

/** Scan every known agent transcript location for writes into `repoRoot`. */
export function loadTranscripts(repoRoot: string, opts: { extraDirs?: string[] } = {}): TranscriptIndex {
  const index = new TranscriptIndex();
  const roots = rootAliases(repoRoot);
  const specs = sourceSpecs([...roots]);
  for (const extra of opts.extraDirs ?? []) specs.push({ agent: "other-ai", dirs: [extra], ext: /\.jsonl?$/ });

  for (const spec of specs) {
    for (const dir of spec.dirs) {
      if (!existsSync(dir)) continue;
      for (const file of walkFiles(dir, spec.ext, spec.topDir)) {
        scanTranscriptFile(file, spec.agent, [...roots], index);
      }
    }
  }
  for (const root of roots) {
    const aider = join(root, ".aider.chat.history.md");
    if (existsSync(aider)) {
      scanAiderHistory(aider, root, index);
      break;
    }
  }
  return index;
}

/**
 * Every spelling of the repo path an agent may have logged: git reports the
 * physical path, but agents record the path they were started in, which can
 * go through a symlink (macOS: /var -> /private/var, or a symlinked ~/code).
 */
function rootAliases(repoRoot: string): Set<string> {
  const roots = new Set([resolve(repoRoot)]);
  let real = resolve(repoRoot);
  try {
    real = realpathSync(repoRoot);
    roots.add(real);
  } catch {
    /* ignore */
  }
  for (const r of [...roots]) if (r.startsWith("/private/")) roots.add(r.slice("/private".length));
  const pwd = process.env.PWD;
  if (pwd) {
    try {
      const realPwd = realpathSync(pwd);
      if (realPwd === real) roots.add(resolve(pwd));
      else if (realPwd.startsWith(real + sep)) {
        const depth = relative(real, realPwd).split(sep).length;
        roots.add(resolve(pwd, ...Array<string>(depth).fill("..")));
      }
    } catch {
      /* ignore */
    }
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Generic JSON / JSONL transcript parsing

const WRITE_TOOLS = new Set(
  [
    "write", "write_file", "writefile", "create_file", "createfile", "file_write", "fs_write", "write_to_file",
    "edit", "edit_file", "editfile", "file_edit", "multiedit", "multi_edit", "replace", "replace_in_file",
    "str_replace", "str_replace_editor", "str_replace_based_edit_tool", "search_replace", "apply_diff",
    "apply_patch", "applypatch", "patch", "insert", "insert_content", "create", "notebookedit", "notebook_edit",
  ].map((s) => s.toLowerCase()),
);
const PATH_KEYS = ["file_path", "filePath", "path", "target_file", "targetFile", "notebook_path", "absolute_path", "file", "filename"];
const TEXT_KEYS = ["content", "contents", "new_string", "newString", "newText", "new_text", "new_str", "file_text", "code_edit", "new_source", "newContent", "text"];

interface Ctx {
  time: number | null;
  cwd: string | null;
}

function scanTranscriptFile(file: string, agent: string, roots: string[], index: TranscriptIndex): void {
  let raw: string;
  try {
    if (statSync(file).size > MAX_FILE_BYTES) return;
    raw = readFileSync(file, "utf8");
  } catch {
    return;
  }
  // Cheap prefilter: a transcript that never mentions the repo path is irrelevant.
  if (!roots.some((r) => raw.includes(r) || raw.includes(JSON.stringify(r).slice(1, -1)))) return;

  const before = index.source(agent).writes;
  const ctx: Ctx = { time: null, cwd: null };
  const emit = (path: string, text: string, c: Ctx) => {
    const rel = toRel(path, c.cwd, roots);
    if (rel) index.addText(rel, text, c.time, agent);
  };

  if (file.endsWith(".jsonl")) {
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let obj: unknown;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      updateCtx(obj, ctx);
      walk(obj, { ...ctx }, emit, 0);
    }
  } else {
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      return;
    }
    walk(obj, { ...ctx }, emit, 0);
  }
  if (index.source(agent).writes > before) index.source(agent).files++;
}

function parseTime(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Pick up session-level cwd / timestamp from a top-level JSONL record. */
function updateCtx(obj: unknown, ctx: Ctx): void {
  if (!obj || typeof obj !== "object") return;
  const o = obj as Record<string, any>;
  const cwd = o.cwd ?? o.payload?.cwd ?? o.session?.cwd ?? o.metadata?.cwd;
  if (typeof cwd === "string" && cwd) ctx.cwd = cwd;
  const t = parseTime(o.timestamp ?? o.payload?.timestamp ?? o.created_at ?? o.createdAt);
  if (t !== null) ctx.time = t;
}

type Emit = (path: string, text: string, ctx: Ctx) => void;

function walk(node: unknown, ctx: Ctx, emit: Emit, depth: number): void {
  if (depth > 40 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, ctx, emit, depth + 1);
    return;
  }
  const o = node as Record<string, any>;
  const t = parseTime(o.timestamp) ?? parseTime(o.time?.start) ?? parseTime(o.time?.created);
  if (t !== null) ctx = { ...ctx, time: t };
  if (typeof o.cwd === "string" && o.cwd) ctx = { ...ctx, cwd: o.cwd };

  const call = asToolCall(o);
  if (call) {
    extractWrites(call.name, call.args, ctx, emit);
    return;
  }
  for (const key in o) {
    const v = o[key];
    if (v && typeof v === "object") walk(v, ctx, emit, depth + 1);
  }
}

function asToolCall(o: Record<string, any>): { name: string; args: unknown } | null {
  const name =
    typeof o.name === "string" ? o.name
    : typeof o.tool === "string" ? o.tool
    : typeof o.toolName === "string" ? o.toolName
    : typeof o.function?.name === "string" ? o.function.name
    : null;
  if (!name) return null;
  let args = o.input ?? o.args ?? o.arguments ?? o.parameters ?? o.params ?? o.state?.input ?? o.function?.arguments;
  if (args === undefined || args === null) return null;
  if (typeof args === "string" && /^\s*[{[]/.test(args)) {
    try {
      args = JSON.parse(args);
    } catch {
      /* keep as string */
    }
  }
  return { name, args };
}

function extractWrites(name: string, args: unknown, ctx: Ctx, emit: Emit): void {
  // Patches can hide in any tool (Codex runs `apply_patch` through its shell tool).
  for (const s of strings(args, 0)) {
    if (s.includes("*** Begin Patch")) {
      for (const [path, text] of parseApplyPatch(s)) emit(path, text, ctx);
    }
  }
  if (!WRITE_TOOLS.has(name.toLowerCase()) || !args || typeof args !== "object" || Array.isArray(args)) return;
  const a = args as Record<string, any>;
  const path = PATH_KEYS.map((k) => a[k]).find((v): v is string => typeof v === "string" && v.length > 0);
  if (!path) return;
  const texts: string[] = [];
  for (const k of TEXT_KEYS) if (typeof a[k] === "string") texts.push(a[k]);
  if (Array.isArray(a.edits)) {
    for (const e of a.edits) {
      if (e && typeof e === "object") for (const k of TEXT_KEYS) if (typeof e[k] === "string") texts.push(e[k]);
    }
  }
  for (const k of ["diff", "patch"]) {
    if (typeof a[k] === "string" && a[k].includes(">>>>>>> REPLACE")) texts.push(...parseSearchReplace(a[k]));
  }
  for (const text of texts) {
    if (text.includes("*** Begin Patch")) continue; // already handled above
    emit(path, text, ctx);
  }
}

function* strings(v: unknown, depth: number): Generator<string> {
  if (depth > 6) return;
  if (typeof v === "string") yield v;
  else if (Array.isArray(v)) for (const x of v) yield* strings(x, depth + 1);
  else if (v && typeof v === "object") for (const x of Object.values(v)) yield* strings(x, depth + 1);
}

/** Codex-style `*** Begin Patch` envelopes: returns [path, added lines] pairs. */
export function parseApplyPatch(patch: string): Array<[string, string]> {
  const out = new Map<string, string[]>();
  let file: string | null = null;
  for (const line of patch.split("\n")) {
    const m = /^\*\*\* (Add|Update) File: (.+)$/.exec(line);
    if (m) {
      file = m[2]!.trim();
      continue;
    }
    const mv = /^\*\*\* Move to: (.+)$/.exec(line);
    if (mv && file) {
      const moved = out.get(file);
      out.delete(file);
      file = mv[1]!.trim();
      if (moved) out.set(file, moved);
      continue;
    }
    if (line.startsWith("*** ")) {
      if (!line.startsWith("*** End of File")) file = null;
      continue;
    }
    if (file && line.startsWith("+")) {
      let list = out.get(file);
      if (!list) out.set(file, (list = []));
      list.push(line.slice(1));
    }
  }
  return [...out].map(([p, lines]) => [p, lines.join("\n")]);
}

/** Aider / Roo style SEARCH/REPLACE blocks: returns the replacement texts. */
export function parseSearchReplace(text: string): string[] {
  const out: string[] = [];
  let buf: string[] | null = null;
  for (const line of text.split("\n")) {
    if (/^={7}\s*$/.test(line)) buf = [];
    else if (/^>{7} REPLACE/.test(line)) {
      if (buf) out.push(buf.join("\n"));
      buf = null;
    } else if (/^<{7} SEARCH/.test(line)) buf = null;
    else if (buf) buf.push(line);
  }
  return out;
}

function toRel(path: string, cwd: string | null, roots: string[]): string | null {
  let p = path;
  if (p.startsWith("file://")) {
    try {
      p = fileURLToPath(p);
    } catch {
      return null;
    }
  }
  const candidates = isAbsolute(p) ? [p] : cwd ? [resolve(cwd, p)] : [];
  for (const abs of candidates) {
    for (const root of roots) {
      const rel = relative(root, abs);
      if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.split(sep).join("/");
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Aider keeps a markdown chat log in the repo root.

function scanAiderHistory(file: string, root: string, index: TranscriptIndex): void {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = raw.split("\n");
  let time: number | null = null;
  let path: string | null = null;
  let buf: string[] | null = null;
  const before = index.source("aider").writes;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const started = /^# aider chat started at (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)/.exec(line);
    if (started) time = parseTime(started[1]!.replace(" ", "T"));
    if (/^<{7} SEARCH/.test(line)) {
      path = null;
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const cand = lines[j]!.trim();
        if (!cand || cand.startsWith("```")) continue;
        path = cand;
        break;
      }
      buf = null;
    } else if (/^={7}\s*$/.test(line)) buf = [];
    else if (/^>{7} REPLACE/.test(line)) {
      if (buf && path) {
        const rel = toRel(path, root, [root]);
        if (rel) index.addText(rel, buf.join("\n"), time, "aider");
      }
      buf = null;
    } else if (buf) buf.push(line);
  }
  if (index.source("aider").writes > before) index.source("aider").files++;
}
