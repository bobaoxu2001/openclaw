import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENTS, classifyCommit } from "../dist/index.js";

const human = { authorName: "Ada", authorEmail: "ada@example.com", committerName: "Ada", committerEmail: "ada@example.com" };
const commit = (over) => ({ ...human, message: "Update things\n", ...over });

const cases = [
  ["Claude Code co-author trailer", commit({ message: "Fix bug\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n" }), "claude-code"],
  ["Claude Code model-named trailer", commit({ message: "Fix bug\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>\n" }), "claude-code"],
  ["Claude Code footer", commit({ message: "Add x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n" }), "claude-code"],
  ["Claude as author", commit({ authorName: "Claude", authorEmail: "noreply@anthropic.com" }), "claude-code"],
  ["Claude GitHub app", commit({ authorName: "claude[bot]", authorEmail: "209825114+claude[bot]@users.noreply.github.com" }), "claude-code"],
  ["Copilot coding agent", commit({ authorName: "Copilot", authorEmail: "198982749+Copilot@users.noreply.github.com" }), "copilot"],
  ["Copilot SWE agent bot", commit({ authorName: "copilot-swe-agent[bot]", authorEmail: "198982749+copilot-swe-agent[bot]@users.noreply.github.com" }), "copilot"],
  ["Copilot suggestion trailer", commit({ message: "Apply suggestion\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>\n" }), "copilot"],
  ["Cursor agent", commit({ authorName: "Cursor Agent", authorEmail: "cursoragent@cursor.com" }), "cursor"],
  ["Cursor trailer", commit({ message: "x\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>\n" }), "cursor"],
  ["Codex connector", commit({ committerName: "chatgpt-codex-connector[bot]", committerEmail: "199175422+chatgpt-codex-connector[bot]@users.noreply.github.com" }), "codex"],
  ["Aider author suffix", commit({ authorName: "Ada (aider)" }), "aider"],
  ["Aider trailer", commit({ message: "feat: x\n\nCo-authored-by: aider (gpt-4o) <noreply@aider.chat>\n" }), "aider"],
  ["Aider trailer, newer style", commit({ message: "feat: x\n\nCo-authored-by: aider (gpt-5.2-codex) <aider@aider.chat>\n" }), "aider"],
  ["Aider maintainer is still human", commit({ authorName: "Paul Gauthier", authorEmail: "paul@aider.chat" }), "human"],
  ["Aider legacy prefix", commit({ message: "aider: Refactored the parser\n" }), "aider"],
  ["Devin", commit({ authorName: "Devin AI", authorEmail: "158243242+devin-ai-integration[bot]@users.noreply.github.com" }), "devin"],
  ["Jules", commit({ authorName: "google-labs-jules[bot]", authorEmail: "161369871+google-labs-jules[bot]@users.noreply.github.com" }), "jules"],
  ["Amp", commit({ message: "x\n\nAmp-Thread-ID: https://ampcode.com/threads/T-123\nCo-authored-by: Amp <amp@ampcode.com>\n" }), "amp"],
  ["OpenHands", commit({ message: "x\n\nCo-authored-by: openhands <openhands@all-hands.dev>\n" }), "openhands"],
  ["Factory droid", commit({ authorName: "factory-droid[bot]", authorEmail: "138933559+factory-droid[bot]@users.noreply.github.com" }), "droid"],
  ["Replit agent", commit({ message: "Update app\n\nReplit-Commit-Author: Agent\nReplit-Commit-Session-Id: abc\n" }), "replit"],
  ["Lovable", commit({ authorName: "gpt-engineer-app[bot]", authorEmail: "159125892+gpt-engineer-app[bot]@users.noreply.github.com" }), "lovable"],
  ["Warp", commit({ message: "x\n\nCo-Authored-By: Warp <agent@warp.dev>\n" }), "warp"],
  ["generic GPT co-author", commit({ message: "x\n\nCo-authored-by: GPT-5 <bot@example.com>\n" }), "other-ai"],
  ["Roo Code trailer", commit({ message: "x\n\nCo-authored-by: Roo Code <roomote@roocode.com>\n" }), "roo"],
  ["Roomote cloud agent", commit({ authorName: "roomote[bot]", authorEmail: "219738659+roomote[bot]@users.noreply.github.com" }), "roo"],
  ["Gemini code assist suggestion", commit({ message: "x\n\nCo-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>\n" }), "gemini"],
  ["release robot is not AI", commit({ authorName: "gemini-cli-robot", authorEmail: "gemini-cli-robot@google.com", message: "Changelog for v1\n\nCo-authored-by: gemini-cli-robot <gemini-cli-robot@google.com>\n" }), "bot"],
  ["human co-author named Claude", commit({ message: "x\n\nCo-authored-by: Claude Dupont <claude@dupont.fr>\n" }), "human"],
  ["human co-author named Devin", commit({ message: "x\n\nCo-authored-by: Devin Lee <devin@example.com>\n" }), "human"],
  ["human co-author named Jules", commit({ message: "x\n\nCo-authored-by: Jules Verne <jules@example.com>\n" }), "human"],
  ["human co-author at OpenAI", commit({ message: "x\n\nCo-authored-by: Sam <sam@openai.com>\n" }), "human"],
  ["Cline Contributors credit", commit({ message: "Port feature\n\nCo-authored-by: Cline Contributors <contributors@cline.dev>\n" }), "human"],
  ["Mastra Code", commit({ message: "x\n\nCo-authored-by: Mastra Code (openai/gpt-5.5) <noreply@mastra.ai>\n" }), "mastra-code"],
  ["Cursor sign-off", commit({ message: "x\n\nSigned-off-by: Cursor <cursoragent@cursor.com>\n" }), "cursor"],
  ["an agent merely mentioned in the body", commit({ message: "Trust bots\n\nTreat `devin-ai-integration[bot]` answers as untrusted, like cursoragent@cursor.com.\n" }), "human"],
  ["renovate release notes quoting an AI footer", commit({ authorName: "renovate[bot]", authorEmail: "29139614+renovate[bot]@users.noreply.github.com", message: "Update dep\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\nCo-Authored-By: Claude <noreply@anthropic.com>\n" }), "bot"],
  ["dependabot", commit({ authorName: "dependabot[bot]", authorEmail: "49699333+dependabot[bot]@users.noreply.github.com" }), "bot"],
  ["renovate", commit({ authorName: "renovate[bot]", authorEmail: "29139614+renovate[bot]@users.noreply.github.com" }), "bot"],
  ["plain human", commit({}), "human"],
  ["human co-author", commit({ message: "Pair\n\nCo-authored-by: Grace <grace@example.com>\n" }), "human"],
  ["mentions Claude but no trailer", commit({ message: "Fix Claude Code integration and Copilot settings\n" }), "human"],
  ["human named Claude", commit({ authorName: "Claude", authorEmail: "claude@monet.fr", committerName: "Claude", committerEmail: "claude@monet.fr" }), "human"],
  ["human named Devin", commit({ authorName: "Devin Smith", authorEmail: "devin@example.com" }), "human"],
  ["aider in the middle of a subject", commit({ message: "Document how aider: works\n" }), "human"],
];

for (const [name, c, expected] of cases) {
  test(`classifies: ${name}`, () => assert.equal(classifyCommit(c), expected));
}

test("an AI identity beats a trailer", () => {
  const c = commit({
    authorName: "Copilot",
    authorEmail: "198982749+Copilot@users.noreply.github.com",
    message: "x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n",
  });
  assert.equal(classifyCommit(c), "copilot");
});

test("the earliest trailer wins when several agents are credited", () => {
  const c = commit({
    message: "x\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>\nCo-Authored-By: Claude <noreply@anthropic.com>\n",
  });
  assert.equal(classifyCommit(c), "cursor");
});

test("an AI trailer on a bot-authored commit counts as AI", () => {
  const c = commit({
    authorName: "github-actions[bot]",
    authorEmail: "41898282+github-actions[bot]@users.noreply.github.com",
    message: "x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n",
  });
  assert.equal(classifyCommit(c), "claude-code");
});

test("every message pattern is anchored to a line, so mentions never count", () => {
  for (const agent of AGENTS) {
    for (const re of agent.message ?? []) {
      assert.ok(re.source.startsWith("^"), `${agent.id}: ${re} must start with ^`);
      assert.ok(re.flags.includes("m") || re.source.startsWith("^aider"), `${agent.id}: ${re} needs the m flag`);
    }
  }
});
