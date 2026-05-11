# PITFALLS — ui-to-hierarchyMCP

**Domain:** MCP server + Babel AST + Next.js App Router static analysis
**Researched:** 2026-04-20 (v1.0); extended 2026-05-11 (v1.1 `--init` + polish)
**Confidence:** HIGH (verified against official MCP/Next.js docs + community issue trackers)

---

<!-- ============================================================ -->
<!-- PART A — v1.0 pitfalls (archived, shipped, not re-litigated) -->
<!-- ============================================================ -->

## Category 1 — MCP Server Development (stdio / lifecycle / schema)

### 1.1 stdout corruption from `console.log` or library banners [CRITICAL]

- **Failure:** Any stray `console.log`, dependency banner, or deprecation warning corrupts the JSON-RPC stream. Client reports `-32000 connection closed`.
- **Prevention:** ESLint `no-console` on server + imports. All diagnostics via `process.stderr` or MCP `sendLoggingMessage`. Smoke test parses every stdout line as JSON. `dotenv.config({ quiet: true })`.
- **Warning signs:** Client disconnects immediately; manual `node server.js` looks fine.
- **Phase:** Phase 1 (MCP skeleton) — bake in from day 1.

### 1.2 stdin lifecycle / Windows SIGINT quirks

- **Failure:** Server exits early or leaks after client disconnect; Windows SIGINT doesn't fire consistently.
- **Prevention:** Use official `StdioServerTransport`. Register `SIGINT`, `SIGTERM`, `stdin` `end` handlers that call `server.close()`. Test on Windows.
- **Phase:** Phase 1.

### 1.3 Tool schemas too loose → agents pass garbage args

- **Failure:** Agent calls `focus_on("the top nav")` because schema doesn't guide it.
- **Prevention:** `zod` + `.describe()` on every field. Tool descriptions: 3-4 sentences, state when to call, what it returns, an example. Use `z.enum(...)` for fixed choices. Return structured errors with valid-shape guidance, not exceptions.
- **Phase:** Phase 2 (tool surface) — first tool sets the pattern.

### 1.4 Throwing exceptions instead of returning MCP errors

- **Failure:** Unhandled throws crash stdio server or return cryptic `-32603`.
- **Prevention:** Wrap every tool handler in try/catch; return `{ content: [...], isError: true }`. Top-level `uncaughtException` + `unhandledRejection` handlers log to stderr. Parse failure for user's file is expected data, not exception.
- **Phase:** Phase 2.

---

## Category 2 — Babel AST Traversal

### 2.1 Missing parser plugins → silent TSX parse failure

- **Failure:** Decorators / `using` / JSX-in-.ts / import assertions cause parse throw; whole subtree vanishes silently.
- **Prevention:** `parse(..., { errorRecovery: true })`. Broad plugin list: `jsx`, `typescript`, `decorators-legacy`, `classProperties`, `classPrivateProperties`, `classPrivateMethods`, `dynamicImport`, `topLevelAwait`, `importAssertions`, `explicitResourceManagement`. On parse failure, emit a `parseError` node — don't skip silently. Fixture suite of "cursed but valid" TSX.
- **Phase:** Phase 3 (parser core); enforced by Phase 5 fixtures.

### 2.2 `React.createElement` / `cloneElement` invisibility

- **Failure:** Libraries using `createElement` (Radix, compiled output) render invisibly.
- **Prevention:** Handle `CallExpression` where callee resolves to `React.createElement`, `createElement`, `_jsx`/`_jsxs`. Treat `cloneElement` as prop-override. Or document "JSX only" as known v1 gap.
- **Phase:** Phase 3 (low priority — can ship v1 documented).

### 2.3 Namespaced JSX (`<Foo.Bar/>`) — partial in prototype

- **Failure:** `<Dialog.Content>` via `import * as Dialog` doesn't resolve through barrel re-exports.
- **Prevention:** For namespace imports, resolve file → look up named export. Library imports (node_modules) → treat as framework node labeled with module name. Support deep nesting `<A.B.C>`.
- **Phase:** Phase 3 — audit prototype's `resolveLocalComponentKey`.

### 2.4 Conditional render truncation (`&&`, `||`, ternary, `??`)

- **Failure:** Short-circuits with `||`/`??` treated as siblings not alternates; `A && B && C` chains collapse; `!!x && <Foo/>` misses `UnaryExpression`.
- **Prevention:** Recursively unwrap `LogicalExpression` with `&&` (guard), `||`/`??` (fallback). Nested ternaries produce nested branch tree. Descend through `UnaryExpression` `!`/`!!`.
- **Phase:** Phase 3.

### 2.5 Array `.map` render — key/item binding confusion

- **Failure:** `items.map(renderItem)` misses JSX entirely; prop values unresolvable.
- **Prevention:** When `x.map(...)`, mark child as "list" kind. If callback is Identifier, try to resolve to local function binding and recurse. Document cross-file callback resolution as limitation if deferred.
- **Phase:** Phase 3.

### 2.6 HOC / `forwardRef` / `memo` unwrapping is shallow

- **Failure:** `memo(forwardRef(observer(X)))` loses wrapper chain; class components skipped entirely.
- **Prevention:** Detect wrapper callees by name (`memo`, `forwardRef`, `observer`, `with*`, `*HOC`) and annotate `wrappers: [...]`. Add `ClassDeclaration` visitor for class components extending `Component`/`PureComponent`. For `forwardRef((props, ref) => ...)`, treat arrow as component function.
- **Phase:** Phase 3 (class + forwardRef); Phase 4 (wrapper annotation).

### 2.7 Fragment handling gaps

- **Failure:** `import { Fragment as F } from 'react'` + `<F>` not detected; `React.Fragment` in createElement missed.
- **Prevention:** Resolve import of any tagName; if it maps to React's `Fragment` export, treat as fragment regardless of local alias.
- **Phase:** Phase 3.

---

## Category 3 — Next.js App Router specifics

### 3.1 Layout chain reconstruction is directory-based, not import-based [CRITICAL]

- **Failure:** `page.tsx` doesn't import its `layout.tsx`. Following imports alone produces a tree with no layouts.
- **Prevention:** Build a **route resolver** that walks `app/` upward from route, collecting `layout.tsx` at each level. Output: `[RootLayout] → [DashboardLayout] → [SettingsLayout] → [SettingsPage]`. Handle `template.tsx` (remounts on nav) separately. `get_full_hierarchy(route)` input is a route path, not a component name.
- **Phase:** Phase 3 (Next.js parser) — THE core abstraction.

### 3.2 Route groups `(marketing)` and parallel routes `@modal`

- **Failure:** `(marketing)/about/page.tsx` maps to `/about` but parser may ignore the group's `layout.tsx`; `@modal` treated as a phantom page.
- **Prevention:** Build a **route matcher**, not path joiner. Route groups `(name)` contribute layouts but don't count as URL segments. Parallel routes `@name` emit as labeled slots on parent (`{slots: {children: [...], modal: [...]}}`). Intercepting routes `(.)`, `(..)`, `(...)`, `(..)(..)` — segment-counting (tricky). Exclude private folders `_name`.
- **Phase:** Phase 3 — dedicate sub-phase to routing conventions.

### 3.3 `"use client"` boundary not propagated

- **Failure:** Agent suggests `useState` in a server component; can't diagnose hydration errors.
- **Prevention:** Detect `"use client"` / `"use server"` as first non-comment statement. Propagate in output: `runtime: "server" | "client"`. Simplification note: server components passed as `children` prop into a client component remain server-rendered — document as known v1 limitation if full analysis too hard.
- **Phase:** Phase 3 (mark boundary); Phase 4 (prop-children refinement).

### 3.4 Conflating `page.tsx` default export with named exports

- **Failure:** `generateMetadata` / `metadata` / `dynamic` / `revalidate` pollute tree as phantom components.
- **Prevention:** For App Router special files (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`, `default.tsx`, `route.ts`), treat **only default export** as rendered component. Named exports → metadata sidebar. `route.ts` is API, not UI. `loading.tsx`/`error.tsx`/`not-found.tsx` emit as Suspense/ErrorBoundary siblings labeled.
- **Phase:** Phase 3.

---

## Category 4 — Module Resolution

### 4.1 `tsconfig.json` paths ≠ simple prefix map

- **Failure:** Real tsconfig supports multi-target aliases, wildcards, baseUrl, `extends`, project references. Prototype's `--alias key=value` misses most.
- **Prevention:** Use `tsconfig-paths` or `get-tsconfig` package. Read nearest `tsconfig.json` + `extends` chain. Try each target in order. Fallback to Node resolution for node_modules, but mark external (don't parse).
- **Phase:** Phase 3 — integrate from day 1.

### 4.2 Barrel re-exports (`export * from './foo'`)

- **Failure:** `import { Button } from '@/components'` lands in `index.ts` barrel; `Button` not defined there, resolution fails.
- **Prevention:** When named import resolves to file but name isn't local, scan `ExportNamedDeclaration` and `ExportAllDeclaration`; recurse into re-export target. Cache export map per file. Handle `export { default as X } from './Y'`. Guard against re-export cycles.
- **Phase:** Phase 3 — required for any real Next.js app.

### 4.3 Symlinks (pnpm / Yarn PnP / monorepos / Windows junctions)

- **Failure:** `fs.realpath` returns content-addressable pnpm path; `fileRel` reports wrong location; agent's Edit can't find file.
- **Prevention:** Don't call `fs.realpath` for `fileRel`. Always re-root under project root. Detect monorepo workspaces, emit `workspace: "packages/ui"` annotations. Skip node_modules. Test pnpm, yarn, npm on Windows + POSIX.
- **Phase:** Phase 3 (hygiene); Phase 5 (monorepo fixtures).

### 4.4 Mixed ESM/CJS, `package.json` exports

- **Failure:** Parser tries to read bundled 2MB library CJS file; throws or is slow.
- **Prevention:** In v1, **don't parse node_modules at all**. Treat libraries as external framework nodes with module name. Only parse project-owned files.
- **Phase:** Phase 3 — hard-code project-only rule.

---

## Category 5 — Styling Extraction

### 5.1 Dynamic className defeats static analysis [INHERENT]

- **Failure:** ``className={`bg-${color}-500`}`` / `className={variants[state]}` — can't resolve statically.
- **Prevention:** Accept as fundamental limit. For `cn()`/`clsx()`/`cva()`/`twMerge()`, traverse all string-literal args. For `variants[state]`, attempt to resolve `variants` ObjectExpression and collect values (report "any of"). For template literals with interpolation, collect quasis, mark `{?}` positions. **Return both** resolved `classes: [...]` AND original `raw` source slice.
- **Phase:** Phase 4.

### 5.2 CSS Modules reference without file resolution

- **Failure:** `styles.wrapper` recorded but agent doesn't know what CSS it maps to.
- **Prevention:** v1 — record reference (`styles.wrapper @ ./Card.module.css`) without resolving; agents can read CSS themselves. v2+ — PostCSS parser for layout-relevant declarations only. Skip composed/nested/`:global`.
- **Phase:** Phase 4 (reference); v2 (CSS parsing).

### 5.3 CSS-in-JS template literals — unresolvable

- **Failure:** styled-components/emotion with theme interpolations can't be resolved statically.
- **Prevention:** Extract literal text, report quasis with `{?}` placeholders. Pattern-match common fixed properties (`display: flex`, etc.). Skip `${...}`. Detect library (styled-components/emotion/linaria/stitches) via import source, annotate. Be transparent about partial coverage.
- **Phase:** Phase 4 (best-effort).

### 5.4 Tailwind arbitrary values and variant prefixes

- **Failure:** Arbitrary variants `[&>svg]:size-6` break naive variant regex.
- **Prevention:** Update variant-strip regex: `^(?:\[[^\]]+\]|[a-zA-Z0-9_-]+):` repeated. Test on Tailwind v4 fixture. Be lenient — false positive cheaper than false negative.
- **Phase:** Phase 4.

---

## Category 6 — Hierarchy Output Quality for LLMs

### 6.1 Output too verbose → blows context

- **Failure:** 50-component page = 10k tokens; agent can't reason through it.
- **Prevention:** Default compact shape: `[Name] - path:line (layout-hint)`. Promote prototype's `--scope up|full|down` to tool args. `find_by_*` for search. Layout-only class filter by default. Token budget measured in tests.
- **Phase:** Phase 4 — budget from day 1.

### 6.2 Output too compressed → loses signal

- **Failure:** `[Button] [Card] [Button]` with no file paths — agent opens every file.
- **Prevention:** Every node MUST carry `file:line` (PROJECT.md contract). Differentiate duplicates by key attribute. Include first 80 chars of visible text. Preserve conditional structure (branches), not just consequents.
- **Phase:** Phase 4.

### 6.3 Markdown tree indentation confusing at depth

- **Failure:** `├──`/`└──` at depth 15+ becomes noise for LLMs.
- **Prevention:** Offer two formats: Markdown nested list (`-` indentation, `#` headings for layouts/pages) as default; JSON for programmatic. ASCII box-drawing as opt-in "terminal display" mode. Depth cap with "..." + `request more depth` hint. file:line redundant to indentation.
- **Phase:** Phase 4.

### 6.4 Missing file:line kills value prop

- **Failure:** HOC unwrap / fragment flatten loses `loc` info.
- **Prevention:** Every Babel AST node has `loc` — propagate to every tree node. For component references, record BOTH use-site and define-site file:line. Unit test: every node in fixture tree has `file && line`.
- **Phase:** Phase 3 (propagate); Phase 5 (test).

---

## Category 7 — Agent UX

### 7.1 Tool names agents don't discover

- **Failure:** Generic names (`hierarchy`, `query`, `search`) clash with other MCP servers; agent picks wrong.
- **Prevention:** Unique namespace prefix: `ui_hierarchy_get_full`, `ui_hierarchy_focus`, etc. Action-oriented (`get_`, `find_`, `focus_on_`). Description starts with use case: "When the user provides a screenshot or vague UI description and you need to find which file and component to edit...".
- **Phase:** Phase 2 — names lock in expensively.

### 7.2 Chatty tools force pagination

- **Failure:** `get_full_hierarchy` returns 50KB flooding UI.
- **Prevention:** Default scoped; `depth` and `include` args to expand. `find_by_*` caps results with total count. Return URI/handle for drill-down rather than everything upfront.
- **Phase:** Phase 2 + Phase 4.

### 7.3 Loose schemas → wrong types

- **Failure:** `focus_on: string` accepts `"the top nav"`; empty response with no hint.
- **Prevention:** Precise types: `component_name: z.string().regex(/^[A-Z]\w*(\.[A-Z]\w*)*$/).describe('PascalCase identifier, e.g. UserCard or Tabs.Root')`. Not-found → structured response with fuzzy-match suggestions. Route validation (`^/`). `z.enum()` where possible.
- **Phase:** Phase 2.

### 7.4 No "how to use this output" guidance

- **Failure:** Agent doesn't know it can pass node's `fileRel:line` into Edit; re-asks user.
- **Prevention:** In tool **description**, add: "Each node shows `file:line` — use directly with Edit. For detail, call `ui_hierarchy_focus_on` with name." Response-level hints only for errors (save tokens).
- **Phase:** Phase 2 + Phase 4.

---

<!-- ============================================================ -->
<!-- PART B — v1.1 pitfalls: --init file injector + polish items  -->
<!-- ============================================================ -->

## Category 8 — `--init` File Mutation (HIGHEST RISK SURFACE IN v1.1)

This is the first time the package mutates files on the user's machine. Every prior
surface was read-only (AST parsing) or protocol-bounded (stdio JSON-RPC). File mutation
is categorically different: it is irreversible without a backup and the error modes are
subtle. The pitfalls below must be addressed before the first alpha of `--init`.

---

### 8.1 Marker-block detection breaks on CRLF / LF mismatch [CRITICAL]

**What goes wrong:**
User's `CLAUDE.md` was edited in VS Code on Windows: it has CRLF line endings
(`\r\n`). The injector reads it and splits on `\n` only. The existing marker tags
`<!-- ui-hierarchy-mcp:start -->` survive but carry a trailing `\r`. The regex
`/<!-- ui-hierarchy-mcp:start -->/` does not match because the line is
`"<!-- ui-hierarchy-mcp:start -->\r"`. The tool concludes no block exists and writes
a second block, producing two consecutive marker sections. Every subsequent re-run
doubles the block again.

**Why it happens:**
Node.js `fs.readFile(..., 'utf8')` returns raw bytes without EOL normalization.
Developers testing only on POSIX never see the failure. Regex anchors `^...$` in
non-multiline mode eat `\r` differently depending on engine version.

**Prevention:**

1. After reading the file, detect dominant EOL: `const eol = content.includes('\r\n') ? '\r\n' : '\n';`
2. Normalize to LF for in-memory processing: `const normalized = content.replace(/\r\n/g, '\n');`
3. When re-serializing, restore original EOL: `output.replace(/\n/g, eol)`
4. Marker regex must strip `\r` before comparing: trim each candidate line before match, or use `/<!-- ui-hierarchy-mcp:start -->\r?/`.
5. Write an explicit CRLF fixture test (`\r\n` throughout) that asserts idempotency.

**Warning signs:** Running `--init` twice on a Windows checkout produces a growing file. CI on Linux passes while user bug reports pile up from Windows users.

**Phase to address:** Phase 1 of v1.1 milestone (file writer module), before any other `--init` work.

---

### 8.2 Greedy regex eats multiple blocks [CRITICAL]

**What goes wrong:**
User has two separate sections managed by different tools, both using HTML comment
markers. The injector's regex is:

```
/<!-- ui-hierarchy-mcp:start -->[\s\S]*<!-- ui-hierarchy-mcp:end -->/
```

This is greedy and will match from the FIRST start tag to the LAST end tag in the
file, silently consuming everything between. If the user has manually placed content
between a start/end pair and then added a second pair later, the greedy match destroys
it all.

Additionally: if the user copy-pasted a start tag without its matching end tag, the
greedy regex matches to end-of-file or the next unrelated end tag.

**Why it happens:**
`[\s\S]*` is maximally greedy. Developers test only the single-block case.

**Prevention:**

1. Use a non-greedy match: `[\s\S]*?` between markers.
2. After splitting on the start marker, take only the text up to the first occurrence of the end marker — do not use a single spanning regex.
3. Canonical approach (split-based, regex-free for the inner boundary):
   ```typescript
   const START = "<!-- ui-hierarchy-mcp:start -->";
   const END = "<!-- ui-hierarchy-mcp:end -->";
   const startIdx = normalized.indexOf(START);
   const endIdx = normalized.indexOf(END, startIdx + START.length);
   // startIdx === -1 → no block; append
   // startIdx !== -1 && endIdx === -1 → corrupt block; warn and abort
   // both found → splice [startIdx, endIdx + END.length]
   ```
4. If both markers exist but `endIdx < startIdx`, treat as corrupt and refuse to proceed — print a clear error instead of silently mangling the file.

**Warning signs:** File grows much larger than expected. User reports "my entire CLAUDE.md was replaced."

**Phase to address:** Phase 1 of v1.1 milestone — block splicing logic.

---

### 8.3 BOM (byte-order mark) at file start breaks marker detection

**What goes wrong:**
Windows Notepad and some editors write UTF-8-BOM files (`﻿` as first byte).
Node.js `fs.readFile(..., 'utf8')` does NOT strip the BOM. A `CLAUDE.md` that starts
with `﻿<!-- ui-hierarchy-mcp:start -->` will not match the start-marker string
`<!-- ui-hierarchy-mcp:start -->` because the BOM character precedes it.

**Why it happens:**
Developers on POSIX never produce BOM files. The BOM is invisible in most terminals.

**Prevention:**
Strip BOM immediately after reading: `content = content.replace(/^﻿/, '');`
When writing back, preserve BOM if present: track `const hasBOM = original.startsWith('﻿');` and prepend `﻿` to the written content if it was there.

**Warning signs:** `--init` reports "block not found" and appends a new block on every run even though the file visibly contains the markers.

**Phase to address:** File reader utility, before marker detection logic.

---

### 8.4 Trailing-newline drift causes spurious diffs

**What goes wrong:**
The user's `CLAUDE.md` ends with exactly one `\n`. After the first `--init` run, the
injected block ends with `\n`. The file now ends with `\n\n` (block's trailing newline
plus file's trailing newline). On the second run, the file ends with `\n\n\n`. Git
shows the file as "modified" on every re-run, which erodes user trust.

**Why it happens:**
The injector appends its block content verbatim, then writes the rest of the file
content which itself has a trailing newline.

**Prevention:**

1. When appending a new block (no prior block): ensure the file has exactly one `\n`
   before the block start, the block content itself, then exactly one trailing `\n`.
2. When replacing an existing block: splice the exact byte range `[startIdx, endIdx + END.length]`
   and replace with the new block content. Do not touch content outside that range.
3. Normalize final output to end with exactly one `\n`: `output = output.replace(/\n+$/, '') + '\n';`
4. Test: hash of file after N runs equals hash after first run (idempotency assertion).

**Warning signs:** `git diff CLAUDE.md` always shows changes even after running `--init` twice with no version change.

**Phase to address:** Phase 1 of v1.1 milestone — write-back normalization.

---

### 8.5 Non-atomic writes corrupt on crash mid-write [CRITICAL]

**What goes wrong:**
The injector does:

```typescript
await fs.writeFile(targetPath, newContent, "utf8");
```

If the process is killed (Ctrl+C, OOM, power loss) after `writeFile` truncates the
file but before it finishes writing, the user's `CLAUDE.md` is now a partial file —
potentially empty or corrupt. There is no recovery path without git history.

**Why it happens:**
`fs.writeFile` is not atomic: it opens the file, truncates it, then writes. The
truncation happens before the write completes.

**Prevention:**
Implement atomic write with temp-file-then-rename:

```typescript
import { writeFile, rename, copyFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";

async function atomicWrite(targetPath: string, content: string): Promise<void> {
  const tmpPath = join(
    dirname(targetPath),
    `.ui-hierarchy-mcp-${randomBytes(6).toString("hex")}.tmp`,
  );
  await writeFile(tmpPath, content, "utf8");
  try {
    await rename(tmpPath, targetPath);
  } catch (err: unknown) {
    // EXDEV: cross-device link not permitted — temp file and target on different drives.
    // Happens on Windows when TEMP env points to a different drive (e.g., D:\Temp vs C:\project).
    // Also triggered by MSIX sandbox virtualizing AppData as a separate filesystem.
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      await copyFile(tmpPath, targetPath);
      await unlink(tmpPath);
    } else {
      await unlink(tmpPath).catch(() => undefined); // best-effort cleanup
      throw err;
    }
  }
}
```

Temp file must be in the SAME DIRECTORY as the target (same filesystem) so rename is
atomic. Do not use `os.tmpdir()` — it may be on a different drive on Windows.

**Warning signs:** User reports empty `CLAUDE.md` after hitting Ctrl+C. CI occasionally produces zero-byte files.

**Phase to address:** Phase 1 of v1.1 milestone — the atomic write utility is a precondition of ALL other `--init` file operations.

---

### 8.6 File-permission errors swallowed silently

**What goes wrong:**
The target file is read-only (checked out from a git repo with restricted perms, on a
network drive, or inside a company-managed directory). `fs.writeFile` throws `EACCES`
or `EPERM`. If the caller catches the error with a generic `.catch(() => undefined)`,
the user sees no output and assumes success. Their file was never updated.

**Why it happens:**
Overly broad catch blocks. Distinguishing "expected" errors (file doesn't exist yet)
from "unexpected" ones (permission denied) is easily skipped under time pressure.

**Prevention:**
Never swallow fs errors silently. Classify errors explicitly:

```typescript
const EXPECTED_CODES = new Set(["ENOENT"]); // file doesn't exist yet — create it
try {
  await atomicWrite(path, content);
} catch (err: unknown) {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "EACCES" || code === "EPERM") {
    console.error(
      `[ui-hierarchy-mcp] Cannot write to ${path}: permission denied.`,
    );
    console.error(`  Run with elevated permissions or check file ownership.`);
    process.exit(1);
  }
  throw err; // surface unexpected errors
}
```

Return a structured result type from the writer that includes `{ ok: boolean, path, error? }` so the CLI layer can print a consolidated summary of which files succeeded and which failed, instead of aborting on the first error.

**Warning signs:** `--init` exits 0 but some targets were silently skipped. User opens file and finds it unchanged.

**Phase to address:** Phase 1 of v1.1 milestone — error classification in the writer.

---

### 8.7 Preserving (or warning about) hand-edits inside marker block

**What goes wrong:**
User ran `--init`, then customized the injected guide (added project-specific usage
examples inside the marker block). On the next `--init` run, the entire block is
replaced and their edits are lost.

**Why it happens:**
Injectors replace the entire block contents with the canonical template on every run.
This is safe for machine-generated content but destructive for human edits.

**Prevention:**
Two defensible strategies — pick one and document it clearly:

**Option A (Warn, don't replace):** On re-run, if the existing block content differs
from what the tool would write, print:

```
[ui-hierarchy-mcp] CLAUDE.md already contains an up-to-date block (version 1.1).
  The block appears to have been manually edited. Pass --force to overwrite.
```

Only replace silently when the existing block is byte-for-byte the previous tool version
(detected via the version comment inside the block — see pitfall 8.10).

**Option B (Replace always, but warn):** Always replace, but before writing, check if
`existingBlockContent !== previousVersionContent && existingBlockContent !== newContent`.
If so: print a warning listing which lines were customized, and offer to diff.

**Recommendation:** Option A for v1.1. It is conservative and reversible. `--force`
is the escape hatch. Users who want auto-update can pass `--force` in their CI scripts.

**Warning signs:** User files a bug saying "init deleted my notes." No warning was printed.

**Phase to address:** Block-replace logic in Phase 1 of v1.1 milestone.

---

### 8.8 Block versioning — stale guides silently persist after upgrades

**What goes wrong:**
User installs v1.1 of the package. Their `CLAUDE.md` was injected by v1.0 and contains
the v1.0 guide. The v1.1 guide adds a new tool (`--init --target codex`). The user
never learns about it because re-running `--init` without `--force` sees an existing
block and does nothing. The injected docs are now stale.

**Why it happens:**
Without version metadata inside the block, the tool cannot distinguish "user edited" from
"old version". It conservatively refuses to overwrite either.

**Prevention:**
Embed a version comment as the first line inside the block:

```
<!-- ui-hierarchy-mcp:start -->
<!-- version: 1.1 -->
...guide content...
<!-- ui-hierarchy-mcp:end -->
```

On re-run, extract the version comment. If `existingVersion < currentVersion` AND the
rest of the block content equals the v{existingVersion} canonical template (i.e., not
hand-edited), auto-upgrade silently and print:

```
[ui-hierarchy-mcp] Updated CLAUDE.md guide from v1.0 → v1.1.
```

If the block was hand-edited (content differs from canonical v{existingVersion}
template), print a warning and skip upgrade unless `--force` is passed.

**Implementation note:** The canonical template for each past version must be stored in
the package (even if only as a hash for comparison). A simple approach: store a
`TEMPLATE_HASH_V1_0` constant and compare `sha256(existingBlockContent)` to it.

**Warning signs:** Users stuck on v1.0 guide long after upgrading the npm package.
Support requests about "missing features" that were already shipped.

**Phase to address:** Phase 1 of v1.1 milestone — block version metadata is part of the
initial design, not a retrofit.

---

### 8.9 `--init` accidentally triggers during MCP server startup [CRITICAL]

**What goes wrong:**
An MCP client (Claude Code, Cursor) launches the package as `npx -y ui-hierarchy-mcp`.
The current `src/cli.ts` immediately calls `startServer()`. If `--init` argument
handling is added carelessly (e.g., a top-level `if (process.argv.includes('--init'))`)
that runs before the MCP server check, and if an MCP client somehow passes a flag that
triggers `--init`, the tool will start writing to the user's `CLAUDE.md` without
consent during a normal MCP session.

More concretely: if `--init` logic is added to `cli.ts` without an explicit guard that
`stdout` is NOT an MCP JSON-RPC channel, and the tool prints `--init` status messages
to stdout, it will corrupt the JSON-RPC stream (see pitfall 1.1).

**Why it happens:**
Careless arg parsing in `cli.ts`. Forgetting that `cli.ts` is the entry point for
BOTH the MCP server AND the `--init` CLI subcommand.

**Prevention:**

1. Parse `process.argv` at the very top of `cli.ts`, before anything else:
   ```typescript
   const mode = process.argv[2];
   if (mode === "--init") {
     // All output goes to stdout (free — not an MCP session). Never call startServer().
     await runInit(process.argv.slice(3));
     process.exit(0);
   } else {
     // MCP server mode: stdout is sacred JSON-RPC. No console.log ever.
     await startServer();
   }
   ```
2. `runInit` must write ALL output to `process.stdout` or `process.stderr` using
   `console.log`/`console.error` — never to the MCP log channel.
3. Add an integration test: spawn the binary with `--init --dry-run` and assert
   stdout does NOT contain a JSON-RPC envelope.

**Warning signs:** MCP client reports parse errors on connection. `--init` modifies
files without the user explicitly invoking `ui-hierarchy-mcp --init`.

**Phase to address:** `cli.ts` refactor is the first task of v1.1 Phase 1 — gate everything on `mode`.

---

### 8.10 `.cursor/rules/` directory must be created, filename must be stable

**What goes wrong:**
User runs `--init --target cursor` in a project that has never used Cursor. The
`.cursor/rules/` directory does not exist. `fs.writeFile` throws `ENOENT` (parent
directory missing). The error is either swallowed or produces a confusing message.

Separately: if the filename is chosen dynamically (e.g., `ui-hierarchy-${timestamp}.mdc`),
running `--init` twice creates two rule files instead of one. Cursor loads both.

**Why it happens:**
`fs.writeFile` does not create parent directories. Filename instability.

**Prevention:**

1. Use `fs.mkdir(dir, { recursive: true })` before writing any file. This is safe even
   if the directory already exists.
2. Fix the filename: `ui-hierarchy-mcp.mdc`. Never include timestamps, versions, or
   random suffixes in the filename. Idempotency requires a stable path.
3. For `.mdc` format: include the required YAML frontmatter that Cursor expects:
   ```yaml
   ---
   description: ui-hierarchy-mcp usage guide for AI coding agents
   alwaysApply: true
   ---
   ```
   Without `alwaysApply: true` or a `globs` pattern, Cursor will not auto-include the rule.

**Warning signs:** `--init --target cursor` prints success but Cursor never sees the
guide. Rule file silently not loaded because frontmatter is missing.

**Phase to address:** Phase 1 of v1.1 milestone — Cursor target handler.

---

### 8.11 `AGENTS.md` placement — repo root only, monorepo consideration

**What goes wrong:**
User runs `--init --target codex` from a monorepo subdirectory (e.g., `apps/web/`).
The tool writes `apps/web/AGENTS.md`. Codex reads AGENTS.md starting from the git root
and walking down — it will find this file, but only for work rooted in `apps/web/`.
If the user intended a repo-wide guide, the placement is wrong.

**Why it happens:**
`--init` defaults to `process.cwd()` as the target directory. In a monorepo this is
almost never the git root.

**Prevention:**

1. Detect git root: walk up from `cwd` looking for `.git/`. If found and `cwd !== gitRoot`,
   print a warning:
   ```
   [ui-hierarchy-mcp] Warning: current directory is not the git root.
     Writing AGENTS.md to: apps/web/AGENTS.md (Codex scope: this subpackage only)
     To write repo-wide guide: ui-hierarchy-mcp --init --target codex --root /path/to/root
   ```
2. Provide a `--root <path>` flag that overrides the target directory for all writes.
3. Document: AGENTS.md at repo root = all Codex sessions; at subdir = only sessions
   within that subtree. This matches verified Codex behavior (developers.openai.com).

**Warning signs:** User says "Codex doesn't see the guide in some repos." The guide
was written to a nested subpackage directory, not the repo root.

**Phase to address:** Phase 1 of v1.1 milestone — target directory resolution.

---

### 8.12 No-target-detected UX — user runs `--init` in a wrong directory

**What goes wrong:**
User runs `--init --target cursor` in a directory with no `.cursor/`. The tool either:
(a) silently creates `.cursor/rules/ui-hierarchy-mcp.mdc` in that directory — not
what the user wanted (they're in a temp folder, not their project root), or
(b) refuses with a cryptic `ENOENT` message.

**Why it happens:**
No pre-flight check for "does this look like a project directory?"

**Prevention:**

1. Before writing any file, check for project indicators: `package.json`, `.git/`,
   `next.config.*`, `tsconfig.json`. If none found:
   ```
   [ui-hierarchy-mcp] Warning: no project files detected in /current/dir.
     Did you mean to run this from your project root?
     Pass --yes to write anyway.
   ```
2. For `--target cursor`: check for `.cursor/` OR `package.json`. If only `package.json`
   exists (new Cursor user), create `.cursor/rules/` and print:
   ```
   [ui-hierarchy-mcp] Created .cursor/rules/ and wrote ui-hierarchy-mcp.mdc
   ```
3. For `--target claude`: `CLAUDE.md` is always acceptable to create if missing — this is
   the least opinionated target.

**Warning signs:** `--init` creates rule files in the user's home directory or Desktop.

**Phase to address:** Phase 1 of v1.1 milestone — pre-flight validation before any writes.

---

## Category 9 — v1.0 Polish Item Pitfalls

### 9.1 Warnings dropped from markdown renderer — JSON callers silently break if moved [CRITICAL]

**What goes wrong:**
Currently `renderMarkdown(tree, _envelope)` ignores `_envelope.warnings`. The fix is
to append warnings to the markdown output (e.g., as a `## Warnings` section at the end
or as inline `⚠` comments).

The risk: if the fix is implemented carelessly as a format change to the JSON renderer
or to the Envelope shape, existing callers that parse `envelope.warnings` as a JSON
array will break. Specifically:

- Consumers that call with `format: "json"` and read `envelope.warnings` are relying
  on warnings being in the structured envelope, not embedded in the markdown string.
- If warnings are accidentally appended to the `text` field of a JSON response, a
  consumer parsing `JSON.parse(response.text)` will get a parse error.

**Why it happens:**
The markdown and JSON paths share `withErrorBoundary` and `buildEnvelope`. A developer
fixing the markdown path might accidentally change the shared envelope builder and
affect the JSON path.

**Prevention:**

1. The fix is purely additive to the markdown renderer: change `renderMarkdown` from
   ignoring `_envelope` to reading `envelope.warnings` and appending them after the
   tree. The JSON path is untouched.
2. Add an explicit test: `format: "json"` response must be valid JSON and
   `JSON.parse(text).warnings` must be an array. This test must be in the CI suite
   BEFORE the markdown fix lands, so it cannot be broken accidentally.
3. Verify: the `renderMarkdown` signature already accepts `Envelope` as the second
   parameter (confirmed in `src/renderers/markdown.ts:107`). The fix is adding
   `if (envelope.warnings.length > 0) { lines.push('', '---', '**Warnings:**', ...warnings) }`.

**Warning signs:** `format: "json"` responses suddenly contain non-JSON text. The JSON
integration test suite that currently exists (confirmed: `test/renderers/json.test.ts`)
goes red.

**Phase to address:** Phase 2 of v1.1 milestone (after `--init` is done) — low complexity but must be tested first.

---

### 9.2 Markdown integration tests: path separator in snapshots causes Windows CI failures

**What goes wrong:**
The existing markdown snapshot tests use `toMatchFileSnapshot` (confirmed in
`test/renderers/markdown.test.ts`). Snapshot files contain paths like
`app/page.tsx:1`. On Windows, if any path-normalization step is missing, the rendered
output contains backslashes (`app\page.tsx:1`), causing snapshot mismatches only on
Windows CI runners.

The existing suite already has `expect(out).not.toContain('\\')` as a guard, and
`toForwardSlash` is applied throughout `src/core/paths.ts`. The new integration tests
for markdown output (exercising the full Analyzer → renderMarkdown pipeline, not just
fixture-based IR rendering) must enforce this invariant end-to-end.

**Why it happens:**
`path.join` and `path.relative` on Windows emit backslashes. The `toForwardSlash`
utility exists but must be applied at every emission point. New code paths added for
v1.1 (if any touch file paths) may forget the normalization.

**Prevention:**

1. All integration tests must include `expect(output).not.toContain('\\')` as a
   mandatory assertion before any snapshot check.
2. Snapshot files committed to the repo must use forward slashes. If a developer
   runs `vitest --update` on Windows and accidentally commits backslash-laden snapshots,
   the next POSIX CI run will fail. Add a CI step or git hook that rejects any
   committed snapshot containing backslashes.
3. The new markdown integration tests (Phase 2 of v1.1) must run against the real
   Next.js fixture projects (already in `test/fixtures/`), not synthetic IR — this
   exercises the full path normalization chain.

**Warning signs:** CI on GitHub Actions (Linux) passes; local Windows dev run fails
on snapshot comparison. Or vice versa — backslash snapshots committed from Windows
make Linux CI fail.

**Phase to address:** Phase 2 of v1.1 milestone — add `not.toContain('\\')` assertion
to every new markdown integration test as a non-negotiable pattern.

---

### 9.3 True `line` for resolved component nodes — off-by-one and indexing confusion

**What goes wrong:**
Currently `src/core/Analyzer.ts:304` sets `line: 1` for all resolved component nodes
(confirmed in code). The fix requires finding the line where the component is **defined**
(the `FunctionDeclaration` / `ArrowFunctionExpression` / `ClassDeclaration` that
constitutes the component's default export) in the resolved file.

Two specific failure modes:

**9.3a — Babel lines are 1-indexed; the placeholder is also 1 (coincidence):**
`line: 1` happens to be Babel's first line. The fix replaces it with the actual
declaration line, which Babel also reports 1-indexed. This is correct and consistent.
However, if a consumer was computing something like `declarationLine - 1` to convert
to 0-indexed (incorrectly assuming 1-indexed output), the fix will shift their
computation. The output contract (`file:line` in the markdown renderer) is already
verified to be 1-indexed (snapshot `@ app/page.tsx:1` is the first line), so no
consumer should be doing 0-indexed conversion — but this must be confirmed via a test.

**9.3b — The resolved file may export the component on line N, but the interesting
line is the JSX return inside it:**
There's a design choice: should `line` point to the `function ComponentName()` declaration,
or to the `return (<JSX>)` statement? The v1.0 contract is "the JSX site that carries
the prop" for attribute matches, and "the component call site" for component nodes.
For resolved component nodes specifically, the most useful value is the `export default`
or `function` declaration line — this is what the agent needs to navigate to the
component definition. Document this explicitly in the IR spec comment.

**Prevention:**

1. In the resolver post-processing step (currently at `src/core/Analyzer.ts:288-312`),
   after resolving to `result.absolutePath`, parse the resolved file and find the
   declaration node: walk AST for `ExportDefaultDeclaration` whose declaration is a
   `FunctionDeclaration`, `ArrowFunctionExpression`, or the default-export binding.
   Use `node.loc.start.line` (Babel, 1-indexed).
2. Add a test asserting `line > 1` for a component defined on line 3+ in a fixture.
   This catches both the "still returning placeholder 1" regression and the off-by-one
   scenario.
3. Document in `ir/schema.ts` or a JSDoc comment: "`line` is 1-indexed (Babel convention).
   For resolved component nodes, points to the function/class declaration line. For
   call-site nodes, points to the JSX opening tag line."

**Warning signs:** `line: 1` appears on component nodes that are clearly defined below
line 1 in their source file. Consumers that use `line` for "go to definition" navigation
always land at line 1 (file top), which still works but is unhelpful.

**Phase to address:** Phase 2 of v1.1 milestone — isolated change in Analyzer.ts, should
not affect other output surfaces. Pair with a regression test for `line: 1` placeholder.

---

## "Looks Done But Isn't" Checklist (v1.1 additions)

- [ ] `--init` run twice on a CRLF file produces identical output (byte-for-byte)
- [ ] `--init` interrupted mid-write (SIGKILL) leaves original file intact
- [ ] `--init` on a read-only file prints a clear error and exits non-zero
- [ ] `--init` in a monorepo subdir prints a warning about non-root placement
- [ ] `.cursor/rules/ui-hierarchy-mcp.mdc` has valid YAML frontmatter with `alwaysApply`
- [ ] `--init` with no args (CLAUDE.md target) does NOT print to stdout when the binary
      is launched by an MCP client (stdin/stdout bound to JSON-RPC)
- [ ] Re-running `--init` after a version bump auto-upgrades un-edited blocks silently
- [ ] Re-running `--init` after a version bump warns and skips hand-edited blocks
- [ ] `format: "json"` responses are still valid JSON after markdown-warning fix
- [ ] Markdown integration test output contains no backslashes on Windows
- [ ] Resolved component nodes have `line > 1` when the component is defined below line 1
- [ ] Markdown renderer appends `envelope.warnings` without breaking JSON path
- [ ] `--init --dry-run` prints what would be written without touching any file

---

## Phase-to-Pitfall Mapping (v1.1)

| v1.1 Phase                                        | Pitfalls addressed                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1 — `--init` file writer infrastructure** | 8.1 (CRLF), 8.2 (greedy regex), 8.3 (BOM), 8.4 (trailing newline), 8.5 (atomic write), 8.6 (permissions), 8.7 (hand-edit warning), 8.8 (versioning), 8.9 (MCP vs CLI mode), 8.10 (cursor dir + frontmatter), 8.11 (monorepo root), 8.12 (no-project UX) |
| **Phase 2 — v1.0 polish**                         | 9.1 (warning surface), 9.2 (markdown integration tests), 9.3 (true line)                                                                                                                                                                                |

**Phase 1 owns 12 pitfalls** — the file mutation surface is the riskiest part of v1.1.
Ship Phase 1 with a `--dry-run` flag that exercises the full path without writing, so
the end-to-end idempotency tests can run in CI without mutating any files.

---

## v1.1 Technical Debt Patterns

| Shortcut                                           | Cost                                           | When acceptable                                                                      |
| -------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| No `--dry-run` flag                                | Can't safely test in CI without file mutations | NOT acceptable — build `--dry-run` in Phase 1                                        |
| Version hashing without stored canonical templates | Can't detect hand-edits vs old version         | Acceptable in v1.1 if only current template is stored; store v1.0 hash as a constant |
| `AGENTS.md` at cwd without git-root detection      | Silently wrong in monorepos                    | NOT acceptable — always warn if cwd ≠ git root                                       |
| Skipping `.github/` creation for copilot target    | ENOENT on first run                            | NOT acceptable — always `mkdir -p`                                                   |
| Markdown warning surface as trailing text          | Subtle but acceptable for markdown format      | Acceptable — annotate the design decision in code                                    |

---

## Confidence Assessment (v1.1 additions)

| Area                              | Confidence | Basis                                                                                     |
| --------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| CRLF/LF/BOM handling              | HIGH       | Ansible blockinfile issue #85283; Node.js fs BOM docs; community reports                  |
| Atomic write / EXDEV              | HIGH       | npm/write-file-atomic; Node.js issue #19077; Claude Code EXDEV issues #25476, #42119      |
| Marker block design               | HIGH       | Ansible blockinfile pattern; git-changelog marker convention                              |
| AGENTS.md placement               | HIGH       | Official Codex docs (developers.openai.com/codex/guides/agents-md)                        |
| `.cursor/rules/*.mdc` format      | HIGH       | Cursor official docs (docs.cursor.com/context/rules); community forum patterns            |
| `.github/copilot-instructions.md` | HIGH       | GitHub official docs (docs.github.com/copilot)                                            |
| Block versioning / upgrade UX     | MEDIUM     | No official standard; pattern derived from changelog tools + semantic versioning norms    |
| MCP vs CLI mode guard             | HIGH       | Direct analysis of existing `src/cli.ts` + pitfall 1.1 established in v1.0 research       |
| Markdown warnings fix             | HIGH       | Direct code analysis — `renderMarkdown` signature confirmed, JSON path confirmed separate |
| True `line` implementation        | HIGH       | Babel `loc.start.line` 1-indexed confirmed; Analyzer.ts line 304 confirmed as placeholder |

---

## Sources

**v1.0 sources (archived)**

- MCP spec and debugging guides (modelcontextprotocol.io)
- Next.js official docs (parallel-routes, intercepting-routes, use-client, generateMetadata)
- Babel `@babel/traverse` + GitHub issues (#14375, #7554, #10022)
- TypeScript TSConfig Reference; pnpm workspaces; React forwardRef/memo docs

**v1.1 sources**

- [Ansible blockinfile CRLF idempotency bug — Issue #85283](https://github.com/ansible/ansible/issues/85283) — HIGH: canonical evidence that CRLF breaks marker-block detection
- [Ansible blockinfile keeps adding block — Issue #45848](https://github.com/ansible/ansible/issues/45848) — HIGH: greedy-regex double-block failure mode documented
- [Node.js fs.rename EXDEV cross-device — Issue #19077](https://github.com/nodejs/node/issues/19077) — HIGH: Windows cross-drive rename limitation
- [Claude Code EXDEV on Windows MSIX — Issue #25476](https://github.com/anthropics/claude-code/issues/25476) — HIGH: MSIX sandbox = different filesystem; EXDEV even on same drive letter
- [Claude Code EXDEV dual-drive Windows 11 — Issue #42119](https://github.com/anthropics/claude-code/issues/42119) — HIGH: confirms copyFile+unlink fallback is the correct pattern
- [npm/write-file-atomic README](https://github.com/npm/write-file-atomic/blob/main/README.md) — HIGH: atomic write pattern with temp-file-then-rename
- [Node.js BOM handling — Issue #1918](https://github.com/nodejs/node-v0.x-archive/issues/1918) — HIGH: Node.js does NOT strip BOM on readFile
- [OpenAI Codex AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md) — HIGH: repo-root placement, subdirectory precedence, override behavior
- [Cursor rules official docs](https://docs.cursor.com/context/rules) — HIGH: `.cursor/rules/*.mdc`, YAML frontmatter, `alwaysApply` field
- [GitHub Copilot custom instructions docs](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot) — HIGH: `.github/copilot-instructions.md` canonical path
- `e:\ui-to-hierarch\src\core\Analyzer.ts` — HIGH: `line: 1` placeholder at line 304 confirmed
- `e:\ui-to-hierarch\src\renderers\markdown.ts` — HIGH: `_envelope` ignored in `renderMarkdown` confirmed
- `e:\ui-to-hierarch\src\cli.ts` — HIGH: single entry point for both MCP server and future `--init`; mode-gate analysis
- `e:\ui-to-hierarch\test\renderers\markdown.test.ts` — HIGH: existing snapshot test patterns and path guard assertions confirmed
