#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { AGENTS } from "./agents.js";
import { analyze, type Report } from "./analyze.js";
import { renderBlameView } from "./blameView.js";
import { renderEvidence } from "./evidence.js";
import { pct } from "./report/common.js";
import { renderHtml } from "./report/html.js";
import { renderBadge, renderCard, renderShieldsEndpoint } from "./report/svg.js";
import { renderTerminal } from "./report/terminal.js";
import { cloneRemote, displayName, isRemoteTarget } from "./remote.js";
import { createPainter } from "./util/ansi.js";
import { VERSION } from "./version.js";

const HELP = `
aiblame ${VERSION}: git blame for the AI era

Usage
  aiblame [target] [options]     how much of this repo did AI write?
  aiblame blame <file>           line-by-line: who wrote each line, you or an agent?
  aiblame evidence [target]      which signatures matched, and how often (audit mode)
  aiblame agents                 list every agent signature aiblame knows

Target
  A local path (default: .), a git URL, or a GitHub "owner/repo".

Output
  --html [file]        self-contained HTML report      (default aiblame-report.html)
  --card [file]        SVG card for your README        (default aiblame-card.svg)
  --badge [file]       SVG badge for your README       (default aiblame-badge.svg)
  --shields [file]     shields.io endpoint JSON        (default aiblame-shields.json)
  --json [file]        full report as JSON (stdout unless a .json file is given)
  --label <text>       badge label                     (default "AI-written")
  --top <n>            rows per table                  (default 8)
  --quiet              skip the terminal report
  --no-color           plain output

Analysis
  --rev <rev>          analyze a branch, tag or commit (default HEAD)
  --fast               skip blame; count lines added across history instead
  --since <date>       with --fast: only commits since then ("90 days ago", 2026-01-01)
  --include <glob>     only analyze matching paths (repeatable)
  --exclude <glob>     skip matching paths (repeatable)
  --code               only programming languages: skip docs, config and data
  --all-files          keep lockfiles, vendored and generated files
  --no-transcripts     ignore local agent session logs
  --sample <n>         blame n random files and extrapolate (auto above 4,000 files)
  --full               blame every file, however big the repo
  --no-commit-graph    never write git's commit-graph cache (it makes blame ~5x faster)
  --jobs <n>           parallel git processes
  --max-ai <percent>   exit with code 3 if the AI share is above this (CI policy)

Examples
  npx aiblame
  npx aiblame facebook/react --fast --since "1 year ago"
  npx aiblame --card --badge --quiet
  npx aiblame blame src/index.ts
`;

interface Args {
  command: "analyze" | "blame" | "evidence" | "agents" | "help" | "version";
  target: string;
  file?: string;
  rev?: string;
  html?: string;
  card?: string;
  badge?: string;
  shields?: string;
  json?: string | true;
  label?: string;
  top?: number;
  quiet: boolean;
  color?: boolean;
  fast: boolean;
  since?: string;
  include: string[];
  exclude: string[];
  allFiles: boolean;
  code: boolean;
  transcripts: boolean;
  jobs?: number;
  sample?: number | "auto";
  commitGraph: boolean;
  maxAi?: number;
}

class UsageError extends Error {}

export function parseArgs(argv: string[]): Args {
  const a: Args = {
    command: "analyze",
    target: ".",
    quiet: false,
    fast: false,
    include: [],
    exclude: [],
    allFiles: false,
    code: false,
    transcripts: true,
    commitGraph: true,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = (): string => {
      if (inline !== undefined) return inline;
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${flag} needs a value`);
      return v;
    };
    /** Optional file argument: only consumed if it looks like a file with the right extension. */
    const optionalFile = (ext: RegExp, fallback: string): string => {
      if (inline !== undefined) return inline;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-") && ext.test(next)) {
        i++;
        return next;
      }
      return fallback;
    };
    const number = (): number => {
      const v = Number(value());
      if (!Number.isFinite(v) || v < 0) throw new UsageError(`${flag} needs a non-negative number`);
      return v;
    };
    switch (flag) {
      case "-h": case "--help": a.command = "help"; break;
      case "-v": case "--version": a.command = "version"; break;
      case "--rev": a.rev = value(); break;
      case "--html": a.html = optionalFile(/\.html?$/i, "aiblame-report.html"); break;
      case "--card": a.card = optionalFile(/\.svg$/i, "aiblame-card.svg"); break;
      case "--badge": a.badge = optionalFile(/\.svg$/i, "aiblame-badge.svg"); break;
      case "--shields": a.shields = optionalFile(/\.json$/i, "aiblame-shields.json"); break;
      case "--json": {
        const f = optionalFile(/\.json$/i, "");
        a.json = f || true;
        break;
      }
      case "--label": a.label = value(); break;
      case "--top": a.top = Math.floor(number()); break;
      case "--quiet": case "-q": a.quiet = true; break;
      case "--color": a.color = true; break;
      case "--no-color": a.color = false; break;
      case "--fast": a.fast = true; break;
      case "--since": a.since = value(); break;
      case "--include": a.include.push(value()); break;
      case "--exclude": a.exclude.push(value()); break;
      case "--all-files": a.allFiles = true; break;
      case "--code": a.code = true; break;
      case "--no-transcripts": a.transcripts = false; break;
      case "--jobs": case "-j": a.jobs = Math.max(1, Math.floor(number())); break;
      case "--sample": a.sample = Math.floor(number()); break;
      case "--full": a.sample = 0; break;
      case "--no-commit-graph": a.commitGraph = false; break;
      case "--max-ai": a.maxAi = number(); break;
      default:
        if (arg.startsWith("-") && arg !== "-") throw new UsageError(`unknown option ${arg}`);
        positional.push(arg);
    }
  }
  if (a.command === "analyze" && positional[0] === "blame") {
    a.command = "blame";
    a.file = positional[1];
    if (!a.file) throw new UsageError("usage: aiblame blame <file>");
  } else if (a.command === "analyze" && positional[0] === "agents") {
    a.command = "agents";
  } else if (a.command === "analyze" && positional[0] === "evidence") {
    a.command = "evidence";
    if (positional[1]) a.target = positional[1];
  } else if (positional.length > 1) {
    throw new UsageError(`expected one target, got: ${positional.join(" ")}`);
  } else if (positional[0]) {
    a.target = positional[0];
  }
  if (a.since && !a.fast) throw new UsageError("--since only works with --fast (blame always looks at the current code)");
  return a;
}

function progressReporter(enabled: boolean) {
  const stream = process.stderr;
  if (!enabled || !stream.isTTY) return { update: () => {}, done: () => {} };
  const labels: Record<string, string> = {
    files: "Listing files",
    history: "Reading history",
    transcripts: "Scanning agent transcripts",
    "commit-graph": "Indexing history so blame runs fast (one-time)",
    blame: "Blaming files",
  };
  let last = 0;
  const frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
  let frame = 0;
  return {
    update(phase: string, done: number, total: number) {
      const now = Date.now();
      if (now - last < 80 && done !== total) return;
      last = now;
      const count = total ? ` ${done.toLocaleString("en-US")}/${total.toLocaleString("en-US")}` : done ? ` ${done.toLocaleString("en-US")}` : "";
      stream.write(`\r\x1b[2K  ${frames[frame++ % frames.length]} ${labels[phase] ?? phase}${count}`);
    },
    done() {
      stream.write("\r\x1b[2K");
    },
  };
}

function write(file: string, content: string, quietLog: boolean) {
  writeFileSync(file, content);
  if (!quietLog) process.stderr.write(`  wrote ${file}\n`);
}

export async function main(argv: string[]): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`aiblame: ${e.message}\nRun aiblame --help for usage.\n`);
      return 2;
    }
    throw e;
  }
  const painter = createPainter({ color: args.color });
  const columns = process.stdout.columns || Number(process.env.COLUMNS) || 88;

  switch (args.command) {
    case "help":
      process.stdout.write(HELP.trimStart());
      return 0;
    case "version":
      process.stdout.write(`${VERSION}\n`);
      return 0;
    case "agents": {
      const rows = AGENTS.map((a) => {
        const sigs = [...(a.identity ?? []), ...(a.message ?? [])].map((r) => r.source).join("  ");
        return `  ${painter.fg(a.color, "■")} ${a.name.padEnd(16)} ${painter.dim(a.kind === "bot" ? "bot " : "ai  ")} ${painter.dim(sigs || "(local transcripts only)")}`;
      });
      process.stdout.write(`\n${rows.join("\n")}\n\n`);
      return 0;
    }
    case "evidence": {
      let clone: Awaited<ReturnType<typeof cloneRemote>> | null = null;
      try {
        if (isRemoteTarget(args.target)) clone = await cloneRemote(args.target);
        process.stdout.write(await renderEvidence({ path: clone?.path ?? args.target, rev: args.rev, top: args.top }, painter));
      } finally {
        clone?.cleanup();
      }
      return 0;
    }
    case "blame":
      process.stdout.write(
        await renderBlameView(
          { file: args.file!, rev: args.rev, transcripts: args.transcripts, columns: process.stdout.isTTY || process.env.COLUMNS ? columns : 0 },
          painter,
        ),
      );
      return 0;
  }

  const progress = progressReporter(!args.quiet);
  let clone: Awaited<ReturnType<typeof cloneRemote>> | null = null;
  let path = args.target;
  let name: string | undefined;
  if (isRemoteTarget(args.target)) {
    name = displayName(args.target);
    progress.update(`Cloning ${name}`, 0, 0);
    clone = await cloneRemote(args.target, { shallowSince: args.fast ? args.since : undefined });
    path = clone.path;
  }
  let report: Report;
  try {
    report = await analyze({
      path,
      name,
      rev: args.rev,
      mode: args.fast ? "history" : "blame",
      since: args.since,
      include: args.include,
      exclude: args.exclude,
      noDefaultExcludes: args.allFiles,
      codeOnly: args.code,
      transcripts: args.transcripts,
      jobs: args.jobs,
      sample: args.sample ?? "auto",
      commitGraph: clone ? "always" : args.commitGraph ? "auto" : "never",
      onProgress: progress.update,
    });
  } finally {
    progress.done();
    clone?.cleanup();
  }

  if (args.json === true) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else if (!args.quiet) process.stdout.write(renderTerminal(report, painter, { columns, top: args.top }) + "\n");

  const quietLog = args.json === true;
  if (typeof args.json === "string") write(args.json, JSON.stringify(report, null, 2) + "\n", quietLog);
  if (args.html) write(args.html, renderHtml(report), quietLog);
  if (args.card) write(args.card, renderCard(report), quietLog);
  if (args.badge) write(args.badge, renderBadge(report, { label: args.label }), quietLog);
  if (args.shields) write(args.shields, renderShieldsEndpoint(report, { label: args.label }), quietLog);

  if (args.maxAi !== undefined && report.totals.lines > 0) {
    const share = (report.totals.ai / report.totals.lines) * 100;
    if (share > args.maxAi) {
      process.stderr.write(`aiblame: AI share ${pct(report.totals.ai, report.totals.lines)} is above the --max-ai limit of ${args.maxAi}%\n`);
      return 3;
    }
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\naiblame: ${msg}\n`);
    process.exitCode = 1;
  },
);
