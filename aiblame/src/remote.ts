import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "./util/proc.js";

/** Is `target` something we should clone rather than open? */
export function isRemoteTarget(target: string): boolean {
  if (/^(https?|ssh|git):\/\//.test(target) || /^[\w.-]+@[\w.-]+:/.test(target)) return true;
  return /^[\w.-]+\/[\w.-]+$/.test(target) && !existsSync(target);
}

export function remoteUrl(target: string): string {
  return /^[\w.-]+\/[\w.-]+$/.test(target) && !target.includes(":") ? `https://github.com/${target}.git` : target;
}

export function displayName(target: string): string {
  const m = /([^/:]+\/[^/]+?)(\.git)?\/?$/.exec(target);
  return m ? m[1]! : target;
}

export interface Clone {
  path: string;
  cleanup(): void;
}

/**
 * Bare-clone a remote repository into a temp dir. Blame needs full history;
 * `shallowSince` trims it for history-only analyses.
 */
export async function cloneRemote(target: string, opts: { shallowSince?: string } = {}): Promise<Clone> {
  const dir = mkdtempSync(join(tmpdir(), "aiblame-"));
  const path = join(dir, "repo.git");
  const args = ["clone", "--bare", "--quiet", "--no-tags"];
  if (opts.shallowSince) args.push(`--shallow-since=${opts.shallowSince}`);
  args.push(remoteUrl(target), path);
  try {
    await git(args, { cwd: dir });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
