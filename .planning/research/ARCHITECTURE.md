# ARCHITECTURE — ui-to-hierarchyMCP

**Domain:** MCP stdio server — static-analysis code parser with pluggable framework adapters
**Researched:** 2026-04-20
**Confidence:** HIGH on MCP wiring, project layout, IR-plus-renderers pattern, and the adapter contract. MEDIUM on Next.js App Router route-file-to-entry edge cases (parallel routes, intercepting routes).

---

## System Overview

Classic **frontend → IR → backend** compiler architecture wrapped in an MCP stdio transport. Four horizontal layers, narrow contracts, swappable at layer 2 (adapters).

```
┌──────────────────────────────────────────────────────────────────────────┐
│  TRANSPORT LAYER                                                          │
│  MCP stdio server (@modelcontextprotocol/sdk)                             │
│    • Server metadata + capabilities                                       │
│    • ListTools handler (static tool manifest)                             │
│    • CallTool handler → dispatches to tool implementations                │
├──────────────────────────────────────────────────────────────────────────┤
│  TOOL HANDLER LAYER  (one handler per MCP tool — thin glue)              │
│  get_full_hierarchy │ focus_on │ find_by_text │ find_by_style            │
│    validates input (zod) → calls core services                           │
├──────────────────────────────────────────────────────────────────────────┤
│  CORE LAYER (framework-agnostic)                                          │
│    AdapterDispatcher  — detects project framework, returns adapter       │
│    Pipeline Orchestrator (Analyzer)                                      │
│      discoverEntry → parseFiles → resolveImports → buildGraph → IR       │
│    IR (ComponentGraph) — stable schema, framework-agnostic               │
│    Renderers: markdown / json  (IR → string; pluggable)                  │
├──────────────────────────────────────────────────────────────────────────┤
│  ADAPTER LAYER  (pluggable; v1 ships NextJsAdapter only)                 │
│  NextJsAdapter │ (future) ReactNativeAdapter │ VueAdapter │ SvelteAdapter│
│    all adapters implement: detect / discoverEntries / resolveModule /    │
│                            extractComponents / mapRouteToEntry           │
├──────────────────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE                                                          │
│  @babel/parser + @babel/traverse │ fs (async) │ tsconfck (paths)         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component                            | Responsibility                                                                                                  | Implementation                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP Server**                       | Wire stdio transport, register tools, route requests.                                                           | `@modelcontextprotocol/sdk` — use `McpServer.registerTool(name, { inputSchema: zod }, handler)` over low-level `Server.setRequestHandler(...)`. Zod gives runtime validation for free. |
| **Tool Handlers**                    | Parse/validate input, call `AdapterDispatcher`, pipe IR through renderer. No parsing logic.                     | One file per tool in `src/tools/`. ~30 lines each.                                                                                                                                     |
| **AdapterDispatcher**                | Ask each adapter `detect(root)` in priority order; return first match.                                          | Simple registry array. No DI container in v1.                                                                                                                                          |
| **Pipeline Orchestrator (Analyzer)** | Sequence stages (discover → parse → resolve → graph → IR). Hold ASTs in memory for one tool call; GC on return. | One `Analyzer` per tool invocation. Matches "parse on-demand, no cache".                                                                                                               |
| **FrameworkAdapter**                 | All framework-specific knowledge — nothing else knows "Next.js App Router".                                     | Interface + one concrete class per framework.                                                                                                                                          |
| **IR (ComponentGraph)**              | Stable, typed, framework-agnostic tree. Contract between pipeline and renderers.                                | Plain TypeScript types. JSON-serializable directly.                                                                                                                                    |
| **Renderers**                        | IR → output string. Pure functions.                                                                             | One file per format in `src/renderers/`.                                                                                                                                               |
| **Babel infra**                      | AST parse + traverse.                                                                                           | `@babel/parser` with `["jsx", "typescript", ...]`; `@babel/traverse` visitors.                                                                                                         |
| **Module resolver**                  | Resolve imports to absolute files.                                                                              | `tsconfck`/`get-tsconfig` + extension walk.                                                                                                                                            |

---

## Recommended Project Structure

```
ui-to-hierarch/
├── src/
│   ├── index.ts                    # bin entry — starts stdio MCP server (~5 lines)
│   ├── server/
│   │   ├── createServer.ts         # builds McpServer + registers tools
│   │   └── transport.ts            # StdioServerTransport wiring
│   ├── tools/                      # one file per MCP tool (thin glue)
│   │   ├── getFullHierarchy.ts
│   │   ├── focusOn.ts
│   │   ├── findByText.ts
│   │   ├── findByStyle.ts
│   │   └── schemas.ts              # shared zod input schemas
│   ├── core/
│   │   ├── analyzer.ts             # Pipeline Orchestrator (per-call instance)
│   │   ├── adapterDispatcher.ts    # registry: detect → adapter
│   │   ├── moduleResolver.ts       # tsconfig paths + extension walk
│   │   ├── astCache.ts             # in-memory, per-call (no disk cache v1)
│   │   └── errors.ts               # typed error taxonomy
│   ├── ir/
│   │   ├── types.ts                # ComponentGraph, TreeNode, RenderFlow
│   │   ├── build.ts                # ASTs + ComponentDefinitions → IR
│   │   └── queries.ts              # focus, findByText, findByStyle on IR
│   ├── adapters/
│   │   ├── FrameworkAdapter.ts     # THE interface
│   │   ├── next/
│   │   │   ├── index.ts            # NextJsAdapter (implements FrameworkAdapter)
│   │   │   ├── detect.ts
│   │   │   ├── discoverEntries.ts  # walk app/ for layout|page|loading|error|not-found
│   │   │   ├── routeMap.ts         # route string → entry chain
│   │   │   └── useClientBoundary.ts
│   │   └── README.md               # "how to write a new adapter"
│   ├── extractors/                 # style extractors — composed, not inherited
│   │   ├── tailwind.ts
│   │   ├── cssModules.ts
│   │   ├── inlineStyle.ts
│   │   └── styledComponents.ts
│   ├── renderers/
│   │   ├── markdown.ts             # IR → markdown tree
│   │   ├── json.ts                 # IR → JSON
│   │   └── types.ts                # Renderer<T> = (ir, opts) => string
│   └── utils/
│       ├── jsx.ts                  # jsxNameToString, unwrapExpression, ...
│       └── paths.ts                # rel(), absolute(), forward-slash normalize
├── tests/
│   ├── fixtures/                   # tiny Next.js projects to parse
│   └── adapters/next/*.test.ts
├── package.json                    # "bin": { "ui-to-hierarch": "dist/index.js" }, "type": "module"
├── tsconfig.json                   # target ES2022, module Node16, strict
└── README.md
```

### Structure Rationale

- **`tools/` ≠ `core/`** — Tool handlers are transport glue; MUST stay trivial so new tools don't touch parsing logic.
- **`adapters/` is an island** — Nothing outside `adapters/<framework>/` may import framework-specific logic. `core/` and `ir/` never mention "layout.tsx". Enforce via lint rule or directory convention.
- **`extractors/` live outside adapters** — Tailwind, CSS Modules, etc. are framework-orthogonal. Next.js and Vue both use Tailwind. Composing at `ir/build.ts` means new adapters get style support for free. (Exception: RN `style={{...}}` vs web `className` — adapter's `extractComponents` decides which extractors to invoke.)
- **`ir/` stands alone** — No imports from adapters, no Babel JSX types. Adding XML/Mermaid renderer later = 100-line change.
- **`src/index.ts` is ~5 lines** — Just `createServer()` + `transport.connect()`. Fast `npx` startup.

---

## Adapter Contract (load-bearing)

```typescript
// src/adapters/FrameworkAdapter.ts
import type { File as BabelFile } from "@babel/types";

export interface FrameworkAdapter {
  /** Unique adapter id: "next", "react-native", "vue", ... */
  readonly id: string;

  /** Precedence when multiple adapters detect() true. Higher wins. */
  readonly priority: number;

  /**
   * Does this adapter know how to analyze the project at `projectRoot`?
   * Cheap file-existence checks only — Next: `next.config.*` or `app/` with `layout.{tsx,jsx}`.
   * Do NOT parse code here.
   */
  detect(projectRoot: string): Promise<boolean>;

  /**
   * Enumerate the framework's entry points. Next.js App Router: every
   * `app/**\/page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`,
   * plus the route each one owns. ONLY method that knows file-naming conventions.
   */
  discoverEntries(projectRoot: string): Promise<Entry[]>;

  /**
   * Given an import specifier and the file it came from, return the absolute
   * path. Null = not resolvable in project (node_modules/framework module).
   * Adapters own this because path aliases live in per-framework configs.
   */
  resolveModule(
    fromFile: string,
    specifier: string,
    ctx: ResolveContext,
  ): Promise<string | null>;

  /**
   * Given a parsed AST, find every component definition and return a
   * framework-agnostic description (exported name, render flow, children,
   * Next "use client" flag, RN StyleSheet refs, Vue <script setup>, ...).
   */
  extractComponents(
    file: ParsedFile,
    extractors: StyleExtractorSet,
  ): ComponentDefinition[];

  /**
   * Resolve a route (e.g. "/dashboard/[slug]") to the ordered chain of
   * entry files composing it — Next.js: root layout → nested layouts → page,
   * plus loading/error siblings relevant to the view.
   * Returns null = route not found.
   */
  mapRouteToEntry(route: string, entries: Entry[]): EntryChain | null;
}

export interface Entry {
  filePath: string; // absolute
  kind: EntryKind;
  route?: string; // "/dashboard/[slug]" for Next; undefined for RN screens
  metadata?: Record<string, unknown>;
}

export type EntryKind =
  | "root" // RN _layout.tsx, Vue App.vue
  | "layout" // Next layout.tsx
  | "page" // Next page.tsx, RN screen
  | "loading"
  | "error"
  | "not-found"
  | "screen"; // RN / Expo Router

export interface EntryChain {
  route: string;
  layouts: Entry[]; // outermost → innermost
  leaf: Entry; // page/screen
  siblings?: { loading?: Entry; error?: Entry; notFound?: Entry };
}

export interface ResolveContext {
  projectRoot: string;
  tsconfigPaths?: Record<string, string[]>;
}

export interface ParsedFile {
  filePath: string;
  relPath: string; // repo-relative, forward slashes
  source: string;
  ast: BabelFile;
}

export interface StyleExtractorSet {
  tailwind: (attrValue: unknown) => string | null;
  cssModules: (importSpecifier: string, memberAccess: string) => string | null;
  inlineStyle: (objectExpr: unknown) => Record<string, string>;
  styledComponents: (taggedTemplate: unknown) => string | null;
}
```

`ComponentDefinition`, `RenderFlow`, and `TreeNode` are **the IR** — already exist in the prototype (`generate-component-hierarchy.ts` lines 96–114). Lift into `src/ir/types.ts` verbatim, tighten `any` to proper Babel types, freeze the contract.

### Why this contract is minimal and correct

| Requirement                             | How the contract handles it                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| v1 Next.js only, future RN/Vue/Svelte   | Five methods. Only `NextJsAdapter` in v1.                                     |
| Entry discovery                         | `discoverEntries()` — framework enumerates its own conventions                |
| File resolution                         | `resolveModule()` — owns tsconfig paths, aliases, extensions                  |
| Component extraction                    | `extractComponents()` — owns `"use client"`, Vue SFC, RN StyleSheet           |
| Route → entry mapping                   | `mapRouteToEntry()` — only method turning URL into files                      |
| Style extractors shared across adapters | Passed INTO `extractComponents` as dependencies — not subclass responsibility |

### What does NOT belong in the adapter

- **Tree building** (`buildNodesFromJsx`, branch/conditional resolution) → `ir/build.ts`. Adapter feeds `ComponentDefinition`s; IR builder walks render flows identically across frameworks.
- **Rendering** — adapters never touch output format.
- **MCP protocol** — adapters never import `@modelcontextprotocol/sdk`.
- **Caching** — out of scope for v1.

---

## Data Flow

### Request: tool call → response

```
Agent (Claude Code, Cursor, ...)
     │  JSON-RPC over stdin
     ▼
StdioServerTransport (sdk)
     │  CallToolRequest { name: "focus_on", arguments: {...} }
     ▼
McpServer.registerTool handler
     │  (zod validates arguments)
     ▼
Tool handler  [src/tools/focusOn.ts]
     │  { projectRoot, component, scope }
     ▼
AdapterDispatcher.resolveAdapter(projectRoot)
     │  tries adapters in priority order → NextJsAdapter
     ▼
Analyzer (per-call instance)
     │
     ├─ stage 1: adapter.discoverEntries(root) → Entry[]
     ├─ stage 2: parse entry files + transitively parse imports (per-call astCache)
     ├─ stage 3: for each ParsedFile:
     │             components = adapter.extractComponents(file, extractors)
     │             resolve JSX tags via adapter.resolveModule()
     ├─ stage 4: build IR (ComponentGraph) — walk render flows, inline same-project
     │           components, mark recursion & duplicates
     └─ stage 5: IR queries (focus / findByText / findByStyle)
     │
     ▼
Renderer  [src/renderers/markdown.ts | json.ts]
     │  returns content: [{ type: "text", text: "..." }]
     ▼
McpServer → StdioServerTransport → agent stdout
```

**Invariant:** only stages 1–3 call adapter methods; stages 4–5 are framework-agnostic. This is what makes the IR pluggable.

### Project root discovery

Checked in order:

1. **Tool input `projectRoot` arg** (preferred) — every tool's zod schema includes optional `projectRoot: z.string()`. How MCP clients drive from any cwd.
2. **Env var `UI_TO_HIERARCH_ROOT`** — set by client's MCP config.
3. **Server cwd** (`process.cwd()`) — fallback.

Do NOT auto-walk upward — surprising behavior can analyze wrong repo. Include resolved root in response metadata for agent sanity-check.

### IR stability (future renderers trivial)

```typescript
// src/renderers/mermaid.ts — entire new file
export function renderMermaid(root: TreeNode): string {
  const lines = ["graph TD"];
  walk(root, (node, parent) => {
    if (parent) lines.push(`  ${parent.id} --> ${node.id}[${node.name}]`);
  });
  return lines.join("\n");
}
```

No changes to adapters, pipeline, tools, or MCP layer.

---

## Architectural Patterns

### Pattern 1: Strategy / Adapter for frameworks

Single `FrameworkAdapter` interface, one impl per framework, chosen at runtime by `detect()`. New framework = one new directory, zero changes to core. Risk: resist putting framework-agnostic logic into an adapter "for convenience".

### Pattern 2: IR with pluggable renderers (LLVM/Rustc/Pandoc pattern)

Compile many frontends (frameworks) → one IR → many backends (markdown, JSON, XML, Mermaid). O(N+M) vs O(N×M). Adding an IR field is a versioned contract change — do cautiously.

### Pattern 3: Per-call pipeline (no global state)

Every tool call creates fresh `Analyzer` with fresh AST cache, runs pipeline, returns, GC'd. Impossible to get stale results; trivially thread-safe. Matches PROJECT.md's no-cache-in-v1 constraint.

### Pattern 4: Composition over inheritance for extractors

Style extractors passed INTO `extractComponents` as `StyleExtractorSet`, not implemented as adapter subclasses. Next.js and Vue both get Tailwind from one implementation. Extractor API must stay framework-neutral.

---

## Build Order (roadmap-facing)

Top → bottom = dependency order; same-level items parallel.

```
Level 0 (foundations, parallel):
  ├─ IR types                    (src/ir/types.ts)   — port from prototype
  ├─ Babel infra & utilities     (src/utils/*)
  └─ Project scaffolding         (package.json, tsconfig.json, bin entry)

Level 1 (needs IR types):
  ├─ FrameworkAdapter interface  (src/adapters/FrameworkAdapter.ts)
  ├─ Module resolver             (src/core/moduleResolver.ts)
  ├─ Style extractors            (src/extractors/*)
  └─ Renderers                   (src/renderers/markdown.ts, json.ts)
        ↑ CAN be unit-tested against hand-written IR fixtures
          without any adapter yet — build early to de-risk output

Level 2 (needs adapter interface + extractors + resolver):
  └─ NextJsAdapter               (src/adapters/next/*)
        ├─ detect()                    (trivial, hours)
        ├─ discoverEntries()           (fs walk of app/, days)
        ├─ resolveModule()             (wraps moduleResolver + Next aliases)
        ├─ extractComponents()         (port prototype analyzeFile, days)
        └─ mapRouteToEntry()           (layout-chain composition, non-trivial)

Level 3 (needs adapter + IR + renderers):
  ├─ AdapterDispatcher           (src/core/adapterDispatcher.ts) — tiny
  ├─ Analyzer / Pipeline         (src/core/analyzer.ts)
  └─ IR query module             (src/ir/queries.ts)

Level 4 (needs Analyzer):
  ├─ MCP server + registerTool wiring (src/server/*)
  └─ Tool handlers                    (src/tools/*)

Level 5 (whole system exists):
  └─ Integration tests against fixture Next.js projects
```

**Strategic notes:**

- **Renderers at Level 1** is counterintuitive but correct — pure IR→string; validate against fixtures before the parser exists. Any later bugs are adapter bugs.
- **`extractComponents` is the longest single task** — effectively a port of `analyzeFile` + `buildNodesFromJsx` from prototype.
- **`mapRouteToEntry` is the riskiest Next.js-specific task** — route groups `(auth)`, parallel `@slot`, intercepting `(.)foo`, dynamic `[slug]`/`[...rest]`/`[[...opt]]`. Likely deserves its own sub-phase.
- **MCP layer is thin** — don't over-allocate; it's mostly wiring once Analyzer works.

---

## Error Modes

Query-only, best-effort parser. A single bad file must never crash the whole tool call. Typed taxonomy in `src/core/errors.ts`:

| Failure mode                                                                                                | Where handled                                  | Behavior                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Syntax error** in user file                                                                               | `parseFile()` catches Babel error              | Log warning to **stderr** (not stdout). Emit `TreeNode { kind: "error", name: "[unparseable]", fileRel, text: <msg> }`. Pipeline continues. |
| **Unresolved import**                                                                                       | `resolveModule()` returns null                 | Treat as external — emit framework node with `module: "<unresolved>"`, no children.                                                         |
| **Dynamic component** (`<Components[key] />`, `<A ?? B />`, `React.createElement(type)` with variable type) | Component resolver in `ir/build.ts`            | Emit `TreeNode { kind: "dynamic", name: "<dynamic: " + sourceSlice + ">" }`.                                                                |
| **Missing entry file** (route doesn't exist)                                                                | `mapRouteToEntry()` returns null               | Tool returns MCP error response with `isError: true` + helpful message listing discovered routes.                                           |
| **Project root not a supported framework**                                                                  | `AdapterDispatcher` finds no match             | MCP error response: `"No framework adapter matched <root>. Supported: next"`.                                                               |
| **Recursion** (component includes itself)                                                                   | Already in prototype via `stack.includes(key)` | Mark `recursive: true`, don't recurse.                                                                                                      |
| **Cross-component reuse** (same component twice)                                                            | Prototype's `expandedComponents` set           | Mark second `duplicate: true`, no children.                                                                                                 |
| **FS error** (permissions, mid-parse delete)                                                                | Top-level try/catch in `Analyzer.run()`        | Wrap in typed `AnalyzerError`, surface as MCP error.                                                                                        |

**Iron rule:** MCP server never exits. Only MCP JSON-RPC frames to stdout. All logs → stderr.

---

## Anti-Patterns

### AP1: Framework knowledge in `core/` or `ir/`

- **Problem:** An `if (adapter.id === "next") ...` in `ir/build.ts` to handle `"use client"` or route groups. Five such conditionals and the architecture is no longer pluggable.
- **Do instead:** Extend `ComponentDefinition` / `Entry` with normalized fields (e.g. `clientBoundary: boolean`); adapter populates; core consumes normalized field.

### AP2: Per-adapter rendering

- **Problem:** `adapter.renderMarkdown(ir)` — "the adapter knows best." N×M output implementations; new format changes every adapter.
- **Do instead:** Renderers consume IR only. If a format genuinely needs framework metadata, push into IR as optional fields.

### AP3: Using `McpServer` and `Server` interchangeably

- **Problem:** Copy `server.setRequestHandler(CallToolRequestSchema, ...)` into a file that imports `McpServer` → `setRequestHandler does not exist`. (SDK issue #642.)
- **Do instead:** Pick `McpServer.registerTool` with zod input schemas. SDK validates inputs for free. Drop to `Server` only if needed (not in v1).

### AP4: stdout for logs

- **Problem:** `console.log("parsing file...")` corrupts stdio transport silently.
- **Do instead:** `console.error(...)` or route to stderr/file.

### AP5: Cross-call AST caching in v1

- **Problem:** "Parsing is slow, let's keep a module-level `Map<filePath, AST>`." Cache-invalidation bugs (stale tree after user edit) break the value prop.
- **Do instead:** Per-call astCache (many files reference same imports), discard on return. Cross-call cache behind same `Analyzer` interface later if measurement shows need.

---

## Integration Points

### External

| Service                                     | Integration                                        | Notes                                                                   |
| ------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| MCP clients (Claude Code, Cursor, Continue) | JSON-RPC 2.0 over stdio via `StdioServerTransport` | Clients launch per MCP config, typically `npx ui-to-hierarch`           |
| npm registry                                | Distribution                                       | `package.json` `"bin"` + published package. UX: `npx -y ui-to-hierarch` |

### Internal boundaries

| Boundary            | Communication                                                   |
| ------------------- | --------------------------------------------------------------- |
| tool handler ↔ core | Direct typed function call                                      |
| core ↔ adapter      | Calls on `FrameworkAdapter` interface (only `Analyzer` crosses) |
| adapter ↔ extractor | Adapter calls extractor fn with Babel nodes; one-way            |
| pipeline ↔ IR       | Pipeline builds IR, hands to renderer; IR is JSON-serializable  |
| server ↔ transport  | Via SDK abstraction (never touch stdio directly)                |

---

## Scaling Considerations

| Scale                           | What matters                   | Adjustment                                                                            |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| Tiny Next.js (< 50 files)       | Nothing — parse-per-call ~50ms | Ship as-is                                                                            |
| Medium (~500 files, typical v1) | First call 1–3s                | Fine. Parse in parallel via `Promise.all`                                             |
| Large (~5000 files, monorepo)   | Parse time user-visible        | Add **optional** on-disk AST cache keyed by `(filePath, mtime)` behind same interface |
| Huge (~50k files)               | Memory per call                | Parse only transitive closure from queried route, not whole project                   |

**Don't add caching in v1 even if it seems free.** Correctness > perf at v1 scale.

---

## Confidence Assessment

| Claim                                                              | Confidence | Basis                                                                                                                                                             |
| ------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `McpServer.registerTool` with zod is recommended wiring            | HIGH       | Official SDK docs, PR #816, DeepWiki walkthrough                                                                                                                  |
| `Server` + `setRequestHandler` still works but is low-level        | HIGH       | Official docs, Issue #642                                                                                                                                         |
| Stdout must stay clean on stdio transport                          | HIGH       | Universal MCP guidance                                                                                                                                            |
| IR-with-pluggable-renderers maps to this problem                   | HIGH       | LLVM, Rustc, Pandoc all use this                                                                                                                                  |
| Adapter contract covers all v1-planned frameworks                  | MEDIUM     | Validated against Next.js + RN/Expo (prototype proves RN). Vue SFC / Svelte stores may push small additions to `extractComponents` — no changes to 5-method shape |
| Parse-on-demand under 3s for medium projects                       | MEDIUM     | Prototype runs fast on RN/Expo; unvalidated on large Next.js monorepos                                                                                            |
| `mapRouteToEntry` with parallel/intercepting routes is non-trivial | HIGH       | Official Next.js docs document 5+ special route folder types                                                                                                      |

---

## Sources

### Primary (HIGH confidence)

- [typescript-sdk repo](https://github.com/modelcontextprotocol/typescript-sdk) — canonical SDK source
- [typescript-sdk/docs/server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
- [@modelcontextprotocol/sdk on npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [Issue #642 — setRequestHandler on McpServer](https://github.com/modelcontextprotocol/typescript-sdk/issues/642)
- [PR #816 — registerTool ZodType<object>](https://github.com/modelcontextprotocol/typescript-sdk/pull/816)
- [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes)
- [Next.js Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- [Next.js Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages)

### Secondary (MEDIUM confidence)

- [Tool Registration — DeepWiki](https://deepwiki.com/modelcontextprotocol/typescript-sdk/3.2-tool-registration-and-execution)
- [Build an MCP server](https://modelcontextprotocol.io/docs/develop/build-server)
- [@babel/traverse docs](https://babeljs.io/docs/babel-traverse)
- [Intermediate Representation — Wikipedia](https://en.wikipedia.org/wiki/Intermediate_representation)
- [tsconfig-paths on npm](https://www.npmjs.com/package/tsconfig-paths)
- [Adapter pattern in TS (refactoring.guru)](https://refactoring.guru/design-patterns/adapter/typescript/example)

### In-repo

- `E:\ui-to-hierarch\generate-component-hierarchy.ts` — existing parser for RN/Expo; IR types (lines 96–114) and tree-building algorithms port over directly
- `E:\ui-to-hierarch\.planning\PROJECT.md` — authoritative v1 scope
