import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { analyze } from "../dist/index.js";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
const ADA = { name: "Ada", email: "ada@example.com" };

let root;
let home;
let repo;
let clock = Date.parse("2026-01-01T00:00:00Z") / 1000;

function git(args, env = {}) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, HOME: home, ...env } });
}

function commit(files, message, author = ADA, committer = author) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  git(["add", "-A"]);
  clock += 86400;
  git(["commit", "-q", "-m", message], {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: committer.name,
    GIT_COMMITTER_EMAIL: committer.email,
    GIT_AUTHOR_DATE: `${clock} +0000`,
    GIT_COMMITTER_DATE: `${clock} +0000`,
  });
}

const lines = (prefix, n) => Array.from({ length: n }, (_, i) => `const ${prefix}${i} = ${i};`).join("\n") + "\n";

before(() => {
  root = mkdtempSync(join(tmpdir(), "aiblame-e2e-"));
  home = join(root, "home");
  repo = join(root, "repo");
  mkdirSync(home);
  mkdirSync(repo);
  git(["init", "-q", "-b", "main"]);
  // 10 human lines, 20 Claude lines, 5 Copilot lines, 3 dependabot lines, plus files that must be ignored.
  commit({ "src/human.ts": lines("h", 10), "package-lock.json": "{\n}\n", "logo.bin": Buffer.from([0, 1, 2, 0]) }, "Initial commit");
  commit({ "src/claude.ts": lines("c", 20) }, "Add feature\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
  commit(
    { "src/copilot.ts": lines("p", 5) },
    "Implement helper",
    { name: "Copilot", email: "198982749+Copilot@users.noreply.github.com" },
  );
  commit({ "deps.txt": lines("d", 3) }, "Bump deps", { name: "dependabot[bot]", email: "49699333+dependabot[bot]@users.noreply.github.com" });
  // A human rewrites 5 of Claude's lines: those become human again.
  const claude = readFileSync(join(repo, "src/claude.ts"), "utf8").split("\n");
  for (let i = 0; i < 5; i++) claude[i] = `let rewritten${i} = ${i};`;
  commit({ "src/claude.ts": claude.join("\n") }, "Tweak");
});

after(() => rmSync(root, { recursive: true, force: true }));

test("attributes surviving lines to the agents that wrote them", async () => {
  const r = await analyze({ path: repo, transcripts: false });
  assert.equal(r.totals.lines, 38);
  assert.equal(r.totals.ai, 20);
  assert.equal(r.totals.human, 15);
  assert.equal(r.totals.bot, 3);
  const byId = Object.fromEntries(r.agents.map((a) => [a.id, a]));
  assert.equal(byId["claude-code"].lines, 15);
  assert.equal(byId["claude-code"].commits, 1);
  assert.equal(byId.copilot.lines, 5);
  assert.equal(r.commits.total, 5);
  assert.equal(r.commits.ai, 2);
  assert.equal(r.commits.bot, 1);
  assert.equal(r.commits.firstAi.agent, "claude-code");
  assert.equal(r.commits.humanAuthors, 1);
  assert.equal(r.commits.aiAssistedAuthors, 1, "Ada shipped a Claude co-authored commit");
  assert.ok(!r.files.some((f) => f.path === "package-lock.json" || f.path === "logo.bin"));
  assert.equal(r.sample, null);
  const total = r.timeline.reduce((a, m) => a + m.added, 0);
  assert.equal(total, 38, "blame-mode timeline covers every surviving line");
});

test("history mode counts lines added across all commits", async () => {
  const r = await analyze({ path: repo, mode: "history" });
  // 10 + 20 + 5 + 3 + 5 (rewrite) lines added.
  assert.equal(r.totals.lines, 43);
  assert.equal(r.totals.ai, 25);
});

test("sampling extrapolates to the full tree", async () => {
  const r = await analyze({ path: repo, sample: 2, transcripts: false });
  assert.equal(r.sample.files, 2);
  assert.equal(r.sample.of, 4);
  assert.equal(r.totals.lines, 38);
  assert.equal(r.totals.files, 4);
  assert.equal(r.totals.ai + r.totals.human + r.totals.bot, 38);
});

test("--include / --exclude narrow the analysis", async () => {
  const r = await analyze({ path: repo, include: ["src/**"], exclude: ["src/copilot.ts"], transcripts: false });
  assert.deepEqual(r.files.map((f) => f.path), ["src/claude.ts", "src/human.ts"]);
});

test("unsigned commits are reclaimed from local agent transcripts", async () => {
  const content = "export function fromCodex() {\n  return 'written by codex';\n}\n";
  // The agent writes the file (per its transcript) ...
  const t = new Date((clock + 3600) * 1000).toISOString();
  const patch = `*** Begin Patch\n*** Add File: src/unsigned.ts\n${content.trimEnd().split("\n").map((l) => "+" + l).join("\n")}\n*** End Patch`;
  const dir = join(home, ".codex", "sessions", "2026");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "rollout.jsonl"),
    [
      { timestamp: t, type: "session_meta", payload: { cwd: repo } },
      { timestamp: t, type: "response_item", payload: { type: "custom_tool_call", name: "apply_patch", input: patch } },
    ].map((l) => JSON.stringify(l)).join("\n"),
  );
  // ... and a human commits it without any trailer, two hours later.
  clock += 7200 - 86400;
  commit({ "src/unsigned.ts": content }, "Add helper");

  const oldHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const r = await analyze({ path: repo });
    const f = r.files.find((x) => x.path === "src/unsigned.ts");
    assert.deepEqual(f.by, { codex: 3 }, "the closing brace is filled in from its neighbours");
    assert.equal(r.evidence.transcriptLines, 3);
    const without = await analyze({ path: repo, transcripts: false });
    assert.deepEqual(without.files.find((x) => x.path === "src/unsigned.ts").by, { human: 3 });
  } finally {
    process.env.HOME = oldHome;
  }
});

test("CLI writes reports and enforces --max-ai", () => {
  const out = join(root, "out");
  mkdirSync(out);
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: "utf8", env: { ...process.env, HOME: home, NO_COLOR: "1" } });

  const text = run([]);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /written by AI/);
  assert.match(text.stdout, /Claude Code/);

  const json = run(["--json"]);
  assert.equal(json.status, 0, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.tool.name, "aiblame");

  const files = run(["--quiet", "--html", join(out, "r.html"), "--card", join(out, "c.svg"), "--badge", join(out, "b.svg"), "--shields", join(out, "s.json")]);
  assert.equal(files.status, 0, files.stderr);
  for (const f of ["r.html", "c.svg", "b.svg", "s.json"]) assert.ok(existsSync(join(out, f)), f);
  assert.match(readFileSync(join(out, "b.svg"), "utf8"), /^<svg[^>]+aria-label="AI-written: \d/);
  assert.equal(JSON.parse(readFileSync(join(out, "s.json"), "utf8")).schemaVersion, 1);
  assert.match(readFileSync(join(out, "r.html"), "utf8"), /<script type="application\/json" id="data">\{/);

  assert.equal(run(["--quiet", "--max-ai", "10"]).status, 3);
  assert.equal(run(["--quiet", "--max-ai", "95"]).status, 0);
  assert.equal(run(["--bogus"]).status, 2);

  const blame = run(["blame", "src/claude.ts"]);
  assert.equal(blame.status, 0, blame.stderr);
  assert.match(blame.stdout, /Claude/);
  assert.match(blame.stdout, /rewritten0/);
});
