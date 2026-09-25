<div align="center">

# aiblame

**`git blame` for the AI era.**

How much of your code did Claude, Copilot, Cursor, Codex, Devin & friends *actually* write?<br>
One command. Any repo. Down to the line. No guessing.

English · [简体中文](README.zh-CN.md)

<img src="docs/self-badge.svg" alt="AI-written badge for aiblame itself">

```sh
npx aiblame
```

<img src="docs/terminal.png" width="720" alt="aiblame run on All-Hands-AI/OpenHands: 68.9% of the current code was written by AI agents, mostly by OpenHands itself, then Cursor and Claude Code">

</div>

---

AI agents now write a big share of the world's code, but nobody can say how much.
Commit counts lie (one agent commit can add 5,000 lines), and "AI detectors" guess from style.

**aiblame doesn't guess. It collects evidence.** Coding agents leave fingerprints: `Co-authored-by` trailers, bot accounts,
"Generated with…" footers, and session logs on your disk. aiblame collects those fingerprints, then runs `git blame` on every
line of your repo to find out who wrote the code that is still there *today*.

- **Line-level, not commit-level.** If a human rewrites an AI-written line, it counts as human again. Deleted code doesn't count at all.
- **Evidence you can audit.** `aiblame evidence` lists every signature it matched, with example commits.
- **Catches unsigned AI code (on your machine).** Committed Claude Code or Codex output without a trailer? aiblame can match those lines against the agents' local session transcripts.
- **Works on any repo, instantly.** Local path, git URL, or `owner/repo`. Nothing to install in the repo first.
- **Fast on huge repos.** 100k commits and 48k files take about 2 minutes (sampled, with a ±0.3% margin of error).
- **Zero dependencies.** One `npx` away. Everything runs locally, with no telemetry.

## Leaderboard: how AI-written is your favourite repo?

<!-- LEADERBOARD:START -->
<img src="docs/leaderboard.svg" width="760" alt="Bar chart of the share of current code written by AI agents in popular repositories">

<details>
<summary>Full table: all 51 repositories, with the code-only share</summary>

"Code only" leaves out docs, config and data files (`--code`). `~` marks estimates from a random sample of files.

| Repository | AI-written | Code only | Top agents | AI-signed commits |
|---|---:|---:|---|---:|
| [All-Hands-AI/OpenHands](https://github.com/All-Hands-AI/OpenHands) | **68.7%** | 67.8% | OpenHands 54.6%, Cursor 8.6%, Claude Code 5.4% | 2,590 / 8,327 |
| [mastra-ai/mastra](https://github.com/mastra-ai/mastra) | **~44.9%** | ~54.3% | Mastra Code 31.4%, Claude Code 11.0%, Devin 1.6% | 3,513 / 20,039 |
| [anthropics/claude-code](https://github.com/anthropics/claude-code) | **32.7%** | 5.0% | Claude Code 32.7% | 73 / 878 |
| [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) | **30.0%** | 33.4% | Roo Code 22.6%, Claude Code 6.9%, GitHub Copilot 0.4% | 552 / 7,073 |
| [microsoft/vscode](https://github.com/microsoft/vscode) | **~29.4%** | ~31.7% | GitHub Copilot 29.2%, Claude Code 0.2% | 6,299 / 166,130 |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | **~25.7%** | ~28.1% | Claude Code 20.9%, Cursor 4.6%, OpenAI Codex 0.1% | 2,876 / 24,802 |
| [cli/cli](https://github.com/cli/cli) | **25.1%** | 24.0% | GitHub Copilot 25.1% | 601 / 12,202 |
| [charmbracelet/crush](https://github.com/charmbracelet/crush) | **21.7%** | 22.4% | Crush 20.7%, Claude Code 0.9%, GitHub Copilot 0.1% | 255 / 4,220 |
| [vllm-project/vllm](https://github.com/vllm-project/vllm) | **~21.5%** | ~22.5% | OpenAI Codex 11.2%, Claude Code 7.1%, Gemini 2.0% | 1,764 / 21,953 |
| [block/goose](https://github.com/block/goose) | **19.0%** | 12.9% | GitHub Copilot 14.3%, Claude Code 4.2%, Amp 0.4% | 267 / 5,731 |
| [Aider-AI/aider](https://github.com/Aider-AI/aider) | **16.9%** | 61.6% | Aider 16.9% | 5,947 / 13,138 |
| [openai/openai-agents-python](https://github.com/openai/openai-agents-python) | **15.2%** | 17.6% | OpenAI Codex 15.2% | 2 / 2,355 |
| [sst/opencode](https://github.com/sst/opencode) | **~9.6%** | ~11.6% | opencode 9.1%, GitHub Copilot 0.3%, Claude Code 0.1% | 1,868 / 15,794 |
| [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | **6.9%** | 8.9% | Claude Code 6.9% | 8 / 4,096 |
| [cline/cline](https://github.com/cline/cline) | **6.4%** | 6.0% | Claude Code 4.3%, Cursor 1.4%, GitHub Copilot 0.7% | 155 / 7,434 |
| [better-auth/better-auth](https://github.com/better-auth/better-auth) | **6.2%** | 6.1% | Claude Code 3.3%, GitHub Copilot 1.7%, Cursor 1.1% | 159 / 7,623 |
| [vercel/ai](https://github.com/vercel/ai) | **~6.1%** | ~7.3% | Claude Code 4.8%, Cursor 1.2%, GitHub Copilot 0.1% | 242 / 8,683 |
| [denoland/deno](https://github.com/denoland/deno) | **~5.9%** | ~5.7% | Claude Code 5.7%, GitHub Copilot 0.1% | 429 / 17,368 |
| [oven-sh/bun](https://github.com/oven-sh/bun) | **~5.7%** | ~4.9% | Claude Code 5.7% | 714 / 18,252 |
| [biomejs/biome](https://github.com/biomejs/biome) | **~5.3%** | ~5.5% | CodeRabbit 3.1%, Claude Code 2.0%, GitHub Copilot 0.1% | 145 / 10,985 |
| [openai/codex](https://github.com/openai/codex) | **~5.0%** | ~4.9% | OpenAI Codex 5.0% | 364 / 11,404 |
| [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) | **4.3%** | 4.9% | Claude Code 3.0%, Cursor 0.8%, GitHub Copilot 0.6% | 80 / 1,618 |
| [supabase/supabase](https://github.com/supabase/supabase) | **~4.1%** | ~6.1% | Claude Code 2.8%, GitHub Copilot 0.7%, Cursor 0.4% | 518 / 38,735 |
| [continuedev/continue](https://github.com/continuedev/continue) | **3.5%** | 4.4% | Claude Code 3.4% | 242 / 21,569 |
| [astral-sh/uv](https://github.com/astral-sh/uv) | **3.1%** | 2.7% | Claude Code 1.5%, OpenAI Codex 1.4%, GitHub Copilot 0.2% | 159 / 10,636 |
| [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) | **2.8%** | 5.9% | Gemini 2.8% | 275 / 6,437 |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) | **2.5%** | 3.0% | Claude Code 1.7%, Cursor 0.8% | 261 / 10,295 |
| [vitejs/vite](https://github.com/vitejs/vite) | **1.9%** | 1.7% | Claude Code 0.9%, GitHub Copilot 0.7%, OpenAI Codex 0.2% | 60 / 9,705 |
| [withastro/astro](https://github.com/withastro/astro) | **~1.9%** | ~2.3% | GitHub Copilot 1.5%, Claude Code 0.4% | 24 / 15,118 |
| [zed-industries/zed](https://github.com/zed-industries/zed) | **1.8%** | 1.9% | Claude Code 1.2%, Amp 0.2%, Cursor 0.2% | 142 / 40,135 |
| [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) | **1.6%** | 1.6% | GitHub Copilot 0.9%, Claude Code 0.7% | 34 / 11,181 |
| [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) | **1.3%** | 1.3% | Claude Code 1.3% | 12 / 6,848 |
| [langchain-ai/langchain](https://github.com/langchain-ai/langchain) | **1.2%** | 1.4% | Claude Code 0.9%, GitHub Copilot 0.3% | 44 / 16,852 |
| [vercel/next.js](https://github.com/vercel/next.js) | **~1.2%** | ~1.3% | Claude Code 1.1%, Cursor 0.1% | 231 / 35,862 |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | **~1.2%** | ~1.2% | Claude Code 0.7%, Amp 0.3%, GitHub Copilot 0.1% | 1,740 / 99,874 |
| [ghostty-org/ghostty](https://github.com/ghostty-org/ghostty) | **0.9%** | 1.0% | Claude Code 0.5%, Amp 0.4% | 115 / 17,925 |
| [open-webui/open-webui](https://github.com/open-webui/open-webui) | **0.9%** | 0.8% | Claude Code 0.8% | 208 / 18,717 |
| [astral-sh/ruff](https://github.com/astral-sh/ruff) | **~0.8%** | ~1.0% | Claude Code 0.7%, OpenAI Codex 0.1% | 78 / 17,374 |
| [microsoft/playwright](https://github.com/microsoft/playwright) | **0.7%** | 0.6% | GitHub Copilot 0.5%, Claude Code 0.2% | 82 / 17,980 |
| [honojs/hono](https://github.com/honojs/hono) | **0.6%** | 0.5% | Claude Code 0.6% | 12 / 2,836 |
| [sveltejs/svelte](https://github.com/sveltejs/svelte) | **~0.6%** | ~0.4% | Claude Code 0.4%, GitHub Copilot 0.2% | 22 / 11,411 |
| [facebook/react](https://github.com/facebook/react) | **~0.6%** | ~0.6% | Claude Code 0.4%, Amp 0.1% | 35 / 21,708 |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | **~0.5%** | ~0.4% | Claude Code 0.4% | 62 / 2,459 |
| [neovim/neovim](https://github.com/neovim/neovim) | **0.2%** | 0.2% | Claude Code 0.2% | 57 / 38,230 |
| [badlogic/pi-mono](https://github.com/badlogic/pi-mono) | **0.2%** | 0.2% | Claude Code 0.1% | 15 / 6,531 |
| [fastapi/fastapi](https://github.com/fastapi/fastapi) | **<0.1%** | 0.2% | none found | 3 / 7,713 |
| [pydantic/pydantic](https://github.com/pydantic/pydantic) | **<0.1%** | <0.1% | none found | 4 / 5,758 |
| [ollama/ollama](https://github.com/ollama/ollama) | **<0.1%** | <0.1% | none found | 4 / 5,795 |
| [django/django](https://github.com/django/django) | **~0%** | ~0% | none found | 0 / 34,952 |
| [tauri-apps/tauri](https://github.com/tauri-apps/tauri) | **0%** | 0% | none found | 0 / 6,234 |
| [vuejs/core](https://github.com/vuejs/core) | **0%** | 0% | none found | 0 / 7,198 |

</details>
<!-- LEADERBOARD:END -->

Want your repo on here? Run `npx aiblame --card` and show it off. (See [Put it in your README](#put-it-in-your-readme).)

## Usage

```sh
npx aiblame                        # the repo you're in
npx aiblame ~/code/my-app          # another local repo
npx aiblame facebook/react         # any GitHub repo (cloned to a temp dir)
npx aiblame --code                 # programming languages only: skip docs, config & data
npx aiblame blame src/index.ts     # line-by-line: who wrote each line?
npx aiblame diff origin/main       # how much of this branch / pull request did AI write?
npx aiblame evidence               # audit: which signatures matched, and how often
npx aiblame --html                 # a shareable, self-contained HTML report
```

Install globally (`npm i -g aiblame`) and it also works as a git subcommand: `git aiblame`.

### `aiblame blame <file>`

Like `git blame`, but the gutter tells you which agent wrote each line.

<img src="docs/blame.png" width="720" alt="aiblame blame on a React component: lines colour-coded by OpenHands, Cursor, Claude Code and human">

### `aiblame diff [base]`

How much of what your branch adds was written by AI? aiblame takes the lines added since the merge base, blames exactly those,
and attributes them. `--markdown` renders the result as a pull-request comment, and the [GitHub Action](#github-action) posts it for you:

> **🤖 aiblame: 77.8% of the lines this pull request adds were written by AI**
>
> 🟧🟧🟧🟧🟧🟧🟧🟧🟧🟧🟧🟧🟧🟧🟧🟧⬜⬜⬜⬜
>
> | | Lines | Share |
> |---|---:|---:|
> | 🟧 Claude Code | 14 | 77.8% |
> | ⬜ Human | 4 | 22.2% |

### `aiblame --html`

A single HTML file you can open, share or attach to a PR. It has a stacked timeline, a treemap of the whole codebase coloured by agent, and tables of files, directories and languages.

<img src="docs/report.png" width="720" alt="aiblame HTML report with the headline percentage, a monthly timeline and a treemap of files">

### All options

```text
Output
  --html [file]        self-contained HTML report      (default aiblame-report.html)
  --card [file]        SVG card for your README        (default aiblame-card.svg)
  --badge [file]       SVG badge for your README       (default aiblame-badge.svg)
  --shields [file]     shields.io endpoint JSON        (default aiblame-shields.json)
  --json [file]        full report as JSON (stdout unless a .json file is given)
  --markdown [file]    with diff: a pull-request comment (stdout unless a .md file is given)
  --label <text>       badge label                     (default "AI-written")
  --top <n>            rows per table                  (default 8)
  --quiet              skip the terminal report
  --no-color           plain output

Analysis
  --rev <rev>          analyze a branch, tag or commit (default HEAD)
  --head <rev>         with diff: the branch to compare (default HEAD)
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
  --max-ai <percent>   exit with code 3 if the AI share is above this (CI policy); works with diff too
```

## Put it in your README

Two looks, both plain SVG files you commit next to your README. They follow GitHub's light/dark theme.

```sh
npx aiblame --card --badge --quiet
```

| `--card` | `--badge` |
|---|---|
| <img src="docs/example-card.svg" width="400" alt="Example aiblame card"> | <img src="docs/example-badge.svg" alt="Example aiblame badge"> |

```md
![AI-written](./aiblame-card.svg)
```

Want it always up to date? Use the GitHub Action.

## GitHub Action

### Comment on every pull request

Every PR gets one comment saying how much of it was written by AI. The comment is edited in place on each push, so it never piles up:

```yaml
# .github/workflows/aiblame-pr.yml
name: aiblame
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  aiblame:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0 # blame needs the full history
      - uses: bobaoxu2001/openclaw/aiblame@main
        with:
          pr-comment: true
```

### Keep a README card up to date

Refresh the card on every push to `main`:

```yaml
# .github/workflows/aiblame.yml
name: aiblame
on:
  push:
    branches: [main]
permissions:
  contents: write
jobs:
  aiblame:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0 # blame needs the full history
      - uses: bobaoxu2001/openclaw/aiblame@main
        id: aiblame
        with:
          card: .github/aiblame-card.svg
          badge: .github/aiblame-badge.svg
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add .github/aiblame-*.svg
          git diff --cached --quiet || git commit -m "Update aiblame card"
          git push
```

The action also writes a job summary, and exposes `steps.aiblame.outputs.ai-share` for the repo and `pr-ai-share` for the pull request (e.g. `41.3`).

### Enforce an AI-code policy

Some projects don't accept AI-generated code. Others cap it. aiblame can be a CI gate for the whole repo or for each pull request:

```yaml
      - uses: bobaoxu2001/openclaw/aiblame@main
        with:
          pr-max-ai: 0 # fail PRs that add any signed AI code
          # max-ai: 50 # or cap the share of the whole repo
```

## What counts as evidence

aiblame never guesses from coding style. A line is credited to an agent only when there is concrete evidence.

**1. Commit signatures.** These work on any clone of the repo. aiblame knows these agents:

| Agent | Signature |
|---|---|
| Claude Code | `Co-authored-by: Claude <noreply@anthropic.com>` trailer, "Generated with Claude Code" footer, `claude[bot]` |
| GitHub Copilot | Copilot coding agent commits, `Co-authored-by: Copilot` (accepted suggestions, Autofix) |
| Cursor | `Cursor Agent <cursoragent@cursor.com>` as author or co-author |
| OpenAI Codex | `Co-authored-by: Codex <noreply@openai.com>`, `chatgpt-codex-connector[bot]` |
| Aider | `(aider)` author suffix, `Co-authored-by: aider (<model>)`, legacy `aider:` prefix |
| Devin | `devin-ai-integration[bot]` |
| Google Jules | `google-labs-jules[bot]` |
| Gemini | `gemini-code-assist[bot]` suggestions, `gemini-cli[bot]` |
| Amp | `Co-authored-by: Amp <amp@ampcode.com>`, `Amp-Thread-ID:` trailer |
| OpenHands | `openhands <openhands@all-hands.dev>` |
| Factory Droid | `factory-droid[bot]` |
| opencode | `Co-authored-by: opencode`, "Generated with opencode" |
| Roo Code | `roomote[bot]`, `Co-authored-by: Roo Code` |
| Cline, Windsurf, Qwen Code, Warp, Crush, Kiro | their co-author trailers or bot accounts |
| Replit Agent | `Replit-Commit-Author: Agent` trailer |
| Lovable, v0, CodeRabbit, Sweep | their bot accounts |
| Other AI | generic trailers such as `Co-authored-by: GPT-5 <…>` or "Generated by AI" |

Non-AI automation (Dependabot, Renovate, `github-actions[bot]`, release bots…) is reported separately as **Bots**.
Run `npx aiblame agents` for the exact patterns.

Patterns match trailers and accounts, not names, so a colleague called Claude or Devin is never mistaken for an agent.
The test suite checks those cases.

**2. Local agent transcripts.** These only work on your machine. Coding agents log every file write and edit to disk.
aiblame reads the logs of Claude Code (`~/.claude/projects`), Codex (`~/.codex/sessions`), Gemini CLI, Qwen Code, opencode,
OpenClaw, Factory Droid, pi and Aider (`.aider.chat.history.md`). It indexes the lines those agents wrote into this repo.
When `git blame` pins such a line on a human commit that was made *after* the agent wrote it, the line goes back to the agent.
Transcripts are only read, never uploaded, and never copied into reports.

**Audit it.** Don't take our word for it:

```text
$ npx aiblame evidence openai/codex

  Signatures found in 11,404 commits

  ■ OpenAI Codex 351 commits
        338  Co-authored-by: Codex <noreply@openai.com>  e.g. 1013295
         11  Co-authored-by: Codex <199175422+chatgpt-codex-connector[bot]@users.noreply.github.com>  e.g. 855e275
  ■ Claude Code 10 commits
          5  Co-authored-by: Claude <noreply@anthropic.com>  e.g. b4a53ae
  …
```

## How it works

1. **List files** at `HEAD`, skipping binaries, lockfiles, vendored and generated code, and anything marked `linguist-generated` or `linguist-vendored`.
2. **Classify every commit** in one `git log` pass as an AI agent, a bot or a human.
3. **Blame every line** with `git blame -w`, so whitespace-only changes don't steal authorship. `.git-blame-ignore-revs` is honoured.
4. **Reclaim unsigned lines** from local transcripts, as described above.
5. **Roll up** by agent, file, directory, language and month.

On big repos, aiblame writes git's commit-graph cache with changed-path Bloom filters, which makes blame about 5x faster.
Above 4,000 files it blames a random sample and extrapolates, with a 95% margin of error on the headline number
(`~41.3% ±0.8%`). The sample is seeded by the commit hash, so the same commit always gives the same answer. Use `--full` to blame everything.

`--fast` skips blame and counts lines *added* per commit instead. Pair it with `--since "90 days ago"` to see how much of a repo's
*recent* work is AI-written.

## Accuracy and limitations

- **It's a lower bound.** AI code committed without a trailer looks human to git. That includes most local agent use with the trailer turned off, and all inline autocomplete.
  A repo can be heavily AI-assisted and still score low. If you want credit where it's due, keep your agent's co-author trailer on.
- **Signed commits count in full.** Every line of an AI-signed commit is credited to the agent, even lines a human tweaked before committing.
  That is the same convention Aider uses for its own stats. Later human edits do move lines back to the human.
- **Squash merges are fine.** GitHub keeps `Co-authored-by` trailers in squash commit messages.
- **Trailers are just text.** Anyone can add or strip them. aiblame measures what people disclose. It is not a forensic tool.
- **Shallow clones** blame every old line on the clone boundary. aiblame warns you. Use `fetch-depth: 0` in CI.

## Contributing

The most valuable contribution is a **new agent signature**. It takes three steps:

1. Add the pattern to [`src/agents.ts`](src/agents.ts). Match trailers, emails or bot accounts, never bare names.
2. Add a positive and a negative case to [`test/agents.test.mjs`](test/agents.test.mjs).
3. Run `npx aiblame evidence <some repo that uses the agent>` and check that every match is real.

```sh
npm install
npm test               # builds, then runs the unit and end-to-end tests
node dist/cli.js .     # try your build
```

The leaderboard above is reproducible with [`scripts/leaderboard.mjs`](scripts/leaderboard.mjs).

## Library

```js
import { analyze, renderCard } from "aiblame";

const report = await analyze({ path: "." });
console.log(report.totals.ai / report.totals.lines);
```

## License

MIT
