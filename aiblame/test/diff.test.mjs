import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { analyzeDiff, parseAddedRanges, renderDiffMarkdown } from "../dist/index.js";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
let root;
let repo;
let clock = Date.parse("2026-03-01T00:00:00Z") / 1000;

const git = (args, env = {}) => execFileSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, HOME: root, ...env } });
function commit(files, message, name = "Ada", email = "ada@example.com") {
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, p)), { recursive: true });
    writeFileSync(join(repo, p), content);
  }
  git(["add", "-A"]);
  clock += 3600;
  const date = `${clock} +0000`;
  git(["commit", "-q", "-m", message], {
    GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email,
    GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
  });
}
const lines = (p, n) => Array.from({ length: n }, (_, i) => `const ${p}${i} = ${i};`).join("\n") + "\n";

before(() => {
  root = mkdtempSync(join(tmpdir(), "aiblame-diff-"));
  repo = join(root, "repo");
  mkdirSync(repo);
  git(["init", "-q", "-b", "main"]);
  commit({ "src/a.ts": lines("a", 10) }, "Initial");
  git(["checkout", "-q", "-b", "feature"]);
  // Claude adds 6 lines to a.ts and a new 8-line file; a human adds 4 lines; main moves on meanwhile.
  commit({ "src/a.ts": lines("a", 10) + lines("claude", 6), "src/new.ts": lines("n", 8) }, "Add feature\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
  commit({ "src/b.ts": lines("h", 4) }, "Human bit");
  git(["checkout", "-q", "main"]);
  commit({ "src/main-only.ts": lines("m", 5) }, "Main work");
  git(["checkout", "-q", "feature"]);
  // Bring main into the branch, as CI does when it checks out a PR's merge commit.
  git(["merge", "-q", "--no-edit", "main"], { GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "ada@example.com", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "ada@example.com" });
});

after(() => rmSync(root, { recursive: true, force: true }));

test("parseAddedRanges reads -U0 hunks, including pure additions and new files", () => {
  const patch = [
    "diff --git a/x.ts b/x.ts",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -3,0 +4,2 @@ ctx",
    "+one",
    "+two",
    "@@ -10 +12 @@",
    "-old",
    "+new",
    "@@ -20,3 +22,0 @@",
    "diff --git a/gone.ts b/gone.ts",
    "--- a/gone.ts",
    "+++ /dev/null",
    "@@ -1,2 +0,0 @@",
    'diff --git "a/sp ace.ts" "b/sp ace.ts"',
    '+++ "b/sp ace.ts"',
    "@@ -0,0 +1,3 @@",
  ].join("\n");
  const r = parseAddedRanges(patch);
  assert.deepEqual(r.get("x.ts"), [[4, 2], [12, 1]]);
  assert.equal(r.has("gone.ts"), false);
  assert.deepEqual(r.get("sp ace.ts"), [[1, 3]]);
});

test("analyzeDiff attributes exactly the lines the branch adds", async () => {
  const r = await analyzeDiff({ path: repo, base: "main", transcripts: false });
  assert.equal(r.totals.lines, 18, "6 + 8 from Claude, 4 from the human; nothing from main");
  assert.equal(r.totals.ai, 14);
  assert.equal(r.totals.human, 4);
  assert.equal(r.commits.total, 2, "the merge commit is not counted");
  assert.equal(r.commits.ai, 1);
  assert.deepEqual(r.agents.map((a) => [a.id, a.lines]), [["claude-code", 14]]);
  assert.ok(!r.files.some((f) => f.path === "src/main-only.ts"));
});

test("the PR comment is marked, summarised and escaped", async () => {
  const r = await analyzeDiff({ path: repo, base: "main", transcripts: false });
  const md = renderDiffMarkdown(r);
  assert.ok(md.startsWith("<!-- aiblame -->\n"));
  assert.match(md, /77\.8% of the lines this pull request adds were written by AI/);
  assert.match(md, /🟧 Claude Code \| 14 \| 77\.8%/);
  assert.match(md, /⬜ Human \| 4 \| 22\.2%/);
  assert.match(md, /1 of 2 commits carry an AI signature/);
});

test("CLI: diff prints markdown, writes files and enforces --max-ai", () => {
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: "utf8", env: { ...process.env, HOME: root, NO_COLOR: "1" } });
  const text = run(["diff", "main"]);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /77\.8% of the added lines were written by AI/);
  const md = run(["diff", "main", "--markdown"]);
  assert.match(md.stdout, /^<!-- aiblame -->/);
  const out = join(root, "pr.md");
  assert.equal(run(["diff", "main", "--quiet", "--markdown", out]).status, 0);
  assert.match(readFileSync(out, "utf8"), /Claude Code/);
  assert.equal(run(["diff", "main", "--quiet", "--max-ai", "50"]).status, 3);
  assert.equal(run(["diff", "main", "--quiet", "--max-ai", "90"]).status, 0);
});
