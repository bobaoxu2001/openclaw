import assert from "node:assert/strict";
import { test } from "node:test";
import { globToRegExp, languageOf, makeFilter, renderBadge, renderCard, renderHtml, renderTerminal, createPainter } from "../dist/index.js";
import { allocate, pct } from "../dist/report/common.js";
import { ratioMargin, redactUrl, sampleFiles } from "../dist/analyze.js";

test("globToRegExp follows gitignore conventions", () => {
  const m = (glob, path) => globToRegExp(glob).test(path);
  assert.ok(m("*.md", "README.md"));
  assert.ok(m("*.md", "docs/guide/intro.md"));
  assert.ok(!m("*.md", "src/md.ts"));
  assert.ok(m("src/**", "src/a/b.ts"));
  assert.ok(!m("src/**", "lib/src/a.ts"));
  assert.ok(m("docs/", "docs/a.md"));
  assert.ok(m("docs/", "packages/x/docs/a.md"));
  assert.ok(m("src/*.ts", "src/a.ts"));
  assert.ok(!m("src/*.ts", "src/a/b.ts"));
  assert.ok(m("**/test/**", "a/test/b.js"));
  assert.ok(m("**/test/**", "test/b.js"));
  assert.ok(m("file?.js", "file1.js"));
});

test("default filter skips lockfiles, vendored and generated code", () => {
  const f = makeFilter({});
  for (const p of ["pnpm-lock.yaml", "a/package-lock.json", "node_modules/x/index.js", "vendor/lib.go", "dist/app.min.js", "api.pb.go", "logo.svg", "Cargo.lock"]) {
    assert.equal(f(p), false, p);
  }
  for (const p of ["src/index.ts", "README.md", "package.json", "build/script.sh", "Dockerfile"]) assert.equal(f(p), true, p);
  assert.equal(makeFilter({ noDefaultExcludes: true })("pnpm-lock.yaml"), true);
  const code = makeFilter({ codeOnly: true });
  assert.equal(code("src/a.ts"), true);
  assert.equal(code("Dockerfile"), true);
  for (const p of ["README.md", "config.yml", "data.json", "LICENSE", "notes.txt"]) assert.equal(code(p), false, p);
});

test("languageOf", () => {
  assert.equal(languageOf("src/a.tsx"), "TypeScript");
  assert.equal(languageOf("Dockerfile"), "Dockerfile");
  assert.equal(languageOf("x/Makefile"), "Makefile");
  assert.equal(languageOf("weird.zzz"), "Other");
  assert.equal(languageOf(".bashrc"), "Other");
});

test("pct formats shares readably", () => {
  assert.equal(pct(0, 10), "0%");
  assert.equal(pct(1, 3), "33.3%");
  assert.equal(pct(1, 2), "50%");
  assert.equal(pct(1, 100000), "<0.1%");
  assert.equal(pct(99999, 100000), ">99.9%");
  assert.equal(pct(5, 5), "100%");
  assert.equal(pct(3, 1000), "0.3%");
});

test("allocate fills every cell and never drops a non-empty segment", () => {
  for (const [values, cells] of [[[1, 1, 1], 10], [[1000, 1, 1], 20], [[0, 5, 5], 7], [[3], 40]]) {
    const out = allocate(values, cells);
    assert.equal(out.reduce((a, b) => a + b, 0), cells);
    values.forEach((v, i) => assert.equal(v > 0, out[i] > 0));
  }
});

test("sampleFiles is deterministic and without replacement", () => {
  const files = Array.from({ length: 100 }, (_, i) => ({ path: `f${i}`, lines: i + 1 }));
  const a = sampleFiles(files, 10, "abc");
  const b = sampleFiles(files, 10, "abc");
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((f) => f.path)).size, 10);
  assert.notDeepEqual(sampleFiles(files, 10, "abd"), a);
});

test("ratioMargin shrinks as the sample covers the population", () => {
  const files = Array.from({ length: 50 }, (_, i) => ({ path: `f${i}`, lang: "x", lines: 10, by: i % 2 ? { human: 10 } : { "claude-code": 10 } }));
  assert.ok(ratioMargin(files, 1000) > ratioMargin(files, 60));
  assert.equal(ratioMargin(files, 50), 0);
});

const report = {
  tool: { name: "aiblame", version: "0.0.0" },
  mode: "blame",
  generatedAt: "2026-01-01T00:00:00.000Z",
  repo: { name: "acme/<rocket>", path: "/x", remote: null, branch: "main", rev: "HEAD", sha: "0123456789abcdef0123456789abcdef01234567", shallow: false },
  since: null,
  sample: null,
  totals: { files: 2, lines: 100, ai: 40, human: 55, bot: 5 },
  agents: [
    { id: "claude-code", name: "Claude Code", color: "#D97757", lines: 30, commits: 3, files: 1, transcriptLines: 0 },
    { id: "codex", name: "OpenAI Codex", color: "#10A37F", lines: 10, commits: 1, files: 1, transcriptLines: 10 },
  ],
  files: [
    { path: "src/a.ts", lang: "TypeScript", lines: 60, by: { "claude-code": 30, human: 30 } },
    { path: "src/b.ts", lang: "TypeScript", lines: 40, by: { codex: 10, human: 25, bot: 5 } },
  ],
  languages: [{ name: "TypeScript", lines: 100, ai: 40 }],
  timeline: [
    { month: "2025-12", added: 50, ai: 10, by: { human: 40, codex: 10 } },
    { month: "2026-01", added: 50, ai: 30, by: { human: 15, "claude-code": 30, bot: 5 } },
  ],
  commits: { total: 10, ai: 4, bot: 1, humanAuthors: 2, aiAssistedAuthors: 1, firstAi: { sha: "abc", date: "2025-12-02T00:00:00.000Z", agent: "codex" }, latestAi: null },
  evidence: { signedCommits: 4, transcriptLines: 10, transcripts: [{ agent: "codex", files: 1, writes: 2, lines: 12 }] },
};

test("renderers produce escaped, self-contained output", () => {
  const badge = renderBadge(report);
  assert.match(badge, /40%/);
  const card = renderCard(report);
  assert.match(card, /acme\/&lt;rocket&gt;/);
  assert.ok(!/(fill|stroke)="var\(/.test(card), "no CSS variables in presentation attributes");
  const html = renderHtml(report);
  assert.ok(!html.includes("<rocket>"), "repo name is escaped in HTML");
  assert.match(html, /\\u003crocket>/);
  const text = renderTerminal(report, createPainter({ color: false }), { columns: 80 });
  assert.match(text, /40% written by AI/);
  assert.match(text, /Claude Code/);
  assert.match(text, /10 more lines matched in local agent transcripts/);
});

test("redactUrl strips credentials from remotes", () => {
  assert.equal(redactUrl("https://user:ghp_secret@github.com/a/b.git"), "https://github.com/a/b.git");
  assert.equal(redactUrl("https://x-access-token:abc@github.com/a/b"), "https://github.com/a/b");
  assert.equal(redactUrl("git@github.com:a/b.git"), "git@github.com:a/b.git");
  assert.equal(redactUrl("https://github.com/a/b.git"), "https://github.com/a/b.git");
  assert.equal(redactUrl(null), null);
});

test("HTML reports never embed the local checkout path", () => {
  const html = renderHtml({ ...report, repo: { ...report.repo, path: "/Users/secret-name/code/x" } });
  assert.ok(!html.includes("secret-name"));
});
