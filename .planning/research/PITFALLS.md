# PITFALLS — ui-to-hierarch MCP

**Domain:** MCP server + Babel AST + Next.js App Router static analysis
**Researched:** 2026-04-20
**Confidence:** HIGH (verified against official MCP/Next.js docs + community issue trackers)

---

## Category 1 — MCP Server Development (stdio / lifecycle / schema)

### 1.1 stdout corruption from `console.log` or library banners [CRITICAL]
- **Failure:** Any stray `console.log`, dependency banner, or deprecation warning corrupts the JSON-RPC stream. Client reports `-32000 connection closed`.
- **Prevention:** ESLint `no-console` on server + imports. All diagnostics via `process.stderr` or MCP `sendLoggingMessage`. Smoke test parses every stdout line as JSON. `dotenv.config({ quiet: true })`.
- **Warning signs:** Client disconnects immediately; manual `node server.js` looks fine.
- **Phase:** Phase 1 (MCP skeleton) — bake in from day 1.

### 1.2 stdin lifecycle / Windows SIGINT quirks
- **Failure:** Server exits early or leaks after client disconnect; Windows SIGINT doesn't fire consistently.
- **Prevention:** Use official `StpdioServerTransport`. Register `SIGINT`, `SIGTERM`, `stdin` `end` handlers that call `server.close()`. Test on Windows.
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
- **Failure:** `` className={`bg-${color}-500`} `` / `className={variants[state]}` — can't resolve statically.
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

## "Looks Done But Isn't" Checklist

- [ ] stdio MCP works in actual client (Claude Code), not just Inspector
- [ ] `get_full_hierarchy("/dashboard/settings")` includes root layout in a 3+ nested-layout fixture
- [ ] `(marketing)/about/page.tsx` resolves for `/about` with `(marketing)/layout.tsx` in chain
- [ ] `@modal` appears labeled on parent layout, not as phantom child
- [ ] `import { Button } from '@/components'` resolves via barrel (shadcn project)
- [ ] `memo(forwardRef(...))` appears as component node, not framework
- [ ] Every node in output has both `file` and `line` (recursive assertion)
- [ ] All `fileRel` use forward slashes on Windows
- [ ] Typical project's `get_full_hierarchy("/")` < 10k tokens
- [ ] One malformed file doesn't blow up whole tree
- [ ] `"use client"` visibly tagged
- [ ] `generateMetadata` doesn't show as component in special files
- [ ] Alias other than `@/*` works (test `~/*` or `#*`)
- [ ] pnpm monorepo parses workspace UI package without following into node_modules
- [ ] `find_by_text("nonexistent")` returns structured empty with `suggestions`

---

## Technical Debt Patterns (v1 acceptable)

| Shortcut | Cost | When acceptable |
|---|---|---|
| Parse on-demand, no cache | Slow on large repos | v1 (per PROJECT.md) |
| Skip class components | Legacy codebases unusable | Never — add minimal visitor |
| Ignore `React.createElement` | Radix/MUI/legacy invisible | v1 if documented |
| Regex Tailwind classification | Breaks on v4 arbitrary variants | Document as best-effort |
| No project-root auto-detect | Agent friction | v1 if documented |
| Skip CSS Modules content parsing | Weaker style signals | v1 — document |

---

## Phase-to-Pitfall Mapping

| Phase | Pitfalls prevented |
|---|---|
| **Phase 1 — MCP skeleton** | 1.1, 1.2, 1.4 |
| **Phase 2 — Tool surface & schemas** | 1.3, 1.4, 7.1, 7.2, 7.3, 7.4 |
| **Phase 3 — Parser core (Babel + imports + Next.js routing + use client)** | 2.1–2.7, 3.1–3.4, 4.1–4.4, 6.4 |
| **Phase 4 — Output formatting (markdown/JSON, styles, token budget)** | 5.1–5.4, 6.1, 6.2, 6.3 |
| **Phase 5 — Hardening (fixtures, monorepo, agent UX validation)** | Verifies all; catches regressions |

**Phase 3 owns 15+ pitfalls** — recommend splitting into 3a (Babel + imports) and 3b (Next.js routing + boundaries) with fixture gates between.

---

## Confidence Assessment

| Area | Confidence | Basis |
|---|---|---|
| MCP stdio/logging | HIGH | Official MCP docs + community reports |
| Tool schema / agent UX | HIGH | Claude API + MCP SDK docs |
| Babel AST edges | HIGH | Babel GitHub issues (#14375, #7554, #11499) |
| Next.js App Router | HIGH | Official Next.js docs |
| tsconfig paths / barrels | HIGH | TS docs + tsconfig-paths |
| Styling extraction | HIGH | Tailwind docs + known static-analysis limits |
| Output formatting for LLMs | MEDIUM | Markdown token-efficiency articles |

---

## Sources
- MCP spec and debugging guides (modelcontextprotocol.io, MCP Playground, Stainless, MCPcat)
- Next.js official docs (parallel-routes, intercepting-routes, layout, use-client, generateMetadata)
- Babel `@babel/traverse` + GitHub issues (#14375 JSXMemberExpression, #7554 attribute parsing, #10022 baseUrl)
- TypeScript TSConfig Reference, tsconfig-paths
- pnpm workspaces, React forwardRef/memo docs, cva, cn
- Token-efficiency writing on markdown vs JSON vs XML for LLM contexts
- `E:\ui-to-hierarch\.planning\PROJECT.md`
- `E:\ui-to-hierarch\generate-component-hierarchy.ts` (reference prototype)
