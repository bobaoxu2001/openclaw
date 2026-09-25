<div align="center">

# aiblame

**AI 时代的 `git blame`。**

你的代码里，到底有多少是 Claude、Copilot、Cursor、Codex、Devin 这些 AI 写的？<br>
一条命令，任意仓库，精确到每一行，不靠猜。

[English](README.md) · 简体中文

<img src="docs/self-badge.svg" alt="aiblame 自己的 AI 代码占比徽章">

```sh
npx aiblame
```

<img src="docs/terminal.png" width="720" alt="在 All-Hands-AI/OpenHands 上运行 aiblame：68.9% 的现存代码由 AI 编写">

</div>

---

AI 智能体已经在写世界上相当一部分代码，但没人说得清到底有多少。
按提交数算不准（一次 AI 提交可能加了 5000 行），"AI 代码检测器"又只是在根据风格猜。

**aiblame 不猜，只看证据。** 编程智能体会留下"指纹"：`Co-authored-by` 提交尾注、机器人账号、
"Generated with…" 页脚，以及你本机上的会话日志。aiblame 收集这些指纹，再对仓库里**每一行现存代码**跑 `git blame`，
算出*今天*还活着的代码是谁写的。

- **行级别，不是提交级别**：人类重写过的 AI 代码会重新算作人类的；已删除的代码不计入。
- **证据可审计**：`aiblame evidence` 列出每一条匹配到的签名和示例提交。
- **能找回没署名的 AI 代码**（仅限你的机器）：用 Claude Code / Codex 写完却没带尾注就提交了？aiblame 会拿这些行去比对智能体的本地会话记录。
- **任何仓库，开箱即用**：本地路径、git URL 或 `owner/repo` 都行，不需要事先在仓库里装任何东西。
- **大仓库也快**：10 万次提交、4.8 万个文件，大约 2 分钟（随机抽样，误差 ±0.3%）。
- **零依赖**：`npx` 即用，全部本地运行，没有任何遥测。

## 排行榜：热门仓库里有多少代码是 AI 写的？

<!-- LEADERBOARD:START -->
<!-- LEADERBOARD:END -->

想把你的仓库也晒出来？运行 `npx aiblame --card`。

## 用法

```sh
npx aiblame                        # 当前仓库
npx aiblame ~/code/my-app          # 其他本地仓库
npx aiblame facebook/react         # 任意 GitHub 仓库（克隆到临时目录）
npx aiblame --code                 # 只统计编程语言，跳过文档、配置和数据文件
npx aiblame blame src/index.ts     # 逐行查看：每一行是谁写的？
npx aiblame evidence               # 审计：匹配到了哪些签名、各多少次
npx aiblame --html                 # 生成可分享的单文件 HTML 报告
```

全局安装（`npm i -g aiblame`）后也可以当 git 子命令用：`git aiblame`。

### `aiblame blame <文件>`

和 `git blame` 一样，但左侧会标出每一行是哪个智能体写的。

<img src="docs/blame.png" width="720" alt="aiblame blame：按 OpenHands、Cursor、Claude Code 和人类着色的代码行">

### `aiblame --html`

一个可以直接打开、分享或附在 PR 里的 HTML 文件，包括按月的时间线、按智能体着色的整个代码库树图，以及文件、目录和语言排行。

<img src="docs/report.png" width="720" alt="aiblame HTML 报告">

## 放进你的 README

```sh
npx aiblame --card --badge --quiet
```

| `--card` | `--badge` |
|---|---|
| <img src="docs/example-card.svg" width="400" alt="aiblame 卡片示例"> | <img src="docs/example-badge.svg" alt="aiblame 徽章示例"> |

想让它一直保持最新？用 GitHub Action（见[英文文档](README.md#github-action)）。
Action 还支持 `max-ai` 参数：AI 代码占比超过阈值就让 CI 失败，适合禁止或限制 AI 代码的项目。

## 什么算"证据"

aiblame 从不根据代码风格猜测。只有存在确凿证据时，某一行才会记到智能体名下。

1. **提交签名**（任何克隆都适用）：支持 25+ 个智能体，包括 Claude Code、GitHub Copilot、Cursor、OpenAI Codex、Aider、Devin、Google Jules、Gemini、Amp、OpenHands、Factory Droid、opencode、Roo Code、Cline、Windsurf、Qwen Code、Warp、Crush、Kiro、Replit Agent、Lovable、v0、CodeRabbit 等。
   匹配的是尾注和账号，不是名字，所以叫 Claude 或 Devin 的同事绝不会被误判成 AI。测试会覆盖这些情况。
   Dependabot、Renovate、`github-actions[bot]` 等非 AI 自动化会单独归为 **Bots**。
2. **本地会话记录**（仅在你的机器上）：读取 Claude Code、Codex、Gemini CLI、Qwen Code、opencode、OpenClaw、Factory Droid、pi 和 Aider 的日志，
   找出这些智能体写进当前仓库的代码行。只有智能体写入的时间*早于*提交时间，才会把这一行从人类名下改记给智能体。日志只读，不上传，也不会写进报告。

**自己审计**：`npx aiblame evidence openai/codex`

## 准确性与局限

- **这是下限**：没带签名提交的 AI 代码，在 git 看来就是人写的，包括关掉尾注的本地智能体和所有行内补全。
  一个仓库可能大量使用 AI，分数却很低。想让 AI 的贡献被看见，就别关掉智能体的 co-author 尾注。
- **带签名的提交整体计入**：带 AI 签名的提交里每一行都算 AI 写的（Aider 统计自己时也用同样的约定）；之后人类再改，就会重新算人类的。
- **Squash 合并没问题**：GitHub 会在 squash 提交信息里保留 `Co-authored-by`。
- **尾注只是文本**：任何人都能加或删。aiblame 衡量的是"公开披露"的 AI 贡献，不是取证工具。

## 参与贡献

最有价值的贡献是**新增一个智能体签名**：在 [`src/agents.ts`](src/agents.ts) 里加规则（匹配尾注、邮箱或机器人账号，绝不要只匹配名字），
在 [`test/agents.test.mjs`](test/agents.test.mjs) 里加正反例，再用 `npx aiblame evidence <使用该智能体的仓库>` 确认每条匹配都是真的。

```sh
npm install
npm test
node dist/cli.js .
```

## 许可证

MIT
