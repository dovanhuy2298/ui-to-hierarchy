# Phase 5: IR Queries & Tool Wire-up — Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 12 (1 new core file, 4 modified tool handlers, 7 new test/fixture files)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/Analyzer.ts` (NEW) | orchestrator/service | request-response (per-call instance) | `src/adapters/next/NextJsAdapter.ts` (extractComponents orchestration) + `src/core/parser/index.ts` (per-call cache through ctx) | role-match (no existing single-class orchestrator) |
| `src/mcp/tools/get-full-hierarchy.ts` (MODIFY) | controller (MCP handler) | request-response | self (Phase 2 stub — fill body) | exact (preserve schema, replace `notImplemented`) |
| `src/mcp/tools/focus-on.ts` (MODIFY) | controller (MCP handler) | request-response | self (Phase 2 stub) | exact |
| `src/mcp/tools/find-by-text.ts` (MODIFY) | controller (MCP handler) | request-response | self (Phase 2 stub) | exact |
| `src/mcp/tools/find-by-style.ts` (MODIFY) | controller (MCP handler) | request-response | self (Phase 2 stub) | exact |
| `test/core/analyzer.test.ts` (NEW) | unit test | direct API invocation | `test/adapters/next/NextJsAdapter.kitchen-sink.test.ts` + `test/adapters/next/runtime.test.ts` | exact (same fixture-driven pattern) |
| `test/mcp/tools/get-full-hierarchy.test.ts` (NEW) | integration test | InMemoryTransport client→server | `test/mcp/server.test.ts` | exact (Tier 1 InMemoryTransport pattern) |
| `test/mcp/tools/focus-on.test.ts` (NEW) | integration test | InMemoryTransport | `test/mcp/server.test.ts` | exact |
| `test/mcp/tools/find-by-text.test.ts` (NEW) | integration test | InMemoryTransport | `test/mcp/server.test.ts` | exact |
| `test/mcp/tools/find-by-style.test.ts` (NEW) | integration test | InMemoryTransport | `test/mcp/server.test.ts` | exact |
| `test/fixtures/phase-05/kitchen-sink/**` (NEW) | fixture | file I/O | `test/fixtures/next-app-router/**` | exact (real on-disk Next.js project) |
| `test/fixtures/phase-05/micro/{parse-error,mutation-test}/**` (NEW) | fixture | file I/O | `test/fixtures/parser/parse-errors/syntax-error.tsx` + `test/fixtures/next-app-router/app/page.tsx` | exact |

## Pattern Assignments

### `src/core/Analyzer.ts` (orchestrator, request-response, NEW)

**Primary analog:** `src/adapters/next/NextJsAdapter.ts` (extractComponents — orchestrates parseFile + walkRenderFlow + per-component build).
**Secondary analog:** `src/core/parser/index.ts` (per-call cache pattern via ctx).

**Imports pattern** (analog `src/adapters/next/NextJsAdapter.ts` lines 19–40 — note: type-only imports from `src/adapters/types.js` are permitted by the island rule, runtime imports must go through `FrameworkAdapter`):
```typescript
import * as t from "@babel/types";
import type {
  ComponentDefinition,
  ParseContext,
  RenderNode,
  RouteMatch,
} from "../adapters/types.js";  // type-only — island-safe
import type { FrameworkAdapter } from "../adapters/FrameworkAdapter.js";  // type-only
import type { TreeNode, Envelope } from "../ir/index.js";
import { toForwardSlash } from "./paths.js";
```

**Per-call ParseContext construction** (copy from `test/adapters/next/NextJsAdapter.kitchen-sink.test.ts` lines 8–16, which is the canonical shape):
```typescript
function newParseContext(resolvedRoot: string): ParseContext {
  return {
    resolvedRoot,
    tsconfig: null,                 // Phase 5 may load via get-tsconfig if needed for resolution
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}
```

**Class shape (D-01 single-file orchestrator) — no existing class analog. Synthesize from Phase 3/4 functional patterns:**
```typescript
export class Analyzer {
  private readonly ctx: ParseContext;
  private readonly adapter: FrameworkAdapter;
  private readonly root: string;
  // D-12 style sidecar — instance field, NOT static.
  private readonly styleIndex = new Map<string, { classNames: string[]; styleKeys: string[] }>();
  // Optional within-call route memoization (Claude's Discretion).
  private readonly routeTreeCache = new Map<string, TreeNode>();

  constructor(opts: { root: string; adapter: FrameworkAdapter }) {
    this.root = opts.root;
    this.adapter = opts.adapter;
    this.ctx = {
      resolvedRoot: opts.root,
      tsconfig: null,
      astCache: new Map(),
      resolverCache: new Map(),
      warnings: [],
    };
  }

  async getFullHierarchy(args: { route: string }): Promise<{ tree: TreeNode; warnings: string[] }> { /* ... */ }
  async focusOn(args: { component: string; scope: "up"|"full"|"down" }): Promise<...> { /* ... */ }
  async findByText(args: { query: string }): Promise<...> { /* ... */ }
  async findByStyle(args: { class_or_prop: string }): Promise<...> { /* ... */ }
}
```

**Forward-slash discipline** (copy `src/adapters/next/NextJsAdapter.ts` line 71): every `file:` field at IR boundary passes through `toForwardSlash(absPath)` before construction of the TreeNode. Definition pattern from `src/core/paths.ts` lines 15–17.

**RenderNode → TreeNode translation pattern** (no existing analog — synthesize per D-04/D-05/D-06). The mechanical structure of recursing on a discriminated union is established in `src/core/render-flow/index.ts` lines 25–76 (the `walk` function). Copy that switch shape:
```typescript
function renderNodeToTreeNode(rn: RenderNode, runtimeMap: Map<string,"client"|"server">): TreeNode {
  switch (rn.kind) {
    case "jsx":
      if (rn.isComponent) {
        const layoutHint = runtimeMap.get(rn.tag) === "client" ? "client" : undefined;
        return {
          kind: "component",
          name: rn.tag,
          children: rn.children.map(c => renderNodeToTreeNode(c, runtimeMap)),
          file: rn.file,
          line: rn.line,
          ...(layoutHint ? { layoutHint } : {}),
        };
      }
      return { kind: "element", tag: rn.tag, children: rn.children.map(...), file: rn.file, line: rn.line };
    case "text":     return { kind: "text", value: rn.value, file: rn.file, line: rn.line };
    case "branch":   return { kind: "branch", condition: rn.condition, thenBranch: rn.thenBranch ? renderNodeToTreeNode(rn.thenBranch, runtimeMap) : null, elseBranch: rn.elseBranch ? renderNodeToTreeNode(rn.elseBranch, runtimeMap) : null, file: rn.file, line: rn.line };
    case "list":     return { kind: "list", item: renderNodeToTreeNode(rn.item, runtimeMap), file: rn.file, line: rn.line };
    case "fragment": return { kind: "fragment", children: rn.children.map(...), file: rn.file, line: rn.line };
    case "spread":   return { kind: "spread", expression: rn.expression, file: rn.file, line: rn.line };
    case "error":    return { kind: "error", message: rn.message, file: rn.file, line: rn.line };
  }
}
```

**Error-shape, no-throw pattern** (copy `src/adapters/next/NextJsAdapter.ts` lines 73–96 — synthetic `kind:"error"` definition for parse failures; replicate at the IR layer to satisfy R8). Pattern is: encounter error → construct `kind:"error"` TreeNode → push diagnostic message to `ctx.warnings` → continue.

**Style sidecar JsxAttribute scan** (D-13 source — copy attribute reading pattern from `src/core/render-flow/index.ts` lines 134–154 where `JsxAttribute[]` is built; reverse the read to extract literals):
```typescript
// For each kind:"jsx" RenderNode encountered during translation:
const key = `${rn.file}:${rn.line}:${rn.tag}`;
const classNames: string[] = [];
const styleKeys: string[] = [];
for (const attr of rn.attributes) {
  if (attr.name === "className" && attr.value.kind === "literal" && typeof attr.value.value === "string") {
    classNames.push(...attr.value.value.split(/\s+/).filter(Boolean));
  }
  if (attr.name === "style" && attr.value.kind === "expression") {
    // Babel parseExpression(attr.value.source) to extract top-level keys; on failure, drop silently per D-14.
  }
}
this.styleIndex.set(key, { classNames: dedup(classNames), styleKeys });
```

**Slot-substitution algorithm** (D-09 inside-out wrap — no existing analog; SPEC-locked algorithm):
```typescript
let tree = await this.buildTreeForEntry(pageEntry);
for (const layoutEntry of [...routeMatch.entries.layouts].reverse()) {
  const layoutTree = await this.buildTreeForEntry(layoutEntry);
  tree = replaceSlot(layoutTree, "children", tree);
}
// Then attach parallel-route slots (D-10) as siblings inside parent layout's component children,
// children-slot first, then lexicographic by slot name.
```

**Levenshtein** (D-03 inline private function ≤30 LOC — no analog needed; standard DP):
```typescript
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      curr.push(Math.min(curr[j-1] + 1, prev[j] + 1, prev[j-1] + cost));
    }
    prev = curr;
  }
  return prev[n]!;
}
```

**No-throw constraint** (analog `src/adapters/next/NextJsAdapter.ts` lines 73–96 + `src/core/parser/index.ts` lines 32–56): every failure path inside `Analyzer` returns shape, never throws. Programming bugs (only) propagate up to `withErrorBoundary`.

---

### `src/mcp/tools/get-full-hierarchy.ts` (controller, request-response, MODIFY)

**Analog:** self (current Phase 2 stub) — preserve schema + `withErrorBoundary` shell, replace body.

**Imports pattern** (current lines 1–6) — extend with renderers + Analyzer + envelope-builder:
```typescript
import { z } from "zod";
import { withErrorBoundary } from "../errors.js";
import type { ToolResponse } from "../errors.js";
import { resolveRoot } from "../../core/resolve-root.js";
import { projectRootSchema } from "./common.js";
import { Analyzer } from "../../core/Analyzer.js";
import { NextJsAdapter } from "../../adapters/next/NextJsAdapter.js";
import { buildEnvelope } from "../../renderers/envelope-builder.js";
import { renderMarkdown, renderJson } from "../../renderers/index.js";
```

**Schema** (lines 12–28) — UNCHANGED. Phase 2 lock.

**Handler body skeleton** (replace `notImplemented(name)` per the SPEC R1 target — the canonical shape per `<specifics>` section in CONTEXT: "resolveRoot → new Analyzer → analyzer.<query>(args) → buildEnvelope → render by format"):
```typescript
export async function handler(args: z.infer<typeof inputSchema>): Promise<ToolResponse> {
  return withErrorBoundary(name, async () => {
    const root = resolveRoot(args.projectRoot);
    const analyzer = new Analyzer({ root, adapter: NextJsAdapter });
    const { tree, warnings } = await analyzer.getFullHierarchy({ route: args.route });
    const envelope: Envelope = { ...buildEnvelope(tree, { resolvedRootOverride: root }), warnings };
    if (args.format === "json") {
      return { content: [{ type: "text", text: JSON.stringify(renderJson(tree, envelope), null, 2) }] };
    }
    return { content: [{ type: "text", text: renderMarkdown(tree, envelope) }] };
  });
}
```

**Envelope construction** — copy from `src/renderers/envelope-builder.ts` lines 30–43 (do NOT re-implement; pass `resolvedRootOverride: root` so `resolveRoot()` is not called twice). The default `warnings: []` field must be replaced with the analyzer's accumulated warnings.

**No-throw rule** (`src/mcp/errors.ts` lines 55–64): the inner body must never throw on user-data errors. Unknown route, parse errors, zero matches → return populated envelope. Only programming bugs surface via `withErrorBoundary` → `internalError`.

---

### `src/mcp/tools/focus-on.ts` (controller, request-response, MODIFY)

**Analog:** same as get-full-hierarchy. Identical shell.

**Differences from get-full-hierarchy:**
- No `format` param in this tool's schema (verify Phase 2 lock — current schema lines 12–26 has only `component`, `scope`, `projectRoot`). So always render markdown? Re-read the SPEC: SPEC R2 mentions markdown output but does not lock format param. **Planner decision required:** if Phase 2 schema omits `format`, default to markdown only; do NOT extend schema (Phase 2 lock).
- Calls `analyzer.focusOn({ component: args.component, scope: args.scope })`.

```typescript
const { tree, warnings } = await analyzer.focusOn({
  component: args.component,
  scope: args.scope,
});
```

The result's `tree.kind === "fragment"` per SPEC R6 (synthetic fragment root). The markdown renderer already handles fragments transparently (`src/renderers/markdown.ts` lines 34–35 + 78–92).

---

### `src/mcp/tools/find-by-text.ts` and `src/mcp/tools/find-by-style.ts` (controller, request-response, MODIFY)

**Analog:** same as focus-on. Identical thin-handler pattern.

**Differences:**
- `find-by-text`: dispatch to `analyzer.findByText({ query: args.query })`. Levenshtein fallback warnings end up in `envelope.warnings` (SPEC R3 acceptance: `did you mean: "Submit" @ <file>:<line>`).
- `find-by-style`: dispatch to `analyzer.findByStyle({ class_or_prop: args.class_or_prop })`. Dedup by `${file}:${line}:${tag}` per D-12.

---

### `test/core/analyzer.test.ts` (unit test, NEW)

**Analog:** `test/adapters/next/NextJsAdapter.kitchen-sink.test.ts` (exact role + data flow match).

**Imports + ctx helper** (analog lines 1–16):
```typescript
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Analyzer } from "../../src/core/Analyzer.js";
import { NextJsAdapter } from "../../src/adapters/next/NextJsAdapter.js";

const KS = path.resolve("test/fixtures/phase-05/kitchen-sink");

describe("Analyzer.getFullHierarchy", () => {
  it("nests 3-tier layouts with slot substitution", async () => {
    const a = new Analyzer({ root: KS, adapter: NextJsAdapter });
    const { tree, warnings } = await a.getFullHierarchy({ route: "/dashboard/settings" });
    // assertions per SPEC R1 acceptance
  });
});
```

**Mutation test for ARCH-02** (D-02 verification — analog `test/core/parser/parseFile.test.ts` for the per-call cache pattern; SPEC R5 acceptance):
```typescript
it("two consecutive calls with mutation observe the new content (no cross-call cache)", async () => {
  const FX = path.resolve("test/fixtures/phase-05/micro/mutation-test");
  const PAGE = path.join(FX, "app/page.tsx");
  const original = readFileSync(PAGE, "utf8");
  try {
    const a1 = new Analyzer({ root: FX, adapter: NextJsAdapter });
    const r1 = await a1.getFullHierarchy({ route: "/" });
    writeFileSync(PAGE, original.replace("Hello", "Mutated"));
    const a2 = new Analyzer({ root: FX, adapter: NextJsAdapter });
    const r2 = await a2.getFullHierarchy({ route: "/" });
    // assert r1 contains "Hello", r2 contains "Mutated"
  } finally {
    writeFileSync(PAGE, original);
  }
});
```

**Static-analysis grep test** (SPEC R5 acceptance):
```typescript
it("zero static fields and zero module-scope cache variables in Analyzer.ts", async () => {
  const text = await readFile("src/core/Analyzer.ts", "utf8");
  expect(text).not.toMatch(/static\s+\w+\s*[:=]/);
  // module-scope `let cache` / `const cache` outside the class body
  expect(text).not.toMatch(/^\s*(let|const)\s+cache/m);
});
```

**Snapshot strategy** — copy from `test/renderers/markdown.test.ts` lines 12–20 (`toMatchFileSnapshot` for markdown, `toMatchInlineSnapshot` for small JSON). D-21 lock.

---

### `test/mcp/tools/*.test.ts` (integration tests, NEW)

**Analog:** `test/mcp/server.test.ts` (Tier 1 — InMemoryTransport with `Client` + `createServer`).

**Test pair helper** (copy verbatim from analog lines 14–30):
```typescript
async function createTestPair() {
  const server = createServer();
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return { server, client, cleanup: () => client.close() };
}
```

**Tool-call pattern + envelope assertion**:
```typescript
const result = await pair.client.callTool({
  name: "get_full_hierarchy",
  arguments: { route: "/dashboard/settings", format: "json", projectRoot: KS },
});
const r = asToolResponse(result);
expect(r.isError).toBeFalsy();
const envelope = JSON.parse(firstText(r));
expect(() => EnvelopeSchema.parse(envelope)).not.toThrow();
```

`asToolResponse` + `firstText` from `test/helpers.ts` lines 9–27 — reuse, do not re-define.

**No-throw assertions** (SPEC R8 acceptance):
- `route: "/does-not-exist"` → `r.isError` falsy, envelope has `tree.children: []`, `warnings[0]` matches `/route not matched/`.
- Fixture with syntax error → `kind:"error"` node appears in union tree, call still returns success.

---

### Fixtures: `test/fixtures/phase-05/kitchen-sink/**` and `test/fixtures/phase-05/micro/**` (NEW)

**Analog:** `test/fixtures/next-app-router/**` (exact match — real on-disk Next.js App Router project).

**Directory shape pattern** (analog files):
- `app/layout.tsx` — root layout with `<html><body>{children}</body></html>` (literal copy from `test/fixtures/next-app-router/app/layout.tsx` line 1–3).
- `app/(group)/layout.tsx`, `app/(group)/dashboard/layout.tsx` — nested layouts with `{children}` slot.
- `app/(group)/dashboard/settings/page.tsx` — terminal page.
- `app/@modal/login/page.tsx` — parallel route slot (analog `test/fixtures/next-app-router/app/@modal/login/page.tsx` line 1: `export default function ModalLogin() { return <div>modal-login</div>; }`).
- One file with `"use client"` directive (analog `test/fixtures/next-app-router/app/(marketing)/about/page.tsx` per `runtime.test.ts` line 22).
- One file without directive (server-runtime peer).

**Parse-error micro-fixture** (analog `test/fixtures/parser/parse-errors/syntax-error.tsx`): single `app/page.tsx` with a deliberate syntax error.

**Mutation-test micro-fixture**: minimal `app/layout.tsx` + `app/page.tsx` whose page content the test rewrites and restores in a `try/finally` block.

**No-backslash assertion** (analog `test/adapters/next/NextJsAdapter.test.ts` line 36): every emitted `file:` field must satisfy `!path.includes("\\")`.

---

## Shared Patterns

### Forward-slash discipline (D-07)
**Source:** `src/core/paths.ts` lines 15–17 (`toForwardSlash`) + `src/adapters/next/NextJsAdapter.ts` line 71 (apply at IR boundary).
**Apply to:** Every `file:` field constructed inside `Analyzer.ts` before it leaves into a `TreeNode`. Renderers do NOT re-normalize (markdown.ts/json.ts assume IR is already forward-slash).

### Per-call ParseContext (Phase 3 D-02 + ARCH-02)
**Source:** `test/adapters/next/NextJsAdapter.kitchen-sink.test.ts` lines 8–16 (canonical construction shape).
**Apply to:** `Analyzer` constructor. The ParseContext is an instance field; never module-level, never `static`. Pass it through every `adapter.extractComponents(ctx, ...)` call so per-call AST cache deduplicates re-entries within one tool invocation but never carries across calls.

### No-throw rule (D-12)
**Source:** `src/adapters/next/NextJsAdapter.ts` lines 73–96 (synthetic `kind:"error"` for parse failures) + `src/core/parser/index.ts` lines 32–56 (read/parse failures → `{ kind: "error" }` discriminated result).
**Apply to:** All four query methods on `Analyzer`. Every user-data error path returns shape; only programming bugs propagate up.

### withErrorBoundary wrap (D-07 from Phase 2)
**Source:** `src/mcp/errors.ts` lines 55–64 (`withErrorBoundary`).
**Apply to:** All four tool handler bodies. Already in place in current Phase 2 stubs (lines 31, 29, 24, 24 of the four tool files); preserve verbatim, replace the inner body only.

### Envelope construction (D-15)
**Source:** `src/renderers/envelope-builder.ts` lines 30–43 (`buildEnvelope`).
**Apply to:** All four handlers. Pass `resolvedRootOverride: root` so the already-resolved root is reused. Splice in the analyzer's accumulated `warnings` (overwrite the default `[]`).

### Adapter island runtime constraint (ARCH-01 / D-11)
**Source:** `test/architecture/island.test.ts` lines 19–35.
**Apply to:** `src/core/Analyzer.ts`. Type-only imports from `src/adapters/types.js` are permitted (regex `\bimport\s+(?!type\s)[^;]*?from\s+["'][^"']*\/adapters` excludes `import type`). Runtime use of `NextJsAdapter` happens in the **handler files** (`src/mcp/tools/*.ts`) which sit outside the island, then they pass it as `adapter: FrameworkAdapter` into the Analyzer constructor. The Analyzer itself may NOT `import { NextJsAdapter }`; only the type `FrameworkAdapter` is permitted (type-only import).

### Snapshot test strategy (D-21 / Phase 1)
**Source:** `test/renderers/markdown.test.ts` lines 12–20.
**Apply to:** `test/core/analyzer.test.ts` and `test/mcp/tools/*.test.ts`. Use `toMatchFileSnapshot('./__snapshots__/<case>.md')` for markdown; `toMatchInlineSnapshot` for small JSON cases.

### MCP-04 stdout discipline (Phase 2)
**Source:** PROJECT.md + Phase 2 D-08; enforced behaviorally.
**Apply to:** `Analyzer` and the four handlers. Never `console.log`. Diagnostics go to `Envelope.warnings` (in-band) or `process.stderr` via `src/mcp/log.ts` (out-of-band).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `Analyzer` class shape itself | orchestrator class | request-response | No existing class-shaped orchestrator in `src/core/`; existing pattern is pure functions threading `ParseContext`. Synthesize from `NextJsAdapter` (object-of-methods) + `ParseContext` (per-call state) — promote the implicit `ctx` thread to an explicit instance field. |
| Slot-substitution algorithm | utility (private to Analyzer) | transform | SPEC-locked algorithm (D-09 inside-out wrap); no precedent in the codebase. Build from scratch per the locked snippet in CONTEXT D-09. |
| Levenshtein fallback | utility (private) | transform | Standard DP, no analog needed. Hand-rolled per D-03 inline. |
| Style sidecar (`Map<file:line:tag, ...>`) | data structure | lookup | New v1 design (D-12). The keying convention `${file}:${line}:${tag}` is inspired by the unique-element-identity assumption baked into `walkRenderFlow`'s line tracking but no map-keyed sidecar exists yet. |

## Metadata

**Analog search scope:** `src/core/**`, `src/adapters/**`, `src/mcp/**`, `src/renderers/**`, `src/ir/**`, `test/**`.
**Files scanned:** ~45 source + test files.
**Pattern extraction date:** 2026-04-29.
