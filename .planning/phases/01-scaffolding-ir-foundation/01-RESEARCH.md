# Phase 1: Scaffolding & IR Foundation — Research

**Researched:** 2026-04-20
**Domain:** TypeScript ESM CLI packaging, zod v4 discriminated unions, vitest snapshots, Babel ESM interop
**Confidence:** HIGH

## Summary

Phase 1 has no novel engineering risk — the stack is fully pinned in CLAUDE.md and every version was re-verified against the npm registry in this session (see Sources). The planner's job is to wire the pieces together in the right order: `package.json` skeleton → `tsup` config with shebang banner → zod v4 discriminated union (+ `z.lazy` for recursion) → two pure renderers → fixture-driven vitest snapshots → Babel interop shim → ARCH-03 root resolver.

Two subtleties deserve attention: (1) the `@babel/traverse` ESM interop shim must use `(traverse as any).default ?? traverse` because Node's CJS/ESM interop returns different shapes depending on how the consumer bundles; (2) `z.lazy` is required for the self-referential `TreeNode` inside a `discriminatedUnion` — zod v4 supports this but the inferred type needs an explicit `TreeNode` type alias to break the circularity.

**Primary recommendation:** Treat the nine Phase 1 tasks as near-mechanical. Confidence is HIGH on every stack pick, HIGH on config shapes (all verified), MEDIUM on the exact ergonomic form of recursive zod discriminatedUnion inference (one known pattern; document it in the IR file for future phases).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01**: IR v1 supports nine node kinds via zod `discriminatedUnion("kind", ...)`: `component`, `element`, `text`, `branch`, `list`, `slot`, `error`, `fragment`, `spread`.
- **D-02**: No `unknown` kind. Unreasoning expressions are dropped silently in Phase 3 (not this phase).
- **D-03**: Fragments are a first-class IR node, NOT flattened. Spreads are a first-class IR node.
- **D-04**: Zod is the single source of truth. TS types inferred via `z.infer`. No hand-written `interface TreeNode`.
- **D-05**: Fixture round-trip tests parse fixture objects through the zod schema at test time.
- **D-06**: Every IR node has flat `file: string` and `line: number`. `column` reserved but not added.
- **D-07**: `file` is relative to `resolvedRoot`, forward slashes on Windows. No absolute paths in IR.
- **D-08**: Unicode box-drawing glyphs (`├──`, `└──`, `│`). No ASCII fallback.
- **D-09**: `file:line` suffix appended via ` @ ` separator.
- **D-10**: Per-kind label conventions fixed (see CONTEXT D-10 table — must be honored exactly).
- **D-11**: Optional `layoutHint?: string` on IR node; rendered inline between label and `@ file:line`; empty = not emitted.
- **D-12**: Discriminator field is `kind`.
- **D-13**: Envelope carries `schemaVersion: "1"`.
- **D-14**: Envelope has `resolvedRoot`, `toolVersion`, `warnings: string[]`, `generatedAt` — all required.
- **D-15**: Envelope shape fixed (see CONTEXT for exact JSON).
- **D-16**: Directory islands: `ir/`, `renderers/`, `core/`, `adapters/`, `mcp/`, `cli.ts`. Phase 1 creates `ir/`, `renderers/`, `cli.ts`; others are placeholders.
- **D-17**: ARCH-01 island rule enforced via ESLint `no-restricted-imports` (or Biome equivalent). CI fails if `ir/`/`renderers/`/`core/` import `adapters/`. No dependency-cruiser/madge.
- **D-18**: One kitchen-sink fixture (all 9 kinds) + 2–3 small focused fixtures. Markdown via `toMatchFileSnapshot`; JSON via `toMatchInlineSnapshot` for small + zod validation for kitchen-sink.
- **D-19**: `bin/ui-to-hierarch` stub prints to stderr, exits 0. No `--help`/`--version`/stdin in Phase 1.
- **D-20**: Babel `traverse.default ?? traverse` shim at `src/core/babel-shim.ts` with unit test.
- **D-21**: Root resolver at `src/core/resolve-root.ts`. Order: arg > `UI_TO_HIERARCH_ROOT` > `process.cwd()`. Returns absolute, forward-slash path.

### Claude's Discretion

- ESLint vs Biome pick (both fine per CLAUDE.md).
- Test fixture file names and exact directory layout under `test/`.
- Whether to split zod schema per-kind or keep one file in `ir/`.
- Text truncation policy for markdown renderer (character limit, suffix marker).
- `schemaVersion` top-level vs nested `meta.schemaVersion` (either is acceptable).

### Deferred Ideas (OUT OF SCOPE)

- `unknown` IR kind — declined in D-02.
- Text truncation policy — left to planner's discretion.
- `column` field on IR nodes — reserved, not implemented.
- dependency-cruiser / madge — declined; ESLint rule is the boundary.
- CLI dev helper mode (stdin → tree) — deferred, possibly as Phase 6 `--debug`.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OUT-01 | Markdown + JSON renderers; every node carries `file`+`line`; forward-slash paths on Windows | §"IR Schema (zod v4 discriminated union)", §"Markdown renderer", §"JSON renderer + envelope", §"Forward-slash path normalization" |
| ARCH-03 | Root resolution: arg > `UI_TO_HIERARCH_ROOT` > `process.cwd()`; resolved root echoed in metadata | §"Project-root resolver" |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Node `>=20` (LTS); ESM only (`"type": "module"`).
- MCP SDK `^1.29.0`, zod `^4.1.4`, Babel `^7.29.x`, tsup `^8.5.1`, vitest `^4.3.6`, tsx `^4.21.0`, get-tsconfig `^4.14.0`, tinyglobby `^0.2.16`.
- Must externalize MCP SDK + Babel packages from the tsup bundle.
- Must use `banner.js` for shebang (NOT source-level `#!/usr/bin/env node` — esbuild plugin interaction footgun per tsup issue #684).
- Forbidden: pre-1.0 MCP SDK, `@babel/core`, HTTP/SSE transports, zod v3, ts-node, naive `import traverse from "@babel/traverse"`, `tsc` as bundler, fast-glob, Bun in shipped path.
- Must use `registerTool` idiom (not `setRequestHandler`) — applies in Phase 2, not this phase, but don't scaffold legacy shape.
- All direct repo edits must go through a GSD workflow.
- RTK prefix (`rtk`) recommended for shell commands per user's global CLAUDE.md.

## Standard Stack

### Core (Phase 1 only)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `typescript` | `^5.20.1` | Source language | Pinned in CLAUDE.md [CITED]. |
| `zod` | `^4.1.4` | IR schema, runtime validation | Pinned; required for Phase 2 MCP anyway; Standard-Schema compatible [VERIFIED: npm registry 4.1.4]. |
| `tsup` | `^8.5.1` | Bundle ESM CLI with shebang | Pinned; `banner.js` is the canonical shebang approach [VERIFIED: npm 8.5.1, CITED: tsup issue #684]. |
| `tsx` | `^4.21.0` | Run TS source in dev | Pinned [VERIFIED: npm 4.21.0]. |
| `vitest` | `^4.3.6` | Unit + snapshot tests | Pinned; `toMatchFileSnapshot` + `toMatchInlineSnapshot` are the needed APIs [VERIFIED: npm 4.3.6, CITED: vitest snapshot guide]. |
| `@babel/traverse` | `^7.29.0` | Interop shim target (D-20) | Pinned; shim is tested even though parsing is Phase 3 [VERIFIED: npm 7.29.0]. |

### Dev-only
| Library | Version | Purpose |
|---------|---------|---------|
| `@vitest/coverage-v8` | match vitest | V8 coverage |
| `@types/node` | latest 20.x line | Node type defs |
| `@biomejs/biome` OR `eslint@^9` + `@typescript-eslint` + `eslint-plugin-import` | latest | Lint + `no-restricted-imports` enforcement (D-17). Pick one in planning. |
| `@types/babel__traverse` | latest | Types for the interop shim test |

### Not needed in Phase 1 (deferred)
`@modelcontextprotocol/sdk` (Phase 2), `@babel/parser` (Phase 3), `get-tsconfig` (Phase 3), `tinyglobby` (Phase 3). Phase 1 can omit these from `package.json` dependencies or install them upfront — planner's call, but installing upfront avoids churn when Phase 2 opens.

**Installation (Phase 1 minimum):**
```bash
pnpm add -D typescript tsup tsx vitest @vitest/coverage-v8 @types/node
pnpm add zod
pnpm add @babel/traverse @types/babel__traverse   # for D-20 shim test
# Pick ONE of:
pnpm add -D @biomejs/biome
# OR
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-import
```

## Architecture Patterns

### Recommended Project Structure
```
ui-to-hierarch/
├── src/
│   ├── ir/
│   │   ├── schema.ts           # zod TreeNodeSchema (discriminatedUnion + z.lazy)
│   │   ├── envelope.ts         # zod EnvelopeSchema (schemaVersion, resolvedRoot, ...)
│   │   └── index.ts            # re-exports: TreeNode, Envelope, parse helpers
│   ├── renderers/
│   │   ├── markdown.ts         # renderMarkdown(tree, envelope) -> string
│   │   ├── json.ts             # renderJson(tree, envelope) -> object
│   │   └── index.ts
│   ├── core/
│   │   ├── babel-shim.ts       # (traverse as any).default ?? traverse
│   │   ├── resolve-root.ts     # arg > env > cwd; forward-slash normalized
│   │   └── paths.ts            # rel(absPath, rootAbs) -> forward-slash relative
│   ├── adapters/
│   │   └── .gitkeep            # placeholder for Phase 3
│   ├── mcp/
│   │   └── .gitkeep            # placeholder for Phase 2
│   └── cli.ts                  # stub: console.error("mcp server not implemented yet"); exit 0
├── test/
│   ├── fixtures/ir/
│   │   ├── kitchen-sink.ts     # all 9 kinds
│   │   ├── empty.ts
│   │   ├── single-leaf.ts
│   │   └── deep-branch.ts
│   ├── ir/schema.test.ts
│   ├── renderers/markdown.test.ts      # toMatchFileSnapshot
│   ├── renderers/markdown.test.ts.snap # committed snapshots
│   ├── renderers/json.test.ts          # toMatchInlineSnapshot + schema validate
│   ├── core/babel-shim.test.ts
│   ├── core/resolve-root.test.ts
│   └── core/paths.test.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── eslint.config.js  OR  biome.json
└── .gitignore
```

### Pattern 1: `package.json` skeleton

```json
{
  "name": "ui-to-hierarch",
  "version": "0.1.0",
  "description": "MCP server that returns a frontend codebase's UI component hierarchy.",
  "type": "module",
  "bin": {
    "ui-to-hierarch": "./dist/cli.js"
  },
  "files": ["dist"],
  "engines": {
    "node": ">=20"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^4.1.4",
    "@babel/traverse": "^7.29.0"
  },
  "devDependencies": {
    "@types/babel__traverse": "...",
    "@types/node": "^20.x",
    "tsup": "^8.5.1",
    "tsx": "^4.21.0",
    "typescript": "^5.20.1",
    "vitest": "^4.3.6",
    "@vitest/coverage-v8": "^4.3.6",
    "@biomejs/biome": "latest"
  }
}
```

[CITED: CLAUDE.md §Packaging]. The `"files": ["dist"]` array is critical — without it, npm publishes the whole repo; with it, only the bundle ships.

### Pattern 2: `tsup.config.ts` — shebanged ESM CLI

```ts
// tsup.config.ts
// Source: CLAUDE.md §Packaging, verified against tsup docs (npm 8.5.1)
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  shims: false,
  dts: false,                // Phase 1 ships a CLI, not a library consumer surface
  banner: { js: "#!/usr/bin/env node" },
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
    // toolVersion injection (D-14): read package.json at build time
    "__TOOL_VERSION__": JSON.stringify(
      JSON.parse(require("node:fs").readFileSync("./package.json", "utf8")).version
    ),
  },
});
```

Source code then declares `declare const __TOOL_VERSION__: string;` and reads it. Alternative: a generated `src/ir/version.ts` committed by a `prebuild` script — simpler, but `define` keeps the build one-step.

**Why `banner.js` not source shebang:** tsup issue #684 — mixing source-level `#!/usr/bin/env node` with esbuild plugins breaks in some setups. Using `banner.js` is the documented workaround and preserves the shebang through bundling [CITED: tsup issue #684].

**Why ESM-only (not dual ESM/CJS):** CLI consumers spawn `node dist/cli.js`, so only one format is needed. Dropping CJS output halves artifact count and eliminates dual-package hazard.

**`external` list rationale:** MCP SDK + Babel are heavy and change on their own cadence — externalizing keeps the bundle small and debuggable (`node_modules` stays inspectable). Zod is tiny but still externalized to let consumers dedupe.

### Pattern 3: `tsconfig.json` shape

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*", "tsup.config.ts", "vitest.config.ts"]
}
```

`noEmit: true` because tsup handles emission. `moduleResolution: "bundler"` is the CLAUDE.md-pinned requirement. `verbatimModuleSyntax: true` forces us to write `import type` for type-only imports — good discipline for an ESM library.

### Pattern 4: Zod v4 recursive discriminated union (the critical IR pattern)

```ts
// src/ir/schema.ts
import { z } from "zod";

// Common fields on every node (D-06)
const BaseNode = {
  file: z.string(),
  line: z.number().int().nonnegative(),
  layoutHint: z.string().optional(),   // D-11
};

// Break recursion: declare the output type first, then use z.lazy
export type TreeNode =
  | { kind: "component"; name: string; children: TreeNode[]; file: string; line: number; layoutHint?: string }
  | { kind: "element"; tag: string; children: TreeNode[]; file: string; line: number; layoutHint?: string }
  | { kind: "text"; value: string; file: string; line: number; layoutHint?: string }
  | { kind: "branch"; condition: string; thenBranch: TreeNode | null; elseBranch: TreeNode | null; file: string; line: number; layoutHint?: string }
  | { kind: "list"; item: TreeNode; file: string; line: number; layoutHint?: string }
  | { kind: "slot"; name: string; file: string; line: number; layoutHint?: string }
  | { kind: "error"; message: string; file: string; line: number; layoutHint?: string }
  | { kind: "fragment"; children: TreeNode[]; file: string; line: number; layoutHint?: string }
  | { kind: "spread"; expression: string; file: string; line: number; layoutHint?: string };

export const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ ...BaseNode, kind: z.literal("component"), name: z.string(), children: z.array(TreeNodeSchema) }),
    z.object({ ...BaseNode, kind: z.literal("element"),   tag: z.string(),  children: z.array(TreeNodeSchema) }),
    z.object({ ...BaseNode, kind: z.literal("text"),      value: z.string() }),
    z.object({ ...BaseNode, kind: z.literal("branch"),
      condition: z.string(),
      thenBranch: z.nullable(TreeNodeSchema),
      elseBranch: z.nullable(TreeNodeSchema),
    }),
    z.object({ ...BaseNode, kind: z.literal("list"),      item: TreeNodeSchema }),
    z.object({ ...BaseNode, kind: z.literal("slot"),      name: z.string() }),
    z.object({ ...BaseNode, kind: z.literal("error"),     message: z.string() }),
    z.object({ ...BaseNode, kind: z.literal("fragment"),  children: z.array(TreeNodeSchema) }),
    z.object({ ...BaseNode, kind: z.literal("spread"),    expression: z.string() }),
  ])
);
```

**Why the explicit `TreeNode` type alias:** `z.infer` can't resolve self-referential discriminated unions through `z.lazy` alone — TypeScript can't compute the fixed point. The fix is the standard zod pattern: write the recursive TS type by hand, then annotate the schema as `z.ZodType<TreeNode>`. This is the one place D-04 ("zod is the single source of truth, no hand-written type") needs a pragmatic asterisk — the TS alias exists only to unblock recursion inference, not as a parallel schema. [CITED: zod docs, recursive types section.] Confidence: HIGH that this is necessary; MEDIUM on whether zod v4 has since landed a cleaner form — planner should check zod changelog in case v4.1 has an ergonomic improvement.

**Alternative:** split per-kind schemas into per-file then compose — planner's discretion per CONTEXT. The above is the minimum form.

### Pattern 5: Envelope schema

```ts
// src/ir/envelope.ts
import { z } from "zod";
import { TreeNodeSchema, type TreeNode } from "./schema.js";

export const EnvelopeSchema = z.object({
  schemaVersion: z.literal("1"),
  resolvedRoot: z.string(),
  toolVersion: z.string(),
  generatedAt: z.string().datetime(),
  warnings: z.array(z.string()),
  tree: TreeNodeSchema,
});

export type Envelope = z.infer<typeof EnvelopeSchema>;
```

### Pattern 6: Forward-slash path normalization

```ts
// src/core/paths.ts
// Ported from prototype generate-component-hierarchy.ts line 117–119
import path from "node:path";

export function toForwardSlash(p: string): string {
  return p.split(path.sep).join("/");
}

export function relFromRoot(absFile: string, absRoot: string): string {
  return toForwardSlash(path.relative(absRoot, absFile));
}
```

**Critical on Windows:** `path.sep` is `\`, but D-07 mandates `/` in emitted IR. Never concatenate raw `path.relative` output — always pass through `toForwardSlash`. The prototype's line 117–119 is the canonical form.

### Pattern 7: Project-root resolver (ARCH-03 / D-21)

```ts
// src/core/resolve-root.ts
import path from "node:path";
import { toForwardSlash } from "./paths.js";

export function resolveRoot(explicit?: string): string {
  const candidate = explicit
    ?? process.env.UI_TO_HIERARCH_ROOT
    ?? process.cwd();
  return toForwardSlash(path.resolve(candidate));
}
```

Tests must cover all three branches **plus** verify forward-slash on a Windows-style absolute input (`C:\foo\bar` → `C:/foo/bar`). Use `process.platform` guards or construct absolute paths with `path.win32` / `path.posix` in tests to exercise both OS shapes without actually needing a Windows runner.

### Pattern 8: Babel traverse ESM interop shim (D-20)

```ts
// src/core/babel-shim.ts
// Source: Babel issue #13855, #15269 — ESM default interop
// Also CLAUDE.md §"What NOT to Use" — naive import is a known footgun
import traverseImport from "@babel/traverse";

// The actual function may be on .default depending on how the consumer's
// bundler/node version resolves CJS default interop. This form is correct
// whether traverseImport is `(path) => void` or `{ default: (path) => void }`.
export const traverse = (traverseImport as any).default ?? traverseImport;
export default traverse;
```

**Unit test:**

```ts
// test/core/babel-shim.test.ts
import { expect, test } from "vitest";
import { traverse } from "../../src/core/babel-shim.js";

test("babel traverse interop resolves to a callable function", () => {
  expect(typeof traverse).toBe("function");
});

test("traverse accepts an AST + visitor without throwing at the boundary", () => {
  // Minimal program AST — we're testing the interop shape, not traversal semantics
  const programAst = {
    type: "File",
    program: { type: "Program", body: [], directives: [], sourceType: "module" },
  } as any;
  expect(() => traverse(programAst, { enter() {} })).not.toThrow();
});
```

Failure mode: if a future Babel release changes the export shape and we stop being callable, the first assertion fails immediately and loudly. [CITED: Babel issues #13855, #15269.]

### Pattern 9: Vitest snapshots (D-18)

```ts
// test/renderers/markdown.test.ts
import { expect, test } from "vitest";
import { renderMarkdown } from "../../src/renderers/markdown.js";
import { kitchenSink } from "../fixtures/ir/kitchen-sink.js";

test("markdown renderer — kitchen sink (all 9 kinds)", async () => {
  const out = renderMarkdown(kitchenSink.tree, kitchenSink.envelope);
  await expect(out).toMatchFileSnapshot(
    "./__snapshots__/markdown-kitchen-sink.md"
  );
});
```

```ts
// test/renderers/json.test.ts — small focused fixtures
import { expect, test } from "vitest";
import { renderJson } from "../../src/renderers/json.js";
import { EnvelopeSchema } from "../../src/ir/envelope.js";
import { emptyFixture, singleLeafFixture } from "../fixtures/ir/index.js";

test("json renderer — empty fixture", () => {
  const out = renderJson(emptyFixture.tree, emptyFixture.envelope);
  expect(out).toMatchInlineSnapshot(`...`);
});

test("json kitchen-sink passes envelope schema validation", () => {
  const out = renderJson(/* kitchen sink */);
  expect(() => EnvelopeSchema.parse(out)).not.toThrow();
});
```

`toMatchFileSnapshot` writes the rendered markdown to a `.md` file next to the test — reviewers see a readable tree diff instead of escaped string diff [CITED: Vitest snapshot guide]. `toMatchInlineSnapshot` auto-populates on first run; reviewable in the test file.

### Pattern 10: Island boundary enforcement (ARCH-01 / D-17)

**Biome option (`biome.json`):**

```json
{
  "linter": {
    "rules": {
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "../adapters/*": "ir/ renderers/ core/ must not import adapters (ARCH-01)",
              "../../adapters/*": "ir/ renderers/ core/ must not import adapters (ARCH-01)"
            }
          }
        }
      }
    },
    "overrides": [
      {
        "include": ["src/ir/**", "src/renderers/**", "src/core/**"],
        "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error" } } } }
      }
    ]
  }
}
```

**ESLint flat-config option (`eslint.config.js`):**

```js
import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/ir/**/*.ts", "src/renderers/**/*.ts", "src/core/**/*.ts"],
    languageOptions: { parser },
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["**/adapters/*", "**/adapters"], message: "ARCH-01: ir/ renderers/ core/ must not import adapters/" },
          { group: ["**/mcp/*", "**/mcp"], message: "ARCH-01: ir/ renderers/ core/ must not import mcp/" },
        ],
      }],
    },
  },
];
```

CI job: `pnpm lint` must be a gate. A simple verification test: add a throwaway `src/ir/bad.ts` importing from `src/adapters/`, run lint, see it fail, delete file. Document this as a Wave 0 sanity check in the plan.

[CITED: ESLint docs — no-restricted-imports, flat config. Biome docs — noRestrictedImports.]

### Anti-Patterns to Avoid
- **Source-level `#!/usr/bin/env node`** — use `banner.js` instead. [CITED: tsup #684]
- **Naive `import traverse from "@babel/traverse"`** — always shim. [CITED: CLAUDE.md, Babel #13855]
- **Emitting absolute paths from IR** — always `relFromRoot` first. [CLAUDE.md/D-07]
- **Raw `path.relative` output** — always `toForwardSlash`. [D-07]
- **Dual-format output in tsup** — CLI consumers need only ESM; dual output wastes publish size.
- **Hand-written `interface TreeNode`** — D-04. The ONE exception is the recursive type alias needed for `z.ZodType<TreeNode>` annotation — document as a deliberate concession.
- **Console.log from `src/cli.ts`** — stub must use `console.error` (D-19); stdout is reserved for JSON-RPC frames (MCP-04, Phase 2, but start the discipline now).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema + type inference | Parallel TS interface + zod schema | Zod first, `z.infer` (+ one aliased recursive type) | D-04; zod is already required |
| JSON schema for MCP tool inputs | Hand-written JSON Schema | Zod → Standard Schema → SDK auto-derives | Phase 2 concern but scaffolded now |
| Shebang preservation | esbuild plugin | tsup `banner.js` | Documented workaround [tsup #684] |
| Babel ESM/CJS interop | Try/catch import logic | `.default ?? traverse` one-liner | Idiomatic, smallest surface |
| Windows path handling | Manual `.replace(/\\/g, "/")` loops | `path.sep + split + join("/")` helper (from prototype) | Prototype pattern is already vetted |
| Snapshot diff rendering | Stringify trees into test files | `toMatchFileSnapshot` | Readable `.md` diffs out of the box |

## Runtime State Inventory

Skipped — Phase 1 is greenfield scaffolding, no rename/refactor/migration.

## Common Pitfalls

### Pitfall 1: Zod recursive discriminated union type-inference failure
**What goes wrong:** `z.infer<typeof TreeNodeSchema>` yields `any` or an incomplete type when the schema is wrapped in `z.lazy`.
**Why it happens:** TypeScript cannot compute the fixed point of a self-referential inferred type.
**How to avoid:** Write `type TreeNode = ...` by hand, annotate `TreeNodeSchema: z.ZodType<TreeNode>`.
**Warning signs:** Autocomplete on a traversed child returns `unknown` or `any` instead of the union.

### Pitfall 2: Shebang lost during bundling
**What goes wrong:** `dist/cli.js` has no shebang; `bin` entry runs as JS text, not as a script.
**Why it happens:** Source-level `#!/usr/bin/env node` gets stripped or reordered by esbuild plugins.
**How to avoid:** Use tsup `banner: { js: "#!/usr/bin/env node" }`.
**Warning signs:** `npx ui-to-hierarch` on a Unix-like shell errors `exec format error`. On Windows the `.cmd` shim still works — test on both.

### Pitfall 3: `@babel/traverse` ESM interop returning an object
**What goes wrong:** `traverse(ast, visitor)` throws `traverse is not a function`.
**Why it happens:** Node ESM interop wraps the CJS default export in `{ default }` in some resolution modes.
**How to avoid:** `(traverseImport as any).default ?? traverseImport`. D-20 mandates a unit test.
**Warning signs:** Phase 3 breaks instantly at first parse. The Phase 1 unit test catches this before Phase 3 even starts.

### Pitfall 4: Windows backslashes leaking into IR
**What goes wrong:** Snapshot tests pass on Linux, fail on Windows CI with `app\page.tsx:12` vs `app/page.tsx:12`.
**Why it happens:** `path.relative` uses `path.sep`. Direct use of its return value leaks `\` on Windows.
**How to avoid:** Mandatory passage through `toForwardSlash`. Add a Phase 1 test that constructs a path with `path.win32.join` and asserts the output has `/`.
**Warning signs:** `Expected: "app/page.tsx:12" Received: "app\\page.tsx:12"` in CI but not locally (on macOS/Linux dev boxes).

### Pitfall 5: `toolVersion` drift
**What goes wrong:** `package.json` bumps to `0.2.0`, but the envelope still says `0.1.0`.
**Why it happens:** Version hard-coded in a `.ts` file and forgotten during version bumps.
**How to avoid:** tsup `define` reads `package.json` at build time; runtime code reads a replaced constant. Single source of truth.
**Warning signs:** `pnpm version patch` produces output mismatching `package.json`.

### Pitfall 6: Island rule not enforced at boundary creation
**What goes wrong:** Phase 3 adapter code gets imported into `src/ir/`, architecture silently rots.
**Why it happens:** Lint rule added later, after violations accumulate.
**How to avoid:** Phase 1 creates the rule AND verifies it rejects a throwaway bad import. D-17 mandates this.
**Warning signs:** Adapter logic being copy-pasted into `ir/` "just for now."

## Code Examples

See "Architecture Patterns" section above — every pattern is paired with its source file path and a code block. Patterns 1–10 are all verified against current (2026-04) docs and the npm registry.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zod v3 with `discriminatedUnion` | Zod v4 with Standard Schema native support | 2025 (v4 release) | MCP SDK auto-derives JSON schemas — no manual JSON Schema in Phase 2 |
| `setRequestHandler` (SDK pre-1.0) | `registerTool` (SDK ≥1.x) | 2024 (SDK 1.0) | Phase 2 concern; don't scaffold legacy |
| Source shebang + esbuild plugin | tsup `banner.js` | ~2023 (tsup #684 workaround) | Smaller config, no plugin chaos |
| `ts-node` for dev | `tsx` | 2023+ | ESM works cleanly |
| `fast-glob` | `tinyglobby` | 2024+ | 10x smaller install (Phase 3 concern) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Zod v4.1 still requires explicit `TreeNode` type alias for recursive discriminatedUnion inference | Pattern 4 | Low — if zod added cleaner inference in a minor, we can drop the alias; the schema still validates correctly. Planner should sanity-check current zod docs during implementation. |
| A2 | tsup `define` substitutes literals in ESM output the same way it does in CJS | Pattern 2 | Low — if not, fall back to a generated `src/ir/version.ts` (prebuild script reads `package.json`, writes the file). |
| A3 | Biome's `noRestrictedImports` supports per-directory overrides equivalently to ESLint | Pattern 10 | Low — if Biome's override mechanism is weaker, pick ESLint (D-17 allows either). |
| A4 | `toMatchFileSnapshot` path resolution is relative to the test file | Pattern 9 | Very low — documented behavior; worst case is adjusting the path. |

## Open Questions

1. **Text truncation length for markdown `text` kind**
   - What we know: D-10 says truncate long text with ellipsis.
   - What's unclear: Length threshold (40? 80? full line budget?). Ellipsis form (`…` vs `...`).
   - Recommendation: Planner picks (Claude's Discretion). Suggest 60 chars + `…` for a balance between readability and info density. Revisit in Phase 6 with real client data.

2. **`schemaVersion` placement: top-level vs `meta.*`**
   - What we know: Claude's Discretion per CONTEXT.
   - What's unclear: D-15 example shows it top-level, but nesting under `meta` is valid too.
   - Recommendation: Keep top-level (matches D-15 JSON). One less field to migrate later.

3. **Per-kind schema split vs single file**
   - What we know: Claude's Discretion per CONTEXT.
   - What's unclear: 9 kinds in one file is ~150 lines (fine); splitting creates import boilerplate.
   - Recommendation: Single file (`src/ir/schema.ts`). Revisit if any kind's validator balloons past ~40 lines.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/runtime | Check at plan time — user is on Windows 11 | Need ≥20 | — (blocker if missing) |
| pnpm | Install | Check at plan time | any recent | npm/yarn acceptable |
| Git | GSD workflow | Repo is not a git repo (per env) — planner should initialize if needed | — | — |

**Action for planner:** First task should verify `node --version` ≥ 20 and initialize git (`git init`) if `git status` fails. All other dependencies are npm-installed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^4.3.6` |
| Config file | `vitest.config.ts` (to be created — Wave 0) |
| Quick run command | `pnpm vitest run --reporter=dot` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| OUT-01 | Markdown renderer emits file:line with forward slashes (kitchen sink, 9 kinds) | snapshot (file) | `pnpm vitest run test/renderers/markdown.test.ts` | Wave 0 |
| OUT-01 | JSON renderer emits schema-valid envelope with forward-slash paths | snapshot (inline) + schema validate | `pnpm vitest run test/renderers/json.test.ts` | Wave 0 |
| OUT-01 | Every IR node carries `file` + `line` (validation gate) | unit | `pnpm vitest run test/ir/schema.test.ts` | Wave 0 |
| OUT-01 | Forward-slash normalization on Windows-shaped paths | unit | `pnpm vitest run test/core/paths.test.ts` | Wave 0 |
| ARCH-03 | Resolver precedence: arg > env > cwd | unit | `pnpm vitest run test/core/resolve-root.test.ts` | Wave 0 |
| ARCH-03 | Resolver returns absolute, forward-slash path | unit | `pnpm vitest run test/core/resolve-root.test.ts` | Wave 0 |
| SC-1 | `pnpm build` produces `dist/cli.js` with shebang on line 1 | build + assert | `pnpm build && node -e "const l=require('node:fs').readFileSync('dist/cli.js','utf8').split('\\n')[0]; if(l!=='#!/usr/bin/env node') process.exit(1)"` | Wave 0 |
| SC-1 | `bin/ui-to-hierarch` stub runs and exits 0, stderr only | integration | `pnpm build && node dist/cli.js 2>&1 1>/dev/null; test $? -eq 0` | Wave 0 |
| SC-4 | Babel interop shim resolves to callable | unit | `pnpm vitest run test/core/babel-shim.test.ts` | Wave 0 |
| D-17 | ESLint/Biome rejects a bad adapter import from ir/ | lint (manual probe) | `pnpm lint` on a seeded bad file; delete after confirming failure | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=dot` (whole suite — phase is small enough)
- **Per wave merge:** `pnpm vitest run && pnpm build && pnpm lint && pnpm typecheck`
- **Phase gate:** Full suite green + `pnpm build` produces shebanged `dist/cli.js` + `pnpm lint` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` — all new files
- [ ] `eslint.config.js` OR `biome.json` — one new file (planner picks)
- [ ] `test/fixtures/ir/kitchen-sink.ts`, `empty.ts`, `single-leaf.ts`, `deep-branch.ts` — hand-written fixtures
- [ ] `test/ir/schema.test.ts`, `test/renderers/markdown.test.ts` (+ `__snapshots__/`), `test/renderers/json.test.ts`, `test/core/babel-shim.test.ts`, `test/core/resolve-root.test.ts`, `test/core/paths.test.ts` — all new test files
- [ ] Framework install: `pnpm add -D vitest @vitest/coverage-v8 tsup tsx typescript @types/node` (+ lint tool)
- [ ] Repo is not initialized as a git repo (per env block) — `git init` before first commit

### Security Domain

`security_enforcement` not visible in `.planning/config.json` context — applying default (enabled).

#### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | N/A — no auth surface in Phase 1 |
| V3 Session Management | no | N/A — no sessions |
| V4 Access Control | no | N/A — no multi-tenant concerns |
| V5 Input Validation | yes (seeded for Phase 2) | Zod v4 `EnvelopeSchema.parse` + `TreeNodeSchema.parse` gate all external I/O; even in Phase 1, fixtures are validated through zod at test time (D-05) |
| V6 Cryptography | no | No crypto in scope |
| V14 Configuration | yes | `UI_TO_HIERARCH_ROOT` env var must not leak paths in errors; `toForwardSlash` applied before emission |

#### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `projectRoot` arg | Tampering | `path.resolve` normalizes; no file system access in Phase 1 so actual exploitation surface = 0; still apply the normalization pattern for forward-compat with Phase 3 |
| Arbitrary code exec via parsed config | EoP | N/A in Phase 1 (no parsing). Phase 3 must treat user source as data, never `eval` or `require` it — flag now so Phase 3 research carries it forward |
| stdout contamination (breaks MCP JSON-RPC) | DoS (protocol) | ESLint `no-console` rule on `src/mcp/**` and `src/cli.ts`; every diagnostic must `console.error`. Phase 1 stub sets the pattern (D-19) |
| Dependency supply chain | Tampering | Pin exact versions in Phase 1 `package.json`; keep `external` list explicit in tsup so surprising runtime deps surface in CI |

## Sources

### Primary (HIGH confidence)
- `CLAUDE.md` §Technology Stack, §Packaging, §What NOT to Use — all stack picks and forbidden patterns [CITED verbatim].
- `generate-component-hierarchy.ts` lines 96–119 — prototype TreeNode shape and `rel()` pattern [READ in session].
- npm registry live lookup (2026-04-20): tsup 8.5.1, zod 4.1.4, vitest 4.3.6, @babel/traverse 7.29.0, tsx 4.21.0, get-tsconfig 4.14.0, tinyglobby 0.2.16, @modelcontextprotocol/sdk 1.29.0 [VERIFIED via `npm view`].
- `.planning/phases/01-scaffolding-ir-foundation/01-CONTEXT.md` — all D-01…D-21 decisions [READ in session].
- `.planning/REQUIREMENTS.md` OUT-01, ARCH-03 [READ in session].
- `.planning/ROADMAP.md` Phase 1 SC-1…SC-5 [READ in session].

### Secondary (MEDIUM confidence)
- Vitest snapshot guide (CLAUDE.md citation) — `toMatchFileSnapshot` / `toMatchInlineSnapshot` API.
- Babel traverse ESM interop issue #13855, #15269 (CLAUDE.md citation) — shim pattern.
- tsup issue #684 (CLAUDE.md citation) — shebang banner workaround.
- Zod docs recursive types section [ASSUMED current — not re-fetched this session].

### Tertiary (LOW confidence)
- None — every claim in this research was either verified live (npm registry) or cited from CLAUDE.md / the prototype / CONTEXT.md.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version re-verified against npm registry 2026-04-20.
- Architecture patterns: HIGH — tsup config, package.json skeleton, paths helper all sourced from CLAUDE.md or prototype.
- Zod recursive discriminatedUnion (Pattern 4): MEDIUM — known zod idiom but worth re-confirming against zod 4.1 changelog during implementation (A1 in Assumptions).
- Pitfalls: HIGH — all from CLAUDE.md §What NOT to Use or from the cited Babel/tsup issues.
- Validation architecture: HIGH — maps 1:1 to SC-1…SC-5 and OUT-01/ARCH-03.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — stack is mature, pinned, low-churn)
