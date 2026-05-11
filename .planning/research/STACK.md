# Technology Stack

**Project:** ui-to-hierarchyMCP
**Researched:** 2026-05-11 (v1.1 `--init` additions over v1.0 baseline)
**Overall confidence:** HIGH for all v1.0 picks (unchanged), HIGH for CLI arg parsing, HIGH for template embedding, MEDIUM for agent-file format specs (formats evolving; sourced from current official docs)

---

## TL;DR — Prescriptive Picks (full stack including v1.1 additions)

| Concern | Pick | Version | Confidence |
|---|---|---|---|
| MCP SDK | `@modelcontextprotocol/sdk` | `^1.29.0` | HIGH |
| MCP Transport | `StdioServerTransport` (from SDK) | — | HIGH |
| Tool input schema | `zod` v4 | `^4.1.4` | HIGH |
| AST parser | `@babel/parser` | `^7.29.2` | HIGH |
| AST traversal | `@babel/traverse` + `@babel/types` | `^7.29.0` | HIGH |
| tsconfig reader | `get-tsconfig` | `^4.14.0` | HIGH |
| File globbing | `tinyglobby` | `^0.2.16` | MEDIUM |
| Language | TypeScript | `^5.20.1` | HIGH |
| Module system | ESM (`"type": "module"`) | — | HIGH |
| Runtime target | Node.js `>=20` (LTS) | — | HIGH |
| Bundler | `tsup` (ESM only) | `^8.5.1` | HIGH |
| Test runner | `vitest` | `^4.3.6` | HIGH |
| Dev runner | `tsx` | `^4.21.0` | HIGH |
| **[v1.1] CLI arg parsing** | **`node:util` `parseArgs`** | **built-in (Node 20+)** | **HIGH** |
| **[v1.1] Markdown manipulation** | **Plain string regex (no library)** | **—** | **HIGH** |
| **[v1.1] Template embedding** | **TypeScript string constant inlined at build time via tsup `loader: { '.md': 'text' }`** | **—** | **HIGH** |

---

## v1.1 Stack Additions — `--init` Feature

### 1. CLI Argument Parsing

**Current state in `src/cli.ts`:** The file is 11 lines and contains zero argument parsing. It delegates immediately to `startServer()`, which wires `StdioServerTransport`. There is no `process.argv` inspection anywhere in the existing source tree.

**Recommendation: `node:util` `parseArgs` — zero new dependencies**

Node 20 ships `util.parseArgs` as a stable, non-experimental API (stabilized in v20.0.0, added in v18.3.0). It handles exactly what `--init` needs: a boolean flag and a single `--target <string>` option with a short alias. No npm install required.

```typescript
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    init: { type: "boolean", short: "i", default: false },
    target: { type: "string", short: "t", default: "claude" },
  },
  allowPositionals: false,
  strict: true,
});

// Comma-separated --target split done manually (one line):
const targets = (values.target as string).split(",").map(s => s.trim());
```

The `--target claude,codex,cursor,copilot` pattern requires a one-liner manual split after parse — `parseArgs` returns the raw string value and does not split on commas itself. This is trivially handled in userland and is not a reason to pull an external library.

**Bundle impact:** Zero bytes added to `dist/`. `node:util` is a built-in and tree-shakes to nothing in the tsup ESM output.

**Why not `mri`:** `mri@1.2.0` (13.3 kB install, last published Sep 2021, no commits since) lacks native array/CSV support (`options.array` is explicitly missing per its own docs). It would still require the manual split, adding a new runtime dependency for zero functional gain over the built-in. The package is effectively unmaintained.

**Why not `cac` / `commander` / `yargs`:** These solve multi-subcommand CLI DX problems. We have exactly two CLI states: `--init` (one mode) and bare invocation (MCP server mode). A full CLI framework is out of proportion. `commander` at minimum adds ~60 kB unpacked; `yargs` adds ~700 kB.

**Integration:** Works as-is with ESM + Node 20 + tsup. No shim, no external entry needed.

**Source:** [Node.js v20 docs — `util.parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig)

---

### 2. Markdown Manipulation (Idempotent Block Replacement)

**Recommendation: Plain string operations — no library**

The `--init` feature's idempotency requirement is a marker-delimited block replacement:

```
<!-- ui-hierarchy-mcp:start -->
...injected content...
<!-- ui-hierarchy-mcp:end -->
```

The operation is:
1. Read existing file (or treat as empty string if absent)
2. If markers present: replace the content between them (including markers) with new block
3. If markers absent: append the new block to end of file
4. Write file

This is two string operations — one `String.includes()` check and one `String.replace()` with a regex anchor. A markdown AST library (`remark`, `mdast-util-from-markdown`) is designed for parsing and transforming markdown document semantics (headings, lists, inline formatting). It does not simplify the marker-replacement task; it complicates it by requiring AST traversal to locate raw HTML comment nodes, which `remark` treats as `html` leaf nodes in the tree. The extra indirection adds ~800 kB unpacked (`remark` + `unified` + `vfile` + plugins), a completely unacceptable install footprint for an `npx`-distributed CLI.

**Implementation pattern:**

```typescript
const MARKER_START = "<!-- ui-hierarchy-mcp:start -->";
const MARKER_END   = "<!-- ui-hierarchy-mcp:end -->";
const RE_BLOCK     = /<!--\s*ui-hierarchy-mcp:start\s*-->[\s\S]*?<!--\s*ui-hierarchy-mcp:end\s*-->/;

export function upsertBlock(existing: string, newContent: string): string {
  const block = `${MARKER_START}\n${newContent}\n${MARKER_END}`;
  if (RE_BLOCK.test(existing)) {
    return existing.replace(RE_BLOCK, block);
  }
  return existing.trimEnd() + "\n\n" + block + "\n";
}
```

This is 8 lines, has no dependencies, and is fully unit-testable in vitest with inline snapshots.

**Bundle impact:** Zero bytes.

---

### 3. Template Authoring — Injected Guide Content

**Recommendation: Embed via tsup `loader: { '.md': 'text' }` — single source of truth**

The `--init` guide content is a multi-line markdown string that will be injected into agent files. There are three candidate approaches:

| Approach | Pros | Cons |
|---|---|---|
| TypeScript string constant in `src/init/templates.ts` | Zero config, zero risk | Hard to read/edit; no syntax highlighting; markdown embedded in TS string escaping headaches |
| `.md` file copied to `dist/` and `readFileSync` at runtime | Easy to edit, natural markdown | Requires `files` update + careful relative-path resolution (`import.meta.url`), can fail if `dist/` layout shifts |
| `.md` file inlined at build time via `tsup` `loader: { '.md': 'text' }` | Natural authoring, zero runtime I/O, no path resolution, single bundled artifact | Requires one tsup config line |

**Recommended: tsup `loader` (option 3).**

esbuild (which tsup wraps) has a first-class `text` loader that inlines file contents as a string export at build time. Configuring it for `.md` takes one line in `tsup.config.ts`:

```typescript
export default defineConfig({
  // ... existing config ...
  loader: { ".md": "text" },
});
```

Then in source:

```typescript
// TypeScript import — add a .d.ts shim for the type:
// src/global.d.ts: declare module "*.md" { const content: string; export default content; }
import claudeTemplate from "./templates/claude.md";
import agentsTemplate from "./templates/agents.md";
```

The template files live in `src/init/templates/` as natural `.md` files with full syntax highlighting and no string escaping. At `tsup` build time they are inlined as string constants in `dist/cli.js`. Runtime reads nothing from disk.

**Why not `readFileSync` at runtime:** Path resolution from `import.meta.url` in an `npx`-cached package is fragile when `npm pack` layout differs from `node_modules/.cache/` layout. Runtime I/O also introduces an error path that inline embedding avoids entirely.

**Why not TypeScript string constant:** Large markdown blocks embedded in TS strings are an editing and review nightmare. Multi-line template literals with backtick escaping obscure the actual guide content.

**Bundle impact:** Adds the size of the template files themselves — expected to be 2–5 KB of markdown text per target. Negligible for a CLI whose existing `dist/cli.js` is already tens of KB.

**TypeScript support:** Add one declaration to the existing `src/global.d.ts`:
```typescript
declare module "*.md" {
  const content: string;
  export default content;
}
```

**Source:** [esbuild content types — text loader](https://esbuild.github.io/content-types/)

---

### 4. Target File Formats

#### 4a. `CLAUDE.md` (Anthropic Claude Code)

**Format:** Plain Markdown. No frontmatter required. Claude Code reads `CLAUDE.md` in the project root and up to three parent directories, merging all into the context window. No size limit is formally documented, but practical guidance recommends keeping it under 8 KB to avoid context pollution.

**Idempotency target path:** `<cwd>/CLAUDE.md`

**What to write:** A `## ui-hierarchy-mcp` section explaining the MCP server, its four tools, when to invoke them, and the `npx` invocation string. Wrap the entire section in the marker tags.

**Confidence:** HIGH — verified from `CLAUDE.md` in this very repository and Claude Code docs behavior.

#### 4b. `AGENTS.md` (OpenAI Codex)

**Format:** Plain Markdown. No frontmatter, no schema. Codex reads `AGENTS.md` at project root, concatenating with any parent-directory `AGENTS.md` files in order from root down. The file is also supported by Cursor, Gemini CLI, Windsurf, and GitHub Copilot as of 2026 (adopted by the Agentic AI Foundation / Linux Foundation as an open standard). Size limit: 32 KiB default (`project_doc_max_bytes` in `~/.codex/config.toml`).

**Idempotency target path:** `<cwd>/AGENTS.md`

**What to write:** Same content shape as `CLAUDE.md` — a headed section wrapped in marker tags.

**Source:** [OpenAI Developers — Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)

**Confidence:** HIGH — official OpenAI Codex docs, current as of 2026.

#### 4c. `.cursor/rules/*.mdc` (Cursor)

**Format:** `.mdc` files (not `.md`) placed flat in `.cursor/rules/`. The folder-based `RULE.md` format documented in Cursor 2.2 is broken in practice — Cursor's own "Add Rule" button still generates `.mdc` files, and the flat format is what actually works across all current Cursor versions (verified by Cursor community forum reports, versions 2.2.14–2.4.0-pre).

**Frontmatter fields:**

```yaml
---
description: "Short summary of what this rule covers. Used by agent to decide whether to include the rule."
alwaysApply: false
globs: []
---
```

- `description` (string): used by the agent to decide relevance when `alwaysApply: false`
- `alwaysApply` (boolean, default `false`): if `true`, injected into every chat session
- `globs` (string | string[], optional): file patterns for file-scoped activation

**Activation modes:** `alwaysApply: true` = always injected; `alwaysApply: false` + `description` only = agent-chosen; `globs` specified = file-scoped; no frontmatter = manual `@rule-name` invocation only.

**Size guideline:** Rules "work in Agent Chat only" (not Cursor Tab / Inline Edit). Keep under 500 lines per file; total "always apply" rules under 2,000 tokens combined.

**Idempotency target path:** `<cwd>/.cursor/rules/ui-hierarchy-mcp.mdc`

**Strategy:** Write a single `ui-hierarchy-mcp.mdc` file. Use `alwaysApply: true` so the rule is always available (the guide is short, ~300 words). Marker-tag idempotency wraps the body below the frontmatter. On re-run: replace the body between markers; leave the frontmatter intact.

**Important:** The `.cursor/` directory may not exist in the target project. `--init` must `mkdir -p .cursor/rules/` before writing.

**Source:** [Cursor Forum — Project Rules format discussion](https://forum.cursor.com/t/project-rules-documented-rule-md-folder-format-not-working-only-undocumented-mdc-format-works/145907); [Cursor Rules Best Practices (Morph, 2026)](https://www.morphllm.com/cursor-rules-best-practices)

**Confidence:** MEDIUM — Cursor has not published a stable public MDC spec. The `.mdc` flat-file format is empirically what works; frontmatter field names are consistent across all community sources and Cursor's own tooling, but could change in a future Cursor release without notice.

#### 4d. `.github/copilot-instructions.md` (GitHub Copilot)

**Format:** Plain Markdown. No frontmatter required for the repository-level file at `.github/copilot-instructions.md`. Copilot applies this file to all chat requests within the workspace automatically (VS Code, github.com, and JetBrains Copilot clients).

**Advanced per-file instructions** (separate feature, out of scope for `--init`): Individual `*.instructions.md` files in `.github/instructions/` can use YAML frontmatter with `description` and `applyTo` glob fields for file-scoped activation. This is not needed for `--init`'s use case — a single repository-level guide is correct.

**Size limit:** Informal "2 pages" guideline. No hard byte limit documented.

**Idempotency target path:** `<cwd>/.github/copilot-instructions.md`

**Strategy:** Same marker-tag idempotency as other targets. The `.github/` directory likely already exists (most repos have it), but `--init` must handle the mkdir case.

**Source:** [GitHub Docs — Adding repository custom instructions for GitHub Copilot](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot)

**Confidence:** HIGH — official GitHub Docs, verified format.

---

## No New Runtime Dependencies Required

| Question | Answer |
|---|---|
| New packages needed? | None — zero new `dependencies` entries |
| New devDependencies needed? | None — `tsup` `loader` config is already available |
| `tsup.config.ts` changes? | Add one line: `loader: { ".md": "text" }` |
| `src/global.d.ts` changes? | Add one `declare module "*.md"` declaration |
| New directories in source? | `src/init/` module, `src/init/templates/` for `.md` files |
| New directories created at runtime? | `.cursor/rules/` and `.github/` in target project (created by `--init` if absent) |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|---|---|---|
| `mri` / `minimist` / `yargs` / `commander` / `cac` | Unnecessary dep for two CLI states; `mri` unmaintained since 2021; others are disproportionate | `node:util` `parseArgs` (built-in, stable in Node 20) |
| `remark` / `unified` / `mdast-util-from-markdown` | ~800 kB unpacked for what is two string operations; HTML comment nodes in remark AST are awkward to locate | Plain regex replace (8 lines) |
| `fs-extra` | Already excluded from v1.0 stack; `node:fs/promises` covers mkdir, readFile, writeFile | `node:fs/promises` (`mkdir({ recursive: true })`, `readFile`, `writeFile`) |
| Runtime `readFileSync` for templates | Path fragility in `npx` cache layouts | tsup `loader: { '.md': 'text' }` build-time inlining |
| Copying `.md` files to `dist/` via `tsup.config.ts` `publicDir` | Requires runtime path resolution from `import.meta.url`, adds I/O error paths | Build-time inlining via text loader |
| HTTP/SSE transports | Out of scope per PROJECT.md | `StdioServerTransport` only |

---

## Updated tsup.config.ts Shape

The only change to the bundler config needed for v1.1:

```typescript
export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  shims: false,
  dts: false,
  banner: { js: "#!/usr/bin/env node" },
  // NEW: inline .md template files as string constants at build time
  loader: { ".md": "text" },
  external: [
    "@modelcontextprotocol/sdk",
    "@babel/parser",
    "@babel/traverse",
    "@babel/types",
    "zod",
    "get-tsconfig",
    "tinyglobby",
  ],
  define: {
    __TOOL_VERSION__: JSON.stringify(pkg.version),
  },
});
```

---

## Sources

- [Node.js v20 `util.parseArgs` docs](https://nodejs.org/api/util.html#utilparseargsconfig) — HIGH: built-in, stable since Node 20.0.0
- [esbuild content types — text loader](https://esbuild.github.io/content-types/) — HIGH: official esbuild docs; `loader: { '.md': 'text' }` in tsup config is confirmed valid
- [OpenAI Developers — Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md) — HIGH: official Codex docs; plain markdown, 32 KiB default limit
- [GitHub Docs — Adding repository custom instructions for GitHub Copilot](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot) — HIGH: official GitHub Docs; `.github/copilot-instructions.md`, plain markdown, no frontmatter required
- [Cursor Rules Best Practices (Morph, 2026)](https://www.morphllm.com/cursor-rules-best-practices) — MEDIUM: community guide; frontmatter fields `description`, `alwaysApply`, `globs` confirmed
- [Cursor Forum — Project Rules MDC format bug report](https://forum.cursor.com/t/project-rules-documented-rule-md-folder-format-not-working-only-undocumented-mdc-format-works/145907) — MEDIUM: empirical confirmation that flat `.mdc` files work; folder-based `RULE.md` format broken
- [mri GitHub](https://github.com/lukeed/mri) — HIGH: last release Sep 2021 (v1.2.0), no `options.array`, unmaintained
- [AGENTS.md open standard](https://agents.md/) — MEDIUM: adopted by Agentic AI Foundation / Linux Foundation, multi-tool support confirmed
