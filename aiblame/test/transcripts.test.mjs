import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadTranscripts, parseApplyPatch, parseSearchReplace, TranscriptIndex } from "../dist/index.js";

test("parseApplyPatch collects added lines per file, following moves", () => {
  const patch = [
    "*** Begin Patch",
    "*** Add File: src/new.ts",
    "+export const a = 1;",
    "+export const b = 2;",
    "*** Update File: src/old.ts",
    "*** Move to: src/renamed.ts",
    "@@ function f() {",
    "-  return 1;",
    "+  return 2;",
    " }",
    "*** Delete File: src/gone.ts",
    "*** End Patch",
  ].join("\n");
  assert.deepEqual(parseApplyPatch(patch), [
    ["src/new.ts", "export const a = 1;\nexport const b = 2;"],
    ["src/renamed.ts", "  return 2;"],
  ]);
});

test("parseSearchReplace returns replacement blocks only", () => {
  const text = ["<<<<<<< SEARCH", "old line", "=======", "new line 1", "new line 2", ">>>>>>> REPLACE"].join("\n");
  assert.deepEqual(parseSearchReplace(text), ["new line 1\nnew line 2"]);
});

test("TranscriptIndex only credits writes made before the commit, once each", () => {
  const idx = new TranscriptIndex();
  const t = Date.parse("2026-01-01T00:00:00Z");
  idx.addText("a.ts", "const answer = 42;\nconst answer = 42;\n}", t, "codex");
  assert.equal(idx.claim("a.ts", "  const answer   = 42;", t - 3600_000), null, "committed before the agent wrote it");
  assert.equal(idx.claim("a.ts", "const answer = 42;", t + 60_000), "codex");
  assert.equal(idx.claim("a.ts", "const answer = 42;", t + 60_000), "codex");
  assert.equal(idx.claim("a.ts", "const answer = 42;", t + 60_000), null, "both writes already claimed");
  assert.equal(idx.claim("a.ts", "}", t + 60_000), null, "trivial lines are not indexed");
  assert.equal(idx.claim("b.ts", "const answer = 42;", t + 60_000), null, "other file");
});

test("loadTranscripts reads Claude Code and Codex sessions from HOME", (t) => {
  const home = mkdtempSync(join(tmpdir(), "aiblame-home-"));
  const repo = join(home, "work", "my-repo");
  mkdirSync(repo, { recursive: true });
  const oldHome = process.env.HOME;
  process.env.HOME = home;
  t.after(() => {
    process.env.HOME = oldHome;
    rmSync(home, { recursive: true, force: true });
  });

  // Claude Code: ~/.claude/projects/<cwd with non-alphanumerics as "-">/<session>.jsonl
  const claudeDir = join(home, ".claude", "projects", repo.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(claudeDir, { recursive: true });
  const claudeLines = [
    { type: "user", cwd: repo, timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "write it" } },
    {
      type: "assistant",
      cwd: repo,
      timestamp: "2026-01-01T00:00:05Z",
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: "1", name: "Write", input: { file_path: join(repo, "src/hello.ts"), content: "export function hello() {\n  return 'hi';\n}\n" } },
          { type: "tool_use", id: "2", name: "Read", input: { file_path: join(repo, "src/other.ts") } },
          { type: "tool_use", id: "3", name: "MultiEdit", input: { file_path: join(repo, "src/multi.ts"), edits: [{ old_string: "a", new_string: "const multiEdited = true;" }] } },
        ],
      },
    },
    // A Read result carries file content too; it must not count as a write.
    { type: "user", cwd: repo, timestamp: "2026-01-01T00:00:06Z", toolUseResult: { file: { filePath: join(repo, "src/other.ts"), content: "human wrote this line" } } },
  ];
  writeFileSync(join(claudeDir, "s1.jsonl"), claudeLines.map((l) => JSON.stringify(l)).join("\n"));

  // Codex: apply_patch sent through the shell tool, arguments as a JSON string.
  const codexDir = join(home, ".codex", "sessions", "2026", "01", "02");
  mkdirSync(codexDir, { recursive: true });
  const patch = "*** Begin Patch\n*** Add File: lib/util.py\n+def util():\n+    return 42\n*** End Patch";
  const codexLines = [
    { timestamp: "2026-01-02T00:00:00Z", type: "session_meta", payload: { cwd: repo } },
    {
      timestamp: "2026-01-02T00:00:01Z",
      type: "response_item",
      payload: { type: "function_call", name: "shell", arguments: JSON.stringify({ command: ["apply_patch", patch] }) },
    },
  ];
  writeFileSync(join(codexDir, "rollout-1.jsonl"), codexLines.map((l) => JSON.stringify(l)).join("\n"));

  // An unrelated project must be ignored.
  const otherDir = join(home, ".claude", "projects", "-somewhere-else");
  mkdirSync(otherDir, { recursive: true });
  writeFileSync(join(otherDir, "s.jsonl"), JSON.stringify(claudeLines[1]));

  const idx = loadTranscripts(repo);
  const later = Date.parse("2026-02-01T00:00:00Z");
  assert.equal(idx.claim("src/hello.ts", "export function hello() {", later), "claude-code");
  assert.equal(idx.claim("src/multi.ts", "const multiEdited = true;", later), "claude-code");
  assert.equal(idx.claim("src/other.ts", "human wrote this line", later), null);
  assert.equal(idx.claim("lib/util.py", "    return 42", later), "codex");
  assert.equal(idx.sources.get("claude-code").files, 1);
  assert.equal(idx.sources.get("codex").files, 1);
});

test("loadTranscripts matches sessions started through a symlinked path", (t) => {
  const home = mkdtempSync(join(tmpdir(), "aiblame-home-"));
  const real = join(home, "real-repo");
  const alias = join(home, "alias-repo");
  mkdirSync(real);
  symlinkSync(real, alias);
  const old = { HOME: process.env.HOME, PWD: process.env.PWD };
  process.env.HOME = home;
  process.env.PWD = alias;
  t.after(() => {
    Object.assign(process.env, old);
    rmSync(home, { recursive: true, force: true });
  });
  const dir = join(home, ".claude", "projects", alias.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(dir, { recursive: true });
  const entry = {
    type: "assistant",
    cwd: alias,
    timestamp: "2026-01-01T00:00:05Z",
    message: { content: [{ type: "tool_use", name: "Write", input: { file_path: join(alias, "a.py"), content: "print('from the alias')" } }] },
  };
  writeFileSync(join(dir, "s.jsonl"), JSON.stringify(entry));
  const idx = loadTranscripts(real);
  assert.equal(idx.claim("a.py", "print('from the alias')", Date.parse("2026-02-01")), "claude-code");
});
