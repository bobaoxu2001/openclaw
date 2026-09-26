import { spawn } from "node:child_process";

export class CommandError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stderr: string,
  ) {
    super(message);
  }
}

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_PAGER: "cat",
};

export interface RunOptions {
  cwd: string;
  input?: string;
  /** Called with every stdout chunk instead of buffering the whole output. */
  onData?: (chunk: string) => void;
}

/** Run a git command and resolve with its stdout. Rejects on non-zero exit. */
export function git(args: string[], opts: RunOptions): Promise<string> {
  return run("git", ["-c", "core.quotepath=off", ...args], opts);
}

export function run(cmd: string, args: string[], opts: RunOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: GIT_ENV,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: string[] = [];
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (opts.onData) opts.onData(chunk);
      else out.push(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      if (err.length < 64 * 1024) err += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.join(""));
      else {
        const msg = err.trim().split("\n").slice(-3).join("\n") || `${cmd} exited with ${code}`;
        reject(new CommandError(msg, code, err));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(opts.input ?? "");
  });
}

/** Map over items with at most `limit` promises in flight. Preserves order. */
export async function pool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
