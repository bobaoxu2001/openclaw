/** Which files count as "code we should attribute", and what language they are. */

const DEFAULT_EXCLUDES: RegExp[] = [
  // dependencies and vendored code
  /(^|\/)(node_modules|vendor|vendored|third[-_]party|bower_components|\.yarn|\.pnpm-store)\//i,
  // lockfiles
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|deno\.lock|Cargo\.lock|Gemfile\.lock|poetry\.lock|Pipfile\.lock|uv\.lock|pdm\.lock|composer\.lock|go\.sum|mix\.lock|pubspec\.lock|Podfile\.lock|flake\.lock|packages\.lock\.json|gradle\.lockfile)$/,
  // minified, source maps, snapshots, generated code
  /\.(min\.(js|css|mjs)|map|snap)$/i,
  /(\.pb\.go|_pb2(_grpc)?\.py|\.pb\.(h|cc)|\.g\.dart|\.generated\.\w+|\.gen\.\w+|_generated\.\w+)$/i,
  // data-ish text that is almost never hand-written
  /\.(svg|csv|tsv|jsonl|ndjson|lock|sum|ipynb)$/i,
];

export interface FileFilter {
  (path: string): boolean;
}

/** Prose, config and data: skipped by `--code`. */
const NOT_CODE = new Set(["Markdown", "reStructuredText", "Text", "JSON", "YAML", "TOML", "XML", "Other"]);

export function isCode(path: string): boolean {
  return !NOT_CODE.has(languageOf(path));
}

export interface FilterOptions {
  include?: string[];
  exclude?: string[];
  noDefaultExcludes?: boolean;
  /** Only programming languages: no docs, config or data files. */
  codeOnly?: boolean;
}

/** Build a predicate that returns true for files that should be analyzed. */
export function makeFilter(opts: FilterOptions): FileFilter {
  const include = (opts.include ?? []).map(globToRegExp);
  const exclude = (opts.exclude ?? []).map(globToRegExp);
  const defaults = opts.noDefaultExcludes ? [] : DEFAULT_EXCLUDES;
  return (path) => {
    if (include.length && !include.some((re) => re.test(path))) return false;
    if (exclude.some((re) => re.test(path))) return false;
    if (opts.codeOnly && !isCode(path)) return false;
    return !defaults.some((re) => re.test(path));
  };
}

/**
 * Minimal gitignore-flavoured glob: `**` spans directories, `*` and `?` stay
 * within one path segment. A pattern without a slash matches at any depth, and
 * a pattern naming a directory matches everything below it.
 */
export function globToRegExp(glob: string): RegExp {
  let g = glob.trim().replace(/^\.\//, "");
  const anchored = g.startsWith("/") || g.replace(/\/$/, "").includes("/");
  g = g.replace(/^\//, "").replace(/\/$/, "/**");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i]!;
    if (ch === "*") {
      if (g[i + 1] === "*") {
        const slash = g[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${anchored ? "^" : "(^|/)"}${re}(/.*)?$`);
}

const LANGS: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", pyi: "Python", rs: "Rust", go: "Go", java: "Java", kt: "Kotlin", kts: "Kotlin",
  swift: "Swift", m: "Objective-C", mm: "Objective-C", c: "C", h: "C/C++ header", cc: "C++", cpp: "C++",
  cxx: "C++", hpp: "C++", cs: "C#", fs: "F#", rb: "Ruby", php: "PHP", scala: "Scala", dart: "Dart",
  lua: "Lua", zig: "Zig", ex: "Elixir", exs: "Elixir", erl: "Erlang", hs: "Haskell", ml: "OCaml",
  clj: "Clojure", r: "R", jl: "Julia", sol: "Solidity", vue: "Vue", svelte: "Svelte", astro: "Astro",
  html: "HTML", css: "CSS", scss: "SCSS", sass: "SCSS", less: "CSS", sql: "SQL",
  sh: "Shell", bash: "Shell", zsh: "Shell", fish: "Shell", ps1: "PowerShell",
  md: "Markdown", mdx: "Markdown", rst: "reStructuredText", txt: "Text",
  json: "JSON", jsonc: "JSON", json5: "JSON", yml: "YAML", yaml: "YAML", toml: "TOML", xml: "XML",
  proto: "Protobuf", graphql: "GraphQL", gql: "GraphQL", tf: "Terraform", nix: "Nix",
};

const SPECIAL: Record<string, string> = {
  Dockerfile: "Dockerfile", Makefile: "Makefile", CMakeLists: "CMake", Justfile: "Just", Gemfile: "Ruby",
};

export function languageOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  if (SPECIAL[stem] && (dot < 0 || stem === "CMakeLists")) return SPECIAL[stem]!;
  if (dot <= 0) return "Other";
  return LANGS[base.slice(dot + 1).toLowerCase()] ?? "Other";
}
