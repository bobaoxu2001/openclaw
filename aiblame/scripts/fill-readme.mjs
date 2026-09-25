#!/usr/bin/env node
// Replace the <!-- LEADERBOARD --> block in the READMEs with a table built from JSON reports.
//   node scripts/fill-readme.mjs <reports-dir>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2];
if (!dir) throw new Error("usage: fill-readme.mjs <reports-dir>");
const table = execFileSync(process.execPath, [join(root, "scripts/leaderboard.mjs"), dir, "--svg", join(root, "docs/leaderboard.svg"), "--top", "30"], { encoding: "utf8" });

const blocks = {
  "README.md": `<img src="docs/leaderboard.svg" width="760" alt="Bar chart of the share of current code written by AI agents in popular repositories">

<details>
<summary>Full table (with the code-only share)</summary>

"Code only" leaves out docs, config and data files (\`--code\`). \`~\` marks estimates from a random sample of files.

${table}
</details>`,
  "README.zh-CN.md": `<img src="docs/leaderboard.svg" width="760" alt="热门仓库中 AI 编写代码占比的条形图">

<details>
<summary>完整表格（含"仅代码"占比）</summary>

"Code only" 不计文档、配置和数据文件（\`--code\`）。\`~\` 表示基于随机抽样文件的估计值。

${table}
</details>`,
};
for (const [file, block] of Object.entries(blocks)) {
  const p = join(root, file);
  const s = readFileSync(p, "utf8");
  const re = /<!-- LEADERBOARD:START -->[\s\S]*<!-- LEADERBOARD:END -->/;
  if (!re.test(s)) throw new Error(`${file}: markers not found`);
  writeFileSync(p, s.replace(re, `<!-- LEADERBOARD:START -->\n${block}\n<!-- LEADERBOARD:END -->`));
}
console.log(table);
