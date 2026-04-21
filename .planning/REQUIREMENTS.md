# Requirements — ui-to-hierarchyMCP v1

**Scope:** v1 = Next.js App Router parser shipped as stdio MCP server.
**Frozen:** 2026-04-20

## v1 Requirements

### MCP Shell

- [x] **MCP-01
**: Ships as npm package with `bin` entry runnable via `npx ui-to-hierarch`; starts a stdio MCP server using `@modelcontextprotocol/sdk`'s `StdioServerTransport`
- [ ] **MCP-02**: Every tool input defined via zod schema with `.describe()` on every field, precise types (enums, regex-validated identifiers, route-shape validators)
- [x] **MCP-03
**: Tool handlers return `{ content, isError: true }` on user-facing failures with actionable guidance — never propagate unhandled exceptions
- [x] **MCP-04
**: stdout reserved exclusively for JSON-RPC frames; all diagnostics routed to stderr; ESLint `no-console` on server paths + smoke test that parses every stdout line as JSON

### Query Tools

- [ ] **TOOL-01**: `get_full_hierarchy(route, format?)` returns ordered layout chain + page subtree for a given Next.js route (`/`, `/dashboard/[slug]`, etc.), in markdown (default) or JSON
- [ ] **TOOL-02**: `focus_on(component, scope)` where `scope ∈ {up, full, down}` — returns ancestors chain, ancestors + full subtree, or subtree only
- [ ] **TOOL-03**: `find_by_text(query)` returns matching nodes with file:line, with fuzzy suggestions when no exact match
- [ ] **TOOL-04**: `find_by_style(class_or_prop)` returns nodes whose classes/style match, with file:line

### Parser Core

- [ ] **PARSE-01**: Babel parse with full plugin set (`jsx`, `typescript`, `decorators-legacy`, `classProperties`, `classPrivateProperties`, `classPrivateMethods`, `dynamicImport`, `topLevelAwait`, `importAssertions`, `explicitResourceManagement`) + `errorRecovery: true`; parse errors become `TreeNode { kind: "error" }`, not silent skips
- [ ] **PARSE-02**: Barrel re-export resolution — when a named import lands in a file without the local binding, recurse through `ExportNamedDeclaration` and `ExportAllDeclaration`; cache per file; guard cycles
- [ ] **PARSE-03**: tsconfig `paths` + `baseUrl` resolution via `get-tsconfig`, including `extends` chain (supports `@/*`, `~/*`, `#*`, and multi-target aliases)
- [ ] **PARSE-04**: HOC unwrapping for `memo`, `forwardRef`, `observer`, `with*`, `*HOC` — annotate `wrappers: [...]`; class components (`extends Component`/`PureComponent`) extracted via `ClassDeclaration` visitor

### Next.js App Router

- [ ] **NEXT-01**: Layout chain reconstruction is directory-based (not import-based) — walks `app/` upward from a route, collecting `layout.tsx` at each level; includes `template.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` siblings
- [ ] **NEXT-02**: Route-group `(group)` folders contribute layouts but not URL segments; parallel routes `@slot` emitted as labeled slots on parent; intercepting routes `(.)`, `(..)`, `(...)`, `(..)(..)` resolved with correct segment math; private `_folder` excluded
- [ ] **NEXT-03**: Dynamic routes `[slug]`, `[...rest]`, `[[...opt]]` resolved when route input matches pattern; route map returned with resolved params where applicable
- [ ] **NEXT-04**: `"use client"` / `"use server"` detected as first non-comment directive; every component node carries `runtime: "server" | "client"`

### Output & Styling

- [ ] **OUT-01**: Markdown tree (default, LLM-friendly) + JSON (structured, programmatic); every node carries `file` + `line`; forward-slash paths on Windows
- [ ] **OUT-02**: Layout-only class filter by default (preserves flex/grid/spacing/sizing/positioning); `fullClasses: true` flag exposes everything
- [ ] **OUT-03**: Style extractors for Tailwind classNames (including `cn`/`clsx`/`cva`/`twMerge`), inline `style` prop objects, CSS Modules references (`styles.foo @ ./X.module.css`, no CSS parsing in v1), styled-components template literals (best-effort with `{?}` for interpolations)
- [ ] **OUT-04**: Conditional render branches preserved — ternary, `&&`, `||`, `??`, `!`/`!!` wrappers; list renders (`.map`) marked as `list` kind

### Architecture

- [ ] **ARCH-01**: `FrameworkAdapter` interface with exactly 5 methods (`detect`, `discoverEntries`, `resolveModule`, `extractComponents`, `mapRouteToEntry`); v1 ships `NextJsAdapter` only; `adapters/` is an island (core/ir/renderers never import framework-specific logic)
- [ ] **ARCH-02**: Parse on-demand — fresh `Analyzer` instance per tool call with per-call AST cache; no cross-call cache in v1
- [ ] **ARCH-03**: Project root resolution order — tool input `projectRoot` arg > `UI_TO_HIERARCH_ROOT` env var > `process.cwd()`; resolved root echoed in response metadata
- [ ] **ARCH-04**: Integration test suite with fixture Next.js projects (shadcn-style barrel re-exports, nested layouts, route groups, parallel slots, pnpm monorepo workspace, Windows path separators); MCP Inspector + one real client (Claude Code) end-to-end verified

## v2 Requirements (deferred)

- Watch-mode / live indexing / cross-call AST cache
- HTTP/SSE transport
- Structural edit tools (`move_component`, `wrap_with`, `replace_props`)
- Pages Router support
- Additional framework adapters (React Native/Expo — port prototype; Vue; Svelte)
- CSS Modules full parsing (PostCSS) for layout-relevant declarations
- XML / Mermaid output renderers
- Route discovery tool (`get_route_map()`)
- Diff-between-routes / find-usages / summarize-component

## Out of Scope

- **Vision / screenshot ingestion** — agents already have multimodal; MCP is code-only
- **Pages Router** — legacy; App Router-only buys deeper quality
- **Running or rendering the app** — static analysis only; no runtime execution
- **Parsing `node_modules`** — libraries emitted as framework nodes with module name
- **`React.createElement` / `cloneElement` support in v1** — JSX only; document as known v1 gap
- **Dynamic className full resolution** — inherent limit of static analysis; return both resolved tokens AND raw source slice

## Traceability

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| MCP-01      | Phase 2 | Pending |
| MCP-02      | Phase 2 | Pending |
| MCP-03      | Phase 2 | Pending |
| MCP-04      | Phase 2 | Pending |
| TOOL-01     | Phase 5 | Pending |
| TOOL-02     | Phase 5 | Pending |
| TOOL-03     | Phase 5 | Pending |
| TOOL-04     | Phase 5 | Pending |
| PARSE-01    | Phase 3 | Pending |
| PARSE-02    | Phase 3 | Pending |
| PARSE-03    | Phase 3 | Pending |
| PARSE-04    | Phase 3 | Pending |
| NEXT-01     | Phase 4 | Pending |
| NEXT-02     | Phase 4 | Pending |
| NEXT-03     | Phase 4 | Pending |
| NEXT-04     | Phase 4 | Pending |
| OUT-01      | Phase 1 | Pending |
| OUT-02      | Phase 3 | Pending |
| OUT-03      | Phase 3 | Pending |
| OUT-04      | Phase 3 | Pending |
| ARCH-01     | Phase 3 | Pending |
| ARCH-02     | Phase 5 | Pending |
| ARCH-03     | Phase 1 | Pending |
| ARCH-04     | Phase 6 | Pending |

**Coverage:** 24/24 v1 requirements mapped, no orphans, no duplicates.
