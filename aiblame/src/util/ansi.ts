/** Tiny ANSI styling helper: truecolor when available, xterm-256 otherwise. */

export interface Painter {
  enabled: boolean;
  fg(hex: string, s: string): string;
  bg(hex: string, s: string): string;
  bold(s: string): string;
  dim(s: string): string;
  italic(s: string): string;
}

export function createPainter(opts: { color?: boolean; stream?: NodeJS.WriteStream } = {}): Painter {
  const stream = opts.stream ?? process.stdout;
  const env = process.env;
  const enabled =
    opts.color ?? (!("NO_COLOR" in env) && env.TERM !== "dumb" && (Boolean(stream.isTTY) || "FORCE_COLOR" in env));
  const truecolor = /truecolor|24bit/i.test(env.COLORTERM ?? "") || env.TERM_PROGRAM === "iTerm.app" || env.TERM_PROGRAM === "vscode";
  const code = (hex: string, layer: 38 | 48) => {
    const [r, g, b] = rgb(hex);
    return truecolor ? `\x1b[${layer};2;${r};${g};${b}m` : `\x1b[${layer};5;${to256(r, g, b)}m`;
  };
  const wrap = (open: string, close: string) => (s: string) => (enabled ? `${open}${s}${close}` : s);
  return {
    enabled,
    fg: (hex, s) => (enabled ? `${code(hex, 38)}${s}\x1b[39m` : s),
    bg: (hex, s) => (enabled ? `${code(hex, 48)}${s}\x1b[49m` : s),
    bold: wrap("\x1b[1m", "\x1b[22m"),
    dim: wrap("\x1b[2m", "\x1b[22m"),
    italic: wrap("\x1b[3m", "\x1b[23m"),
  };
}

export function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function to256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const q = (v: number) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

/** Display width, counting wide (CJK / emoji) characters as two cells. */
export function width(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0)!;
    w += cp >= 0x1100 && (cp <= 0x115f || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0x1f300 && cp <= 0x1faff)) ? 2 : 1;
  }
  return w;
}

export function padEnd(s: string, n: number): string {
  return s + " ".repeat(Math.max(0, n - width(s)));
}

export function padStart(s: string, n: number): string {
  return " ".repeat(Math.max(0, n - width(s))) + s;
}

/** Truncate from the left, keeping the end of a path visible. */
export function truncLeft(s: string, n: number): string {
  if (width(s) <= n) return s;
  return "…" + s.slice(s.length - (n - 1));
}
