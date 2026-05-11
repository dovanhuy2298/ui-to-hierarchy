# Architecture Patterns — v1.1 Integration

**Domain:** MCP server CLI — agent onboarding + output surface polish
**Researched:** 2026-05-11
**Scope:** v1.1 features integration into existing `@hudyv2298/ui-hierarchy-mcp` architecture

---

## Existing Architecture Map (v1.0 Baseline)

```
src/
  cli.ts                        <- bin entry (3 lines: import + startServer())
  mcp/
    server.ts                   <- createServer() + startServer()
    log.ts
    errors.ts
    tools/
      index.ts                  <- ToolModule registry (tools array)
      get-full-hierarchy.ts
      focus-on.ts
      find-by-text.ts
      find-by-style.ts
  core/
    Analyzer.ts                 <- per-call orchestrator (ARCH-02)
    babel-shim.ts
    paths.ts
    parser/
    resolver/
      index.ts                  <- resolveModule() entry; no-throw per D-12
      barrel.ts
      relative.ts
      tsconfig.ts
      node-modules.ts
    render-flow/
    extractors/
  ir/
    schema.ts                   <- TreeNode 9-kind union
    envelope.ts                 <- Envelope { schemaVersion, warnings[], tree }
    index.ts
  adapters/
    FrameworkAdapter.ts         <- 5-method interface
    types.ts                    <- ResolveResult, RenderNode, ComponentDefinition, ...
    next/
      NextJsAdapter.ts
      detect.ts
      discover.ts
      route-map.ts
      segments.ts
  renderers/
    markdown.ts                 <- renderMarkdown(tree, _envelope): string
    json.ts                     <- renderJson(tree, envelope): Envelope
    index.ts
```

**Key invariant (ARCH-01 / D-11):** `src/core/`, `src/ir/`, `src/renderers/` have zero runtime imports from `src/adapters/`. Enforced by Biome `noRestrictedImports` + `test/architecture/island.test.ts`. New code in `src/init/` must respect this — init has no reason to touch `adapters/` anyway.

---

## Q1: CLI Subcommand Dispatch

### Current state

`src/cli.ts` is 3 lines:
```typescript
import { log } from "./mcp/log.js";
import { startServer } from "./mcp/server.js";
startServer().catch(...);
```

There is no CLI framework (`commander`, `yargs`, `meow`, etc.). The bin entry is a direct boot.

### Recommended pattern: hand-rolled argv switch in cli.ts

No framework needed. `--init` is a single subcommand with one optional flag (`--target`). A framework would add a runtime dep and increase install footprint for one `if` branch.

```typescript
// src/cli.ts (v1.1 shape)
import { log } from "./mcp/log.js";
import { startServer } from "./mcp/server.js";

const args = process.argv.slice(2);
const isInit = args.includes("--init");

if (isInit) {
  // lazy import keeps MCP server code out of init path
  const { runInit } = await import("./init/index.js");
  const targetIdx = args.indexOf("--target");
  const targetArg = targetIdx !== -1 ? args[targetIdx + 1] : undefined;
  const targets = targetArg ? targetArg.split(",") : ["claude"];
  await runInit({ targets }).catch((err: unknown) => {
    process.stderr.write(JSON.stringify({ level: "error", msg: String(err) }) + "\n");
    process.exit(1);
  });
} else {
  startServer().catch((err: unknown) => {
    log.error("server error", { message: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
```

**Why dynamic `import()`:** Avoids loading Babel, MCP SDK, and zod into the init path. Init only needs `node:fs/promises` and `node:path`. The lazy import also avoids the `__TOOL_VERSION__` define requirement in non-build contexts (tsx dev run) — `startServer` is the only path that needs it.

**Dispatch contract:**
- Bare `node dist/cli.js` -> MCP server (existing behavior, zero change to `startServer`)
- `node dist/cli.js --init` -> init handler, exits 0 on success
- `node dist/cli.js --init --target claude,cursor` -> init with targets list
- Unknown flags pass through to server path (existing MCP clients are unaffected)

**Build impact:** `tsup.config.ts` entry remains `["src/cli.ts"]` — no change needed. `src/init/` is reachable from `cli.ts` so tsup bundles it automatically. No new entry points.

---

## Q2: Init Module Layout

### Recommended: `src/init/` island

```
src/init/
  index.ts          <- exports runInit({ targets }): Promise<void>
  targets.ts        <- TARGET_MAP: record of target-id -> { paths, heading, frontmatter? }
  mutator.ts        <- readSplice(filePath, content, markers): Promise<void>
  template.ts       <- GUIDE_CONTENT: string constant (the injected markdown)
```

**Rationale for `src/init/` over `src/cli/init.ts`:**
- `src/init/` enforces the same island discipline pattern used by `src/core/`, `src/ir/`, `src/renderers/`. One directory = one concern.
- `src/cli/init.ts` implies init is a CLI concern — it's not. Init is a standalone write operation. A future HTTP transport or script invoker could call `runInit` directly.
- The directory boundary makes it easy to assert the island doesn't import MCP/Babel internals.

**Dependency rules for `src/init/`:**
- MAY import: `node:fs/promises`, `node:path`, `node:os`
- MUST NOT import: `src/mcp/`, `src/core/`, `src/ir/`, `src/adapters/`, `src/renderers/`
- Zero external runtime deps (no `@modelcontextprotocol/sdk`, no `zod`, no Babel)

**`runInit` signature:**
```typescript
export async function runInit(opts: {
  targets: string[];          // validated against TARGET_MAP keys
  cwd?: string;               // defaults to process.cwd()
}): Promise<void>
```

`runInit` validates targets, resolves output paths relative to `cwd`, calls `readSplice` for each, and writes to stderr (not stdout — stdout is reserved for MCP JSON-RPC in server mode, but when init runs, server never starts, so this is moot; stderr is still correct for human-readable output).

---

## Q3: Template Asset — Constant vs File

### Recommended: TypeScript string constant in `src/init/template.ts`

Do NOT use a runtime `fs.readFile` for the template. Reasons:

1. **tsup bundles `src/init/` into `dist/cli.js`** — a single JS file. There is no `dist/` subdirectory for assets. An `fs.readFile` would need a path relative to `import.meta.url`, which is fragile across dev (`tsx src/cli.ts`), built (`node dist/cli.js`), and global install (`npx`).

2. **The template is small** (a few hundred bytes of markdown). No size reason to externalize.

3. **`import.meta.url`-relative file access in tsup bundles** requires `import.meta.url` to resolve to the actual `.js` file's directory — which works in Node ESM but would require `__dirname` shims and `tsup`'s `metafile` option. This adds complexity for zero benefit.

4. **String constant is zero-dep, zero-config, survives any tsup externalization** strategy. It is also testable as a plain string import.

```typescript
// src/init/template.ts
export const GUIDE_CONTENT = `
## ui-hierarchy-mcp — Usage Guide

<!-- ui-hierarchy-mcp:start -->
...
<!-- ui-hierarchy-mcp:end -->
`;
```

**If the template grows large** (>2KB), it can still be inlined as a template literal. No structural change needed.

---

## Q4: Target File Writers — Interface Design

### Recommended: single generic `readSplice` + per-target config map

Do NOT write per-target writer functions. The per-target differences are data, not logic:

```typescript
// src/init/targets.ts
export interface TargetConfig {
  id: string;
  label: string;
  /** Relative to cwd. For .cursor/rules the file name can be fixed. */
  relativePath: string;
  /** Heading to prepend when creating a new section. Null = no heading. */
  sectionHeading: string | null;
  /** If true, prepend YAML frontmatter block on new file creation. */
  frontmatter: string | null;
}

export const TARGET_MAP: Record<string, TargetConfig> = {
  claude:  { id: "claude",  label: "CLAUDE.md",                       relativePath: "CLAUDE.md",                           sectionHeading: "## ui-hierarchy-mcp",  frontmatter: null },
  codex:   { id: "codex",   label: "AGENTS.md",                       relativePath: "AGENTS.md",                           sectionHeading: "## ui-hierarchy-mcp",  frontmatter: null },
  cursor:  { id: "cursor",  label: ".cursor/rules/ui-hierarchy.mdc",   relativePath: ".cursor/rules/ui-hierarchy.mdc",       sectionHeading: null,                   frontmatter: "---\ndescription: ui-hierarchy-mcp usage\nglobs:\nalwaysApply: true\n---\n" },
  copilot: { id: "copilot", label: ".github/copilot-instructions.md",  relativePath: ".github/copilot-instructions.md",      sectionHeading: "## ui-hierarchy-mcp",  frontmatter: null },
};
```

```typescript
// src/init/mutator.ts
const START = "<!-- ui-hierarchy-mcp:start -->";
const END   = "<!-- ui-hierarchy-mcp:end -->";

export async function readSplice(
  filePath: string,
  newContent: string,
  heading: string | null,
  frontmatter: string | null,
): Promise<"created" | "updated" | "noop">
```

**Algorithm in `readSplice`:**
1. Try `fs.readFile(filePath)`. If ENOENT, create parent dirs, write fresh file (prepend `frontmatter` if set, then marker block).
2. If file exists, scan for `START` + `END` markers.
3. If markers found: splice the content between them (idempotent — same content = "noop", different content = "updated").
4. If markers NOT found: append the block (with `heading` if set) to the existing file.

**Why this handles both `.cursor/rules/*.mdc` and plain markdown:** The frontmatter distinction is purely at creation time. For existing files both formats use the same marker-splice algorithm. The `heading` field handles whether a section header is injected before the markers.

**Directory creation:** `fs.mkdir(dir, { recursive: true })` before write — covers `.cursor/rules/` which may not exist.

---

## Q5: Markdown Warnings Surfacing

### Current state

`renderMarkdown(tree, _envelope): string` — the `_envelope` parameter is named with `_` prefix, explicitly ignoring it. Warnings are dropped silently.

`renderJson(tree, envelope): Envelope` — passes the whole envelope through including `envelope.warnings[]`.

### Recommended change

Modify `renderMarkdown` signature to actually consume `envelope.warnings`:

```typescript
// src/renderers/markdown.ts — modified export
export function renderMarkdown(tree: TreeNode, envelope: Envelope): string {
  const lines: string[] = [];
  // Warnings block (if any) — rendered before the tree
  if (envelope.warnings.length > 0) {
    lines.push("<!-- warnings:");
    for (const w of envelope.warnings) lines.push(`  - ${w}`);
    lines.push("-->");
    lines.push("");
  }
  walk(tree, "", true, true, lines);
  return lines.join("\n");
}
```

**Placement: above the tree, as an HTML comment block.** Rationale:
- Agents reading markdown see warnings before the tree, not after — context before data.
- HTML comment syntax is invisible to most markdown renderers but readable by LLMs in raw form.
- Alternative (footer): warnings after a long tree get truncated by token windows.
- Alternative (`>` blockquote): visually noisier, harder to strip programmatically.

**Affect on JSON output:** None. `renderJson` already includes `envelope.warnings` in the returned envelope. No change to `src/renderers/json.ts`.

**Affect on existing tests:**
- `test/renderers/markdown.test.ts` uses fixtures from `test/fixtures/ir/` — all four fixtures have `warnings: []`. Existing snapshots are not invalidated by this change.
- The `_envelope` rename to `envelope` is the only call-site signature change. The four MCP tool handlers call `renderMarkdown(tree, envelope)` — the argument was already passed, just ignored. No call-site changes needed.
- New test needed: a fixture with `warnings: ["some warning"]` to assert the HTML comment block appears in output and precedes the tree root line.

**Blast radius: minimal.** One function body change in `src/renderers/markdown.ts`. No type changes. No IR changes.

---

## Q6: True `line` for Resolved Component Nodes

### Root cause

In `src/core/Analyzer.ts`, function `resolveComponentCallsites()` around line 299:
```typescript
if (result.ok && result.kind === "local") {
  return {
    ...tree,
    children: newChildren,
    file: toForwardSlash(result.absolutePath),
    line: 1,   // <- placeholder: ResolveResult carries no line info
  };
}
```

`ResolveResult` is defined in `src/adapters/types.ts` line 259:
```typescript
export type ResolveResult =
  | { ok: true; kind: "local"; absolutePath: string }
  | { ok: true; kind: "external"; packageName: string }
  | ...
```

The `local` variant has only `absolutePath` — no `line` or `column`.

### Recommended fix: add `line` to `ResolveResult` local variant

```typescript
// src/adapters/types.ts — modified
export type ResolveResult =
  | { ok: true; kind: "local"; absolutePath: string; line: number }  // add line
  | { ok: true; kind: "external"; packageName: string }
  | { ok: false; kind: "cycle"; chain: string[] }
  | { ok: false; kind: "not-found"; specifier: string; tried: string[] }
  | { ok: false; kind: "ambiguous"; specifier: string; candidates: string[] };
```

The `line` is the line of the **export declaration** in the resolved file, not the import site. This is the most useful value: it points the agent directly to where the component is defined.

### How to populate `line` in the resolver

The resolver (`src/core/resolver/index.ts`) already parses the resolved file to chase barrels (`parseFile(ctx, fileResult.absolutePath)`). After confirming `foundLocal = true`, it has the parsed AST. A second targeted traverse finds the declaration line:

```typescript
// In doResolve(), after foundLocal = true is confirmed:
let declarationLine = 1; // fallback
traverse(parsed.ast, {
  FunctionDeclaration(p) {
    if (p.node.id?.name === importedName) declarationLine = p.node.loc?.start.line ?? 1;
  },
  VariableDeclarator(p) {
    if (t.isIdentifier(p.node.id) && p.node.id.name === importedName)
      declarationLine = p.node.loc?.start.line ?? 1;
  },
  ClassDeclaration(p) {
    if (p.node.id?.name === importedName) declarationLine = p.node.loc?.start.line ?? 1;
  },
  ExportDefaultDeclaration(p) {
    if (importedName === "default") declarationLine = p.node.loc?.start.line ?? 1;
  },
});
return { ok: true, kind: "local", absolutePath: fileResult.absolutePath, line: declarationLine };
```

**Babel AST guarantees `loc`** when `@babel/parser` is invoked without `{ loc: false }`. The existing `parseFile` does not disable `loc`, so `node.loc.start.line` is always populated.

**Barrel chase path:** `chaseBarrel` in `src/core/resolver/barrel.ts` returns a `ResolveResult`. It must also add `line` when it resolves to a local file. The barrel chase ends when `foundLocal` is true in the target file — same pattern applies.

### Blast radius: all call sites of `ResolveResult { ok: true; kind: "local" }`

Every location that reads `result.absolutePath` from a successful local resolution:

| File | Location | Change required |
|------|----------|-----------------|
| `src/core/Analyzer.ts` | `resolveComponentCallsites()` line ~300 | Change `line: 1` to `line: result.line` |
| `src/core/resolver/index.ts` | `resolveSpecifierToFile()` — two return sites emitting `{ ok: true, kind: "local", absolutePath: fwd }` | Add `line: 1` structural placeholder — these are intermediate results not consumed by `resolveComponentCallsites` directly |
| `src/core/resolver/barrel.ts` | `chaseBarrel()` — return sites | Add `line` from declaration traverse |
| `src/adapters/next/NextJsAdapter.ts` | `resolveModule()` delegates to `coreResolveModule` — no direct construction | No change at this layer |
| `test/core/resolver/barrel.test.ts` | Assertions on `result` objects | Add `line` to expected shapes or switch to `toMatchObject()` |
| `test/core/resolver/relative.test.ts` | Assertions on `result` objects | Same — add `line` or use `toMatchObject()` |
| `test/core/resolver/tsconfig-paths.test.ts` | Assertions on `result` objects | Same |

**Specifier-only results (`resolveSpecifierToFile`):** These are intermediate results used as inputs to barrel-chase and `doResolve`. They are never returned as the final `ResolveResult` to `resolveComponentCallsites` — only `doResolve`'s return value is. So `resolveSpecifierToFile` can keep `line: 1` as a structural placeholder without behavioral regression.

**The critical path is:** `doResolve` return when `foundLocal` -> `chaseBarrel` returns -> `resolveComponentCallsites` receives and writes to `TreeNode.line`.

**`column` field:** Not recommended for v1.1. The v1.0 wire protocol has no column on `TreeNode` (not in `src/ir/schema.ts`), and adding column to `ResolveResult` without surfacing it on `TreeNode` gains nothing. Defer to v1.2 if agents need column-level precision.

---

## Q7: Markdown Integration Tests

### Current state

`test/integration/mcp-e2e.test.ts` spawns `dist/cli.js` via `StdioClientTransport`. Every tool invocation passes `format: "json"` (hardcoded in all four `FixtureInvariants.argsFor()` methods). The test parses the response as JSON via `EnvelopeSchema.parse()` and asserts structural invariants.

The unit-level markdown tests (`test/renderers/markdown.test.ts`) call `renderMarkdown` directly with IR fixtures — they do not exercise the full MCP request/response pipeline.

### Assessment: existing harness supports format: "markdown" with minimal changes

The integration test spawns the binary and calls tools via the MCP client. The response is a `{ content: [{ type: "text", text: string }] }` object. For `format: "json"`, `text` is a JSON string that gets parsed. For `format: "markdown"`, `text` is a markdown string.

A markdown integration test case does NOT need `EnvelopeSchema.parse()`. Instead:
- Assert `result.isError` is falsy
- Assert `result.content[0].text` is a non-empty string
- Assert structural markers: ` @ ` (file:line separator), tree glyphs (`├──` / `└──`), the root component name

### Recommended approach: add markdown assertions inside the existing `makeFixtureSuite` factory

Rather than a new harness, extend `makeFixtureSuite` with an additional `it` block per fixture. This keeps all per-fixture integration state (client, transport, stderrChunks) in scope:

```typescript
// In mcp-e2e.test.ts, inside makeFixtureSuite — add after the existing tool loop:
it(
  "get_full_hierarchy: markdown format returns tree glyphs and file:line",
  async () => {
    const result = await client.callTool({
      name: "get_full_hierarchy",
      arguments: { ...invariants.argsFor("get_full_hierarchy", fixturePath), format: "markdown" },
    });
    expect(result.isError).toBeFalsy();
    const text = (result as { content: Array<{ type: string; text?: string }> })
      .content.find(c => c.type === "text")?.text ?? "";
    expect(text).toContain(" @ ");
    expect(text.length).toBeGreaterThan(10);
    // At least one tree glyph present:
    expect(text.match(/[├└]/)).toBeTruthy();
  },
  30_000,
);
```

**Why not snapshot the full markdown output in the integration suite:** The integration fixture projects' exact tree output will change whenever the parser changes. Snapshot-asserting the full markdown would make every parser improvement fail the integration test. Structural assertions (glyphs, ` @ ` separator, non-empty) are more durable.

**Snapshot tests for markdown format belong in `test/renderers/markdown.test.ts`** (already exist for IR fixtures). For the new warnings-surfacing behavior, add an IR fixture with `warnings: ["w1"]` and snapshot-assert it.

**New fixture needed:** `test/fixtures/ir/with-warnings.ts` — one fixture that produces a non-empty `warnings` array to test the HTML comment block in markdown output.

---

## Component Boundaries — New vs Modified

### New components (v1.1)

| Component | Path | Purpose |
|-----------|------|---------|
| Init orchestrator | `src/init/index.ts` | `runInit()` — validates targets, iterates, writes |
| Target config | `src/init/targets.ts` | `TARGET_MAP` data, `TargetConfig` interface |
| File mutator | `src/init/mutator.ts` | `readSplice()` idempotent marker-splice writer |
| Template | `src/init/template.ts` | `GUIDE_CONTENT` string constant |
| Warnings fixture | `test/fixtures/ir/with-warnings.ts` | IR fixture with non-empty warnings array |

### Modified components (v1.1)

| Component | Path | Change | Risk |
|-----------|------|--------|------|
| CLI entry | `src/cli.ts` | Argv dispatch (if/else + dynamic import) | Low — existing path unchanged |
| ResolveResult type | `src/adapters/types.ts` | Add `line: number` to local variant | Medium — TypeScript-enforced blast radius |
| doResolve | `src/core/resolver/index.ts` | Populate `line` from declaration traverse | Medium — new traverse pass in existing function |
| resolveSpecifierToFile | `src/core/resolver/index.ts` | Add `line: 1` to satisfy updated type | Low — structural only |
| chaseBarrel | `src/core/resolver/barrel.ts` | Add `line` to terminal resolution | Medium — must audit barrel.ts return sites |
| resolveComponentCallsites | `src/core/Analyzer.ts` | Change `line: 1` to `line: result.line` | Low — one field change |
| renderMarkdown | `src/renderers/markdown.ts` | Consume `envelope.warnings` | Low — additive body change |
| Integration test | `test/integration/mcp-e2e.test.ts` | Add markdown format assertions | Low — additive |
| Resolver unit tests | `test/core/resolver/*.test.ts` | Update local result assertions for `line` | Low — update toMatchObject calls |

---

## Data Flow Changes

### Init flow (new)

```
process.argv
  -> cli.ts (--init detected)
  -> dynamic import("./init/index.js")
  -> runInit({ targets, cwd })
  -> targets.ts: TARGET_MAP lookup + validation
  -> for each target: mutator.ts readSplice(resolvedPath, GUIDE_CONTENT, heading, frontmatter)
    -> node:fs/promises: readFile -> splice -> writeFile
  -> process.stderr: human-readable success/skip/error messages
  -> process.exit(0)
```

No MCP SDK, no Babel, no zod touched.

### True line flow (modified)

```
resolveComponentCallsites() [Analyzer.ts]
  -> adapter.resolveModule() -> coreResolveModule()
  -> doResolve() [resolver/index.ts]
    -> resolveSpecifierToFile() -> { ok:true, kind:"local", absolutePath, line:1 }
    -> parseFile(ctx, absolutePath) [already done for barrel check]
    -> traverse AST for declaration line [NEW]
    -> return { ok:true, kind:"local", absolutePath, line: N }  [NEW field]
  OR:
    -> chaseBarrel() [barrel.ts]
    -> ... -> final file parse -> declaration line [NEW]
    -> return { ok:true, kind:"local", absolutePath, line: N }
  <- result.line consumed: TreeNode.line = result.line  [was hardcoded: 1]
```

### Markdown warnings flow (modified)

```
MCP tool handler
  -> Analyzer.query()
  -> envelope { warnings: [...] }
  -> renderMarkdown(tree, envelope)  [was: _envelope ignored]
  -> if envelope.warnings.length > 0: prepend HTML comment block
  -> return markdown string with warnings above tree
```

---

## Recommended Build Order

Dependencies between the four v1.1 items:

```
(D) --init subcommand    -- fully independent
(A) true line fix        -> (B) markdown integration tests (lines now real)
(C) warnings surface     -> (B) markdown integration tests (warnings assertions)
```

**Sequence:**

**Step 1 — `--init` subcommand** (independent, zero regression risk)
Create `src/init/` island. Extend `src/cli.ts` with argv dispatch. Write unit tests for `readSplice` (marker present/absent/idempotent) and `runInit` (target validation, file creation, directory creation for `.cursor/rules/`). Validates new cli.ts dispatch pattern without touching any existing MCP or parser code.

**Step 2 — True `line` fix**
Start at `src/adapters/types.ts` (type change) — TypeScript immediately surfaces all sites requiring `line`. Fix `resolveSpecifierToFile` (add `line: 1` placeholder), then `doResolve` (add declaration traverse), then `chaseBarrel` (propagate line). Finally update `resolveComponentCallsites` in `Analyzer.ts` to consume `result.line`. Run `pnpm typecheck` between each file change to verify blast radius is fully addressed. Update resolver unit tests last.

**Step 3 — Markdown warnings surface**
Rename `_envelope` to `envelope` in `renderMarkdown`. Add the warnings block render. Add `test/fixtures/ir/with-warnings.ts`. Update `test/renderers/markdown.test.ts` with a new snapshot case. No compiler errors expected.

**Step 4 — Markdown integration tests**
Extend `test/integration/mcp-e2e.test.ts` with markdown format assertions inside `makeFixtureSuite`. This is the only step that requires a fresh `pnpm build` before running. Benefits from both Step 2 (real lines in markdown output) and Step 3 (warnings visible in markdown).

**Parallelism:** Steps 1, 2, and 3 are safe to develop in parallel by separate developers. Step 4 depends on both 2 and 3.

---

## Anti-Patterns to Avoid

### Writing to stdout in --init mode
**What goes wrong:** `startServer()` reserves stdout for MCP JSON-RPC. Even though init exits before connecting a transport, init output on stdout confuses any wrapper that captures stdout generically.
**Instead:** All init human-readable output goes to `process.stderr`. Success status: exit code 0. Failure: exit code 1 with error on stderr.

### init importing from src/mcp/ or src/core/
**What goes wrong:** Pulls in Babel, MCP SDK, and zod at init time. Increases cold-start latency for a write-file operation that needs none of these.
**Instead:** `src/init/` has zero imports outside `node:` built-ins and its own files. Add an island assertion test similar to `test/architecture/island.test.ts` if the init module grows beyond 4 files.

### Snapshot-asserting full markdown output in integration tests
**What goes wrong:** Any parser change (new node kind, new layoutHint, fixture file edit) invalidates the snapshot — high maintenance overhead for integration-level tests.
**Instead:** Structural assertions in integration tests (`toContain(" @ ")`, glyph regex, length > 0). Full snapshots only in `test/renderers/markdown.test.ts` against stable IR fixtures.

### Eager `line` resolution in `resolveSpecifierToFile`
**What goes wrong:** `resolveSpecifierToFile` is called as an intermediate step during barrel chase. Parsing the file for a declaration line at this stage is wasteful — the file may be a barrel that re-exports elsewhere.
**Instead:** Only `doResolve` (when `foundLocal = true`) and the terminal step of `chaseBarrel` resolve the declaration line. Intermediate `resolveSpecifierToFile` results stay as `line: 1`.

### Adding `column` to TreeNode for v1.1
**What goes wrong:** `TreeNode` in `src/ir/schema.ts` is the wire contract. Adding `column` is an additive breaking change for consumers that match the schema exhaustively.
**Instead:** `line` only for v1.1. `column` is a v1.2 decision when a concrete agent need arises.

### Using a separate tsup entry for src/init/
**What goes wrong:** A separate entry produces a separate `dist/init.js` file that needs to be included in `package.json "files"` and referenced with `import.meta.url` path gymnastics.
**Instead:** Single entry `src/cli.ts` with dynamic `import("./init/index.js")` — tsup follows the import and bundles `src/init/` into `dist/cli.js`. Zero config change.

### Runtime fs.readFile for the template asset
**What goes wrong:** Paths break across dev (`tsx src/cli.ts`), built (`node dist/cli.js`), and global install (`npx`) because tsup bundles everything into a single flat `dist/cli.js` with no adjacent asset files.
**Instead:** TypeScript string constant in `src/init/template.ts`. Bundled inline. Zero path resolution needed.

---

## Scalability Considerations

| Concern | v1.1 scope | Future |
|---------|-----------|--------|
| Template content growth | String constant — no size issue for foreseeable future | If > 5KB, consider externalize with `import.meta.url` path, but not needed now |
| New `--init` targets | Add entry to `TARGET_MAP` — O(1) change | No architectural change required for 10+ targets |
| `line` traverse performance | One extra AST traverse per resolved component per query call. Cache is already `per-call` (ParseContext.astCache) so no extra file reads. Acceptable for v1.1 (parse-on-demand). | If hot, combine `foundLocal` traverse and declaration-line traverse into a single pass |
| Warnings in large trees | HTML comment block is O(warnings.length) lines — trivial | No concern |

---

## Sources

- `src/cli.ts` (v1.0) — confirmed 3-line direct boot, no framework
- `src/mcp/server.ts` — `createServer()` / `startServer()` separation, `__TOOL_VERSION__` define
- `src/adapters/types.ts` lines 259-264 — `ResolveResult` definition, `local` variant fields
- `src/core/Analyzer.ts` lines 135-160 — `ImportBinding`, `collectImportBindings()`
- `src/core/Analyzer.ts` lines 256-314 — `resolveComponentCallsites()`, `line: 1` placeholder with explanatory comment
- `src/core/resolver/index.ts` — `resolveSpecifierToFile()`, `doResolve()`, call structure
- `src/renderers/markdown.ts` — `renderMarkdown(tree, _envelope)` with `_envelope` ignored
- `src/renderers/json.ts` — `renderJson` passes envelope through including `warnings`
- `test/integration/mcp-e2e.test.ts` — `format: "json"` hardcoded in all four `FixtureInvariants.argsFor()` methods
- `test/architecture/island.test.ts` — D-11 island enforcement pattern; template for `src/init/` island assertion
- `test/renderers/markdown.test.ts` — existing file-snapshot harness; all fixtures use `warnings: []`
- `tsup.config.ts` — single entry `src/cli.ts`, ESM-only, externals list; no change needed for init
- `package.json` — `"bin": { "ui-hierarchy-mcp": "dist/cli.js" }`, `"type": "module"`
