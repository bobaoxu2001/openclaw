/**
 * The signature database: how each AI coding agent (and non-AI bot) leaves
 * fingerprints in git history.
 *
 * `identity` patterns are tested against "Name <email>" of both the author and
 * the committer. `message` patterns are tested against the full commit message
 * (subject, body and trailers).
 *
 * Patterns must be strict enough not to fire on commits that merely *mention*
 * a tool ("fix Claude integration"): match trailers, footers or bot accounts.
 *
 * Know a signature that is missing? Add it here and send a PR.
 */

export type AgentKind = "ai" | "bot";

export interface AgentSignature {
  id: string;
  name: string;
  /** Short label used in narrow views such as `aiblame blame`. */
  short: string;
  color: string;
  kind: AgentKind;
  url?: string;
  identity?: RegExp[];
  message?: RegExp[];
}

export const HUMAN = { id: "human", name: "Human", short: "human", color: "#6B7280" } as const;

export const AGENTS: AgentSignature[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    short: "Claude",
    color: "#D97757",
    kind: "ai",
    url: "https://claude.com/claude-code",
    identity: [/<noreply@anthropic\.com>/i, /^claude\[bot\] </i],
    message: [
      /^co-authored-by:[^\n]*<noreply@anthropic\.com>/im,
      /^co-authored-by:\s*claude\[bot\]/im,
      /^(🤖\s*)?generated with \[?claude code\b/im,
      /^claude-session:\s*https?:\/\//im,
    ],
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    short: "Copilot",
    color: "#A371F7",
    kind: "ai",
    url: "https://github.com/features/copilot",
    identity: [/\+copilot@users\.noreply\.github\.com/i, /copilot-swe-agent/i],
    message: [/^co-authored-by:[^\n]*<\d+\+copilot@users\.noreply\.github\.com>/im, /^co-authored-by:\s*copilot-swe-agent/im],
  },
  {
    id: "cursor",
    name: "Cursor",
    short: "Cursor",
    color: "#38BDF8",
    kind: "ai",
    url: "https://cursor.com",
    identity: [/cursoragent@cursor\.com/i, /^cursor agent </i, /cursor\[bot\]/i],
    message: [
      /^(co-authored-by|signed-off-by):\s*cursor[^\n]*<[^>\n]*@cursor\.(com|sh)>/im,
      /^(co-authored-by|signed-off-by):[^\n]*<cursor-?agent@cursor\.com>/im,
    ],
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    short: "Codex",
    color: "#10A37F",
    kind: "ai",
    url: "https://openai.com/codex",
    identity: [/chatgpt-codex-connector/i, /codex@openai\.com/i, /^codex\[bot\] </i],
    message: [/^co-authored-by:\s*(openai\s+)?codex\b[^\n]*<[^>\n]*(noreply|codex)[^>\n]*>/im, /^co-authored-by:[^\n]*chatgpt-codex-connector/im],
  },
  {
    id: "devin",
    name: "Devin",
    short: "Devin",
    color: "#2DD4BF",
    kind: "ai",
    url: "https://devin.ai",
    identity: [/devin-ai-integration/i, /^devin ai </i, /@devin\.ai>/i],
    message: [/^co-authored-by:[^\n]*devin-ai-integration/im, /^co-authored-by:\s*devin ai\b/im, /^co-authored-by:[^\n]*<[^>\n]*@(devin\.ai|cognition\.ai)>/im],
  },
  {
    id: "aider",
    name: "Aider",
    short: "Aider",
    color: "#84CC16",
    kind: "ai",
    url: "https://aider.chat",
    identity: [/\(aider\) </i, /<(noreply|aider)@aider\.chat>/i],
    message: [/^co-authored-by:\s*aider\b[^\n]*$/im, /^co-authored-by:[^\n]*<(noreply|aider)@aider\.chat>/im, /^aider: /i],
  },
  {
    id: "jules",
    name: "Google Jules",
    short: "Jules",
    color: "#9B72CB",
    kind: "ai",
    url: "https://jules.google",
    identity: [/google-labs-jules/i],
    message: [/^co-authored-by:[^\n]*google-labs-jules/im],
  },
  {
    id: "gemini",
    name: "Gemini",
    short: "Gemini",
    color: "#4285F4",
    kind: "ai",
    url: "https://github.com/google-gemini/gemini-cli",
    identity: [/gemini-code-assist/i, /^gemini(-cli)?\[bot\] </i],
    // Not "gemini-cli-robot": that is release automation.
    message: [/^co-authored-by:[^\n]*gemini-code-assist\[bot\]/im, /^co-authored-by:\s*gemini(-cli)?\[bot\]/im],
  },
  {
    id: "amp",
    name: "Amp",
    short: "Amp",
    color: "#F43F5E",
    kind: "ai",
    url: "https://ampcode.com",
    identity: [/amp@ampcode\.com/i],
    message: [
      /^co-authored-by:[^\n]*<amp@ampcode\.com>/im,
      /^amp-thread(-id)?:/im,
      // A line that is nothing but a thread link is how some maintainers disclose Amp use.
      /^<?https:\/\/ampcode\.com\/threads\/[\w-]+\S*>?\s*$/im,
    ],
  },
  {
    id: "openhands",
    name: "OpenHands",
    short: "OpenHands",
    color: "#FACC15",
    kind: "ai",
    url: "https://all-hands.dev",
    identity: [/openhands@all-hands\.dev/i, /openhands-agent/i, /^openhands </i],
    message: [/^co-authored-by:[^\n]*@all-hands\.dev>/im, /^co-authored-by:\s*openhands\b[^\n]*$/im],
  },
  {
    id: "droid",
    name: "Factory Droid",
    short: "Droid",
    color: "#F472B6",
    kind: "ai",
    url: "https://factory.ai",
    identity: [/factory-droid/i, /@factory\.ai>/i],
    message: [/^co-authored-by:[^\n]*factory-droid/im, /^co-authored-by:\s*(factory\s+)?droid\b[^\n]*$/im],
  },
  {
    id: "opencode",
    name: "opencode",
    short: "opencode",
    color: "#E879F9",
    kind: "ai",
    url: "https://opencode.ai",
    identity: [/@opencode\.ai>/i, /opencode-agent/i],
    message: [/^co-authored-by:\s*opencode\b[^\n]*$/im, /^(🤖\s*)?generated with \[?opencode\b/im],
  },
  {
    id: "windsurf",
    name: "Windsurf",
    short: "Windsurf",
    color: "#06B6D4",
    kind: "ai",
    url: "https://windsurf.com",
    identity: [/@(windsurf|codeium)\.com>/i],
    message: [/^co-authored-by:\s*(windsurf|cascade|codeium)\b[^\n]*$/im],
  },
  {
    id: "qwen",
    name: "Qwen Code",
    short: "Qwen",
    color: "#615CED",
    kind: "ai",
    url: "https://github.com/QwenLM/qwen-code",
    identity: [/qwen-coder/i],
    message: [/^co-authored-by:\s*qwen[^\n]*$/im],
  },
  {
    id: "warp",
    name: "Warp",
    short: "Warp",
    color: "#01A4FF",
    kind: "ai",
    url: "https://warp.dev",
    identity: [/agent@warp\.dev/i],
    message: [/^co-authored-by:[^\n]*<agent@warp\.dev>/im],
  },
  {
    id: "crush",
    name: "Crush",
    short: "Crush",
    color: "#6B50FF",
    kind: "ai",
    url: "https://github.com/charmbracelet/crush",
    identity: [/crush@charm\.land/i],
    message: [/^co-authored-by:[^\n]*<crush@charm\.land>/im, /^(💘\s*|🤖\s*)?generated with \[?crush\b/im],
  },
  {
    id: "kiro",
    name: "Kiro",
    short: "Kiro",
    color: "#9046FF",
    kind: "ai",
    url: "https://kiro.dev",
    identity: [/@kiro\.dev>/i],
    message: [/^co-authored-by:[^\n]*<[^>\n]*@kiro\.dev>/im, /^co-authored-by:\s*kiro\[bot\]/im],
  },
  {
    id: "cline",
    name: "Cline",
    short: "Cline",
    color: "#FB7185",
    kind: "ai",
    url: "https://cline.bot",
    identity: [/^cline\[bot\] </i],
    message: [/^co-authored-by:\s*cline(\[bot\])?\s*<[^>\n]*(cline\.bot|noreply)[^>\n]*>/im],
  },
  {
    id: "roo",
    name: "Roo Code",
    short: "Roo",
    color: "#E0A96D",
    kind: "ai",
    url: "https://roocode.com",
    identity: [/roomote/i, /^roo(code)?\[bot\] </i],
    message: [/^co-authored-by:\s*(roo ?code|roomote)\b[^\n]*$/im],
  },
  {
    id: "replit",
    name: "Replit Agent",
    short: "Replit",
    color: "#F26207",
    kind: "ai",
    url: "https://replit.com",
    message: [/^replit-commit-author:\s*agent/im],
  },
  {
    id: "lovable",
    name: "Lovable",
    short: "Lovable",
    color: "#FF4D8D",
    kind: "ai",
    url: "https://lovable.dev",
    identity: [/gpt-engineer-app\[bot\]/i, /lovable-dev\[bot\]/i],
  },
  {
    id: "v0",
    name: "v0",
    short: "v0",
    color: "#D4D4D8",
    kind: "ai",
    url: "https://v0.dev",
    identity: [/\bv0\[bot\]/i],
  },
  {
    id: "coderabbit",
    name: "CodeRabbit",
    short: "Rabbit",
    color: "#FF570A",
    kind: "ai",
    url: "https://coderabbit.ai",
    identity: [/coderabbitai\[bot\]/i],
    message: [/^co-authored-by:\s*coderabbitai\[bot\][^\n]*$/im],
  },
  {
    id: "sweep",
    name: "Sweep",
    short: "Sweep",
    color: "#5EEAD4",
    kind: "ai",
    identity: [/sweep-ai\[bot\]/i],
  },
  {
    id: "other-ai",
    name: "Other AI",
    short: "AI",
    color: "#C084FC",
    kind: "ai",
    message: [
      /^co-authored-by:[^\n<]*\b(gpt-?\d[\w.-]*|chatgpt|llm|ai assistant|ai agent|coding agent)\b[^\n]*$/im,
      /^(generated|written) (with|by) (an? )?(ai|llm|chatgpt|gpt-?\d)\b/im,
    ],
  },
  {
    id: "mastra-code",
    name: "Mastra Code",
    short: "Mastra",
    color: "#FB923C",
    kind: "ai",
    url: "https://mastra.ai",
    message: [/^co-authored-by:\s*mastra code\b[^\n]*$/im],
  },
  // Agents below have no commit signature we know of; they are credited via local transcripts.
  { id: "openclaw", name: "OpenClaw", short: "OpenClaw", color: "#FF5A36", kind: "ai", url: "https://openclaw.ai" },
  { id: "pi", name: "pi", short: "pi", color: "#A3E635", kind: "ai", url: "https://github.com/badlogic/pi-mono" },
  {
    id: "bot",
    name: "Bots (non-AI)",
    short: "bot",
    color: "#4B5563",
    kind: "bot",
    identity: [
      /\[bot\]/i,
      /^(dependabot|renovate|greenkeeper|snyk-bot|semantic-release-bot|pre-commit-ci|allcontributors|imgbot|github-actions|mergify|release-please)\b/i,
      /^[\w.-]*[-_](bot|robot) </i,
    ],
  },
];

const BY_ID = new Map<string, { id: string; name: string; short: string; color: string }>(
  [...AGENTS, HUMAN].map((a) => [a.id, a]),
);

export function agentInfo(id: string): { id: string; name: string; short: string; color: string } {
  return BY_ID.get(id) ?? { id, name: id, short: id, color: "#C084FC" };
}

export function isAI(id: string): boolean {
  return id !== HUMAN.id && id !== "bot";
}

export interface CommitIdentity {
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  message: string;
}

/**
 * Decide which agent (if any) produced a commit. Returns the agent id,
 * "bot" for non-AI automation, or "human".
 *
 * Priority: an AI identity (author/committer) beats an AI trailer, which beats
 * a non-AI bot identity. When several trailers match, the earliest one in the
 * message wins.
 */
export function classifyCommit(c: CommitIdentity): string {
  return explainCommit(c).id;
}

export interface Verdict {
  /** Agent id, "bot" or "human". */
  id: string;
  /** What gave it away: the matching "Name <email>" or message line. Empty for humans. */
  evidence: string;
}

/** Like `classifyCommit`, but also says which identity or message line matched. */
export function explainCommit(c: CommitIdentity): Verdict {
  const people = [`${c.authorName} <${c.authorEmail}>`, `${c.committerName} <${c.committerEmail}>`];
  // Dependency bots paste upstream release notes into their messages, which can
  // mention any agent. Their commits are bot commits, whatever the text says.
  const depBot = DEPENDENCY_BOT.test(people[0]!) ? people[0]! : null;
  if (depBot) return { id: "bot", evidence: depBot };
  let best: { id: string; pos: number; evidence: string } | null = null;
  let bot: string | null = null;
  const consider = (agent: AgentSignature) => {
    const who = people.find((p) => agent.identity?.some((re) => re.test(p)));
    if (who) {
      if (agent.kind === "bot") bot ??= who;
      else if (!best || best.pos > -1) best = { id: agent.id, pos: -1, evidence: who };
      return;
    }
    if (agent.kind === "ai" && agent.message) {
      for (const re of agent.message) {
        const m = re.exec(c.message);
        if (!m) continue;
        // Compare by line, so two patterns hitting the same trailer tie (and list order decides).
        const pos = c.message.lastIndexOf("\n", m.index) + 1;
        if (!best || pos < best.pos) {
          const eol = c.message.indexOf("\n", pos);
          best = { id: agent.id, pos, evidence: c.message.slice(pos, eol < 0 ? undefined : eol).trim() };
        }
      }
    }
  };
  for (const agent of AGENTS) if (agent.id !== OTHER_AI) consider(agent);
  // The generic "Other AI" patterns only apply when no specific agent matched.
  if (!best) consider(AGENTS.find((a) => a.id === OTHER_AI)!);
  if (best) {
    const b = best as { id: string; evidence: string };
    return { id: b.id, evidence: b.evidence };
  }
  return bot ? { id: "bot", evidence: bot } : { id: HUMAN.id, evidence: "" };
}

const OTHER_AI = "other-ai";
const DEPENDENCY_BOT = /^(dependabot|renovate|greenkeeper|snyk-bot|depfu|pyup-bot|scala-steward|mend-bolt)/i;
