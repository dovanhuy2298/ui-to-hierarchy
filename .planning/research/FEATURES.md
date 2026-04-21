# Feature Research

**Domain:** MCP server for UI component-hierarchy extraction (static analysis over Next.js App Router, consumed by coding agents)
**Researched:** 2026-04-20
**Confidence:** MEDIUM-HIGH — strong alignment with observable patterns from next-devtools-mcp, Serena, Aider repomap, ast-grep-mcp, tree-sitter MCPs, and storybook-llms-extractor. Lower confidence on exact numeric token budgets (specific cutoffs vary by LLM).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Without any of these, the MCP is not useful for the stated agent workflow ("ground a screenshot/description in the right file"). Every one of these appears, in some form, across every comparable tool surveyed (next-devtools-mcp, Serena, Aider repomap, tree-sitter MCPs, Storybook MCP).

| #   | Feature                                                                                                                | Why Expected (evidence)                                                                                                                                                                                                                                                                                                                     | Complexity | Notes                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **`get_full_hierarchy(route)` — layout chain → page → subtree**                                                        | next-devtools-mcp ships `get_page_metadata` that returns "routes, pages, component metadata"; prototype already produces this via `buildAsciiTree` walking from `_layout`. Agents need the whole canvas before they can locate a part.                                                                                                      | M          | Must traverse nested `layout.tsx` chain correctly — each `{children}` slot must splice in the next layout/page. Prototype has this logic for RN `Stack.Screen`; port to App Router file-convention.                                                                     |
| T2  | **`focus_on(component, scope=up\|full\|down)`**                                                                        | Agents run out of context fast when given the entire app tree. This is a token-budget feature, not a convenience feature. Prototype already has `--focus`/`--scope`, which is the single most important design insight from the existing code. Mirrors Serena's "symbol-level retrieval" and the Aider repomap's "ranked, budgeted" output. | M          | `up` = ancestors + target (collapsed children), `full` = ancestors + full subtree, `down` = just subtree. Must handle "component defined but not reachable from any route" (prototype's standalone-subtree fallback).                                                   |
| T3  | **`find_by_text(query)` → nodes with file:line**                                                                       | The most common agent workflow: "the banner that says 'Welcome back' is broken". Every RepoMap / tree-sitter MCP exposes a text/symbol search as its primary lookup.                                                                                                                                                                        | S          | Match against JSXText and string literals in JSXExpressionContainer. Return structural path (ancestor chain) alongside file:line so the agent knows _where_ in the tree, not just which file.                                                                           |
| T4  | **`find_by_style(class_or_prop)` → nodes with file:line**                                                              | "Make the card that has `rounded-2xl bg-card` wider" — agents translate visual descriptions to style hints. No surveyed tool does this well; this is the first quasi-differentiator inside table-stakes because the prototype already extracts class tokens (`collectClassTokensFromExpression`).                                           | M          | Query must match against both raw className strings and resolved tokens (handles `cn(...)`, `clsx(...)`, template literals, conditional classes). Prototype's token collector is the foundation.                                                                        |
| T5  | **file:line on every node**                                                                                            | Entire purpose of the MCP. Without it, agents still have to grep. Serena, tree-sitter MCPs, ast-grep-mcp, next-devtools-mcp all return source location on every hit.                                                                                                                                                                        | S          | Babel gives `loc.start.line` natively; just thread it through `TreeNode` (prototype's `TreeNode` already has `fileRel` — extend with `line`).                                                                                                                           |
| T6  | **Dual output: markdown ASCII tree (default) + JSON (on request)**                                                     | Empirical LLM research: Markdown ASCII trees have the highest compression ratio + native LLM comprehension; JSON when the client needs to traverse programmatically. GPT-4o and Claude both emit Markdown unprompted for trees. XML costs ~80% more tokens for same information.                                                            | S          | Prototype already emits ASCII; add a JSON serializer over the same `TreeNode` graph. Parameter: `format: "markdown" \| "json"` (default markdown).                                                                                                                      |
| T7  | **Layout-relevant class/style extraction (Tailwind, CSS Modules, inline `style`, styled-components best-effort)**      | Core value prop per PROJECT.md is "understand layout/nesting/conditional render from a static image." Without class/style info on nodes, the hierarchy is just names — useless for a layout edit. Prototype already has `LAYOUT_CLASS_PREFIXES` and `STYLE_KEYS` catalogs.                                                                  | M          | Four sub-systems: Tailwind className (done in prototype), `style={{...}}` object literal (done), CSS Modules `styles.foo` reference (needs import-resolve to find the `.module.css`), styled-components template literal (best-effort — dump the tagged template body). |
| T8  | **Preserve conditional render branches (ternary, `&&`, if/switch) as `<branch>` nodes**                                | Failure mode #2 from PROJECT.md: "editing the right element but breaking a parent or sibling by not understanding the tree." Collapsing branches to a single subtree hides this entirely. Prototype's `buildRenderFlowFromStatements` is the reference implementation.                                                                      | M          | Branches appear as labeled nodes ("then"/"else", or the case discriminant). Critical for App Router's `{isLoggedIn ? <Dashboard/> : <Login/>}` patterns.                                                                                                                |
| T9  | **App Router file conventions: `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`** | Next.js 14/15/16 App Router docs treat these as first-class. An agent asking "where does the error UI live for `/dashboard`?" expects the MCP to know.                                                                                                                                                                                      | M          | Resolve these from the filesystem route segment, not the import graph — they are conventionally auto-wired by Next.js. next-devtools-mcp's `get_page_metadata` does this natively.                                                                                      |
| T10 | **Dynamic segments: `[slug]`, `[...catchall]`, `(group)` route groups**                                                | App Router conventions. Without this, `/products/[id]/page.tsx` becomes invisible when the user says "the product page".                                                                                                                                                                                                                    | S          | String-match segment patterns during route resolution; preserve the original segment name in the tree output (e.g., `[id]` labeled as such).                                                                                                                            |
| T11 | **`"use client"` boundary annotation on nodes**                                                                        | Client/server boundary is the #1 source of bugs in App Router. Agents editing a server component by adding hooks will break the build. A tag like `[client]` on boundary nodes prevents this entire class of mistake.                                                                                                                       | S          | Single top-of-file directive check; set a boolean on the component definition; render as `(client)` marker in ASCII.                                                                                                                                                    |
| T12 | **Recursion and duplicate-subtree handling**                                                                           | Same component used twice (e.g., `<Card>` in a grid) or a component recursing into itself (e.g., tree view). Prototype already flags `recursive` (↺) and `duplicate` ("see above"). Without this the output explodes.                                                                                                                       | S          | Prototype has this; port directly.                                                                                                                                                                                                                                      |
| T13 | **Node attribute: text content (with sensible truncation)**                                                            | `find_by_text` needs a source; also helps the agent visually anchor descriptions to nodes when scanning the tree. Prototype truncates at 77 chars.                                                                                                                                                                                          | S          | Done in prototype (`buildTextNode`).                                                                                                                                                                                                                                    |
| T14 | **Error-tolerant parsing (skip unparseable file, continue)**                                                           | Real codebases have broken TSX during refactors. Bailing out means the MCP is unusable during active development — the exact moment agents need it. Prototype logs `[warn] skipping unparseable file` and continues.                                                                                                                        | S          | Already in prototype. Report skipped files in the response metadata so the agent knows the tree is partial.                                                                                                                                                             |
| T15 | **Path alias resolution (tsconfig `paths`, `@/*`)**                                                                    | Near-universal in Next.js projects. Without it the import graph breaks and every imported component becomes an opaque `<framework>` node. Prototype has `aliasMap`.                                                                                                                                                                         | S          | Read `tsconfig.json` `compilerOptions.paths` at server start (or per-query).                                                                                                                                                                                            |
| T16 | **Stdio transport, npm-distributable, `npx`-able**                                                                     | Standard MCP distribution; every MCP client (Claude Code, Cursor, Continue) expects this. Per PROJECT.md constraints.                                                                                                                                                                                                                       | S          | `@modelcontextprotocol/sdk` stdio server; published as `npm` package.                                                                                                                                                                                                   |

### Differentiators (Competitive Advantage)

These are where this MCP can be materially better than "just use tree-sitter MCP + grep". The common thread: **semantic richness specific to Next.js App Router UI**, which generic code-intelligence tools can't match.

| #   | Feature                                                                   | Value Proposition                                                                                                                                                                                                                                                                                                                                                                      | Complexity  | Notes                                                                                                                                               |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Ancestor-chain rendering in `focus_on(scope=up)`**                      | Solves PROJECT.md failure #2 directly ("breaking a parent or sibling"). The agent sees the layout → page → surrounding component chain _without_ the sibling subtrees eating tokens. No surveyed tool does this — Serena returns symbols, tree-sitter MCPs return AST slices. Prototype already has `buildFocusedAsciiTree` with "Ancestor chain → target" output.                     | S (have it) | Feature already works in the prototype; port the presentation verbatim. This is the single most agent-friendly idea in the prototype.               |
| D2  | **Props as first-class node attributes (not just className/style)**       | Agents writing "the `variant="outline"` button inside `<CardHeader>`" need prop values. Aider repomap shows function signatures but not call-site props; tree-sitter MCPs return the whole JSX node — the agent has to re-parse. We can curate: emit prop key/value pairs per node, filtered to string/number/boolean literals (skip complex expressions with a `{expr}` placeholder). | M           | Extend `TreeNode` with `props: {name: value}`. Output as `prop=value` suffix in markdown, `props` key in JSON.                                      |
| D3  | **Slot-flow visualization: `children` prop tracked through wrappers**     | When `<Layout>` renders `{children}`, the tree can splice in the page that was passed as children. Prototype already does this (`slotChildren` param). This is what makes the App Router layout chain actually readable as a tree — otherwise `{children}` is just an opaque token.                                                                                                    | S (have it) | Port from prototype; only App Router-specific addition is recognizing `page.tsx` as the children of its nearest `layout.tsx`.                       |
| D4  | **`find_by_style(query)` with normalized Tailwind matching**              | Search by `"flex gap-4"` and match even when written as `cn("flex", "gap-4")`, `` `flex ${cond ? 'gap-4' : 'gap-2'}` ``, or `classNames("flex", "gap-4")`. No surveyed code-intelligence MCP does this — it's Next.js/Tailwind-specific. The prototype's token collector is the foundation; query becomes "does any token set on this node's className contain all query tokens?".     | M           | Order-independent match ("gap-4 flex" should match "flex gap-4"); variant-aware (treat `md:gap-4` as `gap-4` with breakpoint).                      |
| D5  | **Route map as a dedicated `get_route_map()` tool**                       | Agents often start with "show me all routes" before drilling in. next-devtools-mcp does this implicitly via `get_page_metadata`; making it a distinct tool keeps individual calls small. Returns a flat list of `{route, file, layouts: [...], has_loading, has_error}`.                                                                                                               | S           | Filesystem walk of `app/` + convention matching. Don't traverse into components — route shape only.                                                 |
| D6  | **Optional `layoutOnly` flag on query tools**                             | Prototype has `--layoutOnly`. Cuts tokens dramatically when the agent only cares about structure — strips non-layout Tailwind (colors, typography, borders) but keeps `flex`, `grid`, `absolute`, `gap-*`, `p-*`, etc.                                                                                                                                                                 | S           | Already in prototype (`filterLayoutClasses`, `LAYOUT_CLASS_EXACT`, `LAYOUT_CLASS_PREFIXES`).                                                        |
| D7  | **Node identity via stable path (not just file:line)**                    | File:line changes every edit. Give each node a stable "path ID" like `DashboardLayout>Sidebar>NavItem[2]` the agent can re-reference after edits. Analogous to CSS selectors for the tree.                                                                                                                                                                                             | M           | Deterministic traversal order + positional index among same-typed siblings.                                                                         |
| D8  | **`find_by_text` returns surrounding tree context, not just hits**        | Every grep-like MCP returns isolated hits. We can return the matched node **plus its ancestors** (à la `focus_on scope=up`) by default. One call, full context.                                                                                                                                                                                                                        | S           | Compose: text search → for each hit, run ancestor extraction. Pay the few-extra-tokens cost; save a round-trip.                                     |
| D9  | **Styled-components / emotion template-literal extraction (best-effort)** | Parse the tagged template body as a CSS-ish string, extract layout properties (`display`, `flex`, `grid`, margins). Won't be 100% but even 70% coverage is a differentiator — Serena/ast-grep treat these as opaque strings.                                                                                                                                                           | M           | Regex over the template literal body keyed to `STYLE_KEYS`; flag on node as `cssInJs`. Fail gracefully.                                             |
| D10 | **Pagination / depth control on `get_full_hierarchy`**                    | MCP spec has pagination primitives; large apps blow past context otherwise. Parameters: `maxDepth: number`, `cursor` for continuation. Framed as "scan wide, then drill with `focus_on`".                                                                                                                                                                                              | M           | Depth-limited BFS is trivial; cursor continuation for sibling-by-sibling streaming is harder — defer cursor until post-v1 if depth alone is enough. |
| D11 | **"Summary" mode: one-line-per-component**                                | Repo-map-style ultra-compact view: `DashboardLayout — app/(dashboard)/layout.tsx — flex h-screen — 3 children`. Use for `list_components` or as default on `scope=up`.                                                                                                                                                                                                                 | S           | Formatter variation of existing tree output.                                                                                                        |
| D12 | **Conditional-branch condition preserved as human text**                  | Prototype already does this (`summarizeCondition`). Rendering `user?.isAdmin ? <A/> : <B/>` as a branch with label `user?.isAdmin` is the difference between an agent picking the right branch vs. editing both.                                                                                                                                                                       | S           | Port from prototype (`sourceSlice` over the test node).                                                                                             |

### Nice-to-Have (Defer — add after validation)

Things worth building _eventually_ but that don't validate the core hypothesis.

| #   | Feature                                                                       | Trigger to Add                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **Incremental re-parse / file-watch cache**                                   | Perf shows on-demand parsing is too slow on large repos (PROJECT.md explicitly defers this). Quantify: if p95 `get_full_hierarchy` > 3s on a medium repo, build. |
| N2  | **`diff_between_routes(routeA, routeB)`**                                     | Agent workflow evidence shows they compare routes. Nice UX, but agents can call `get_full_hierarchy` twice and diff themselves.                                  |
| N3  | **`summarize_component(name)`: docstring + props + variants**                 | Storybook-llms-extractor has this; valuable for design-system-heavy repos. But prop extraction (D2) gets us 80% of the way.                                      |
| N4  | **Cross-file usages: "where is `<Button>` used?"**                            | Serena/tree-sitter MCPs cover this well already. Defer — agents can compose this by calling `find_by_text(<Button)` on the MCP plus their own grep.              |
| N5  | **Git-aware filtering (only changed files this session)**                     | Clever but composable — agent knows what it changed.                                                                                                             |
| N6  | **Render-graph pruning by reachability from `page.tsx`**                      | Already implicit in `get_full_hierarchy` starting from the route. Explicit dead-code filter is v2.                                                               |
| N7  | **MDX / `.mdx` file support**                                                 | Meaningful but lower priority than core App Router.                                                                                                              |
| N8  | **React Server Components boundary graph (beyond simple `"use client"` tag)** | next-devtools-mcp's "RSC graph" is the state of the art; expensive to replicate without a running dev server. v2.                                                |
| N9  | **Non-Next.js parsers (RN, Vue, Svelte)**                                     | PROJECT.md explicitly out-of-scope for v1; architecture is pluggable, add once the Next.js parser ships & validates.                                             |
| N10 | **HTTP transport, hosted mode**                                               | Out-of-scope per PROJECT.md.                                                                                                                                     |
| N11 | **Structural edit tools (`wrap_with`, `move_component`)**                     | Explicitly out-of-scope per PROJECT.md. Agents already have `Edit`.                                                                                              |

### Anti-Features (Commonly Requested, Often Problematic)

Things that sound good for a code-intelligence MCP but are **actively harmful** in this specific context (static analysis for agent UI editing).

| #   | Anti-Feature                                                                                        | Why Requested                             | Why Problematic                                                                                                                                                                                                                                  | Alternative                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **"Dump the whole component tree for the whole app" as the default tool**                           | Feels complete, mirrors `ls -R`.          | Guaranteed context blowout on any non-trivial Next.js app — the MCP token-bloat literature specifically calls out "serializing everything" as the canonical MCP failure mode. Coderabbit, Glama, and MCP spec authors all flag this.             | **Force a `route` argument** on `get_full_hierarchy`. Make `get_route_map()` the discoverability tool (cheap), `focus_on` the drill-down. |
| A2  | **Return full source code of each node**                                                            | "The agent might want it."                | It has `Read`. We duplicate its file-reading tool in every response, burning 10x the tokens for no marginal value. Aider repomap explicitly _doesn't_ include full source — just key signatures.                                                 | file:line on every node. Agent calls `Read` when it actually needs source.                                                                |
| A3  | **Resolve every `className` through every `cn()` variant at query time with a full JS interpreter** | 100% accurate style extraction.           | Requires evaluating arbitrary JS (security, perf, correctness on dynamic inputs). Prototype's token-collector is string-level and "good enough" — anything further is runtime territory.                                                         | Best-effort string/identifier collection (current prototype approach). Flag nodes where the analysis was partial.                         |
| A4  | **A generic `run_query(selector)` tool that takes arbitrary AST queries**                           | Flexibility. Power users want it.         | Violates "tools should reduce search space in as few calls as possible." Puts query-language semantics on the agent's plate; every agent will invent its own syntax. ast-grep-mcp does this — but it's a _general-purpose_ tool; we're vertical. | Fixed, named tools with clear semantics. Add more tools over time, not a query DSL.                                                       |
| A5  | **Deeply recursive tree expansion by default (no depth cap, no duplicate folding)**                 | "Complete" view.                          | Prototype's `expandedComponents` set exists precisely because duplicate expansion explodes output. Uncapped depth kills the context window.                                                                                                      | Fold duplicates to "see above" (prototype does this). Make `maxDepth` a parameter on full-tree calls.                                     |
| A6  | **Screenshot/image input**                                                                          | "Close the loop on visual → code."        | PROJECT.md explicitly out-of-scope — agents already have vision. Adding image handling doubles surface area, drags in ML deps, and muddles the value proposition.                                                                                | Bring-your-own-vision. Agent extracts text/style hints from screenshot, calls `find_by_text` / `find_by_style`.                           |
| A7  | **Runtime execution / running the dev server to inspect the live DOM**                              | Accuracy — static analysis misses things. | PROJECT.md constraint: static-analysis only. Also makes the MCP non-deterministic, platform-specific, slow to start. **next-devtools-mcp already occupies this niche** — we're the complement, not the competitor.                               | Stay static. Advertise complementarity with next-devtools-mcp.                                                                            |
| A8  | **Style computation / merged-styles resolution (what color will this actually be?)**                | Agents want the "computed" style.         | Requires the Tailwind compiler, CSS cascade, design-token resolution — massive surface.                                                                                                                                                          | Return _raw_ declarations. Agent can ask the user or inspect the rendered app.                                                            |
| A9  | **Rich metadata on every node: JSDoc, TypeScript inferred types, generics**                         | Completeness.                             | Each of these 3-10x's response size and is rarely what the agent needs for a UI layout edit.                                                                                                                                                     | Defer all of these to per-tool opt-ins. Default output stays lean.                                                                        |
| A10 | **Returning XML**                                                                                   | "Claude prefers XML for structured data." | Modern experimentation (Checksum, ImprovingAgents) shows XML costs ~80% more tokens than Markdown/JSON for equivalent content; LLMs handle Markdown trees natively.                                                                              | Markdown default + JSON opt-in. No XML.                                                                                                   |
| A11 | **Persistent state between calls (session, selection, undo history)**                               | IDE-like UX.                              | MCP stdio is per-invocation; stateful servers create correctness bugs when the filesystem changes underneath them.                                                                                                                               | Stateless per call. All context passed explicitly in tool args.                                                                           |
| A12 | **Logging / telemetry of agent behavior**                                                           | "Learn what agents ask for."              | Privacy concerns; adds dependencies; orthogonal to the product.                                                                                                                                                                                  | Let users opt in later via their MCP client's own tracing.                                                                                |

---

## Feature Dependencies

```
T9 (App Router conventions) ── enables ──> T1 (get_full_hierarchy)
T10 (dynamic segments)       ── enables ──> T1, D5 (get_route_map)
T15 (path aliases)           ── enables ──> T1 (resolving imports across the tree)
T5 (file:line)               ── enables ──> T3, T4, D1, D8 (all lookup tools)

T1 (get_full_hierarchy) ── is indexed by ──> T2 (focus_on), T3 (find_by_text), T4 (find_by_style)
  (all three need a tree already built in memory for the query)

T7 (style extraction) ── enables ──> T4 (find_by_style), D4 (normalized Tailwind match), D6 (layoutOnly)
T8 (branches)         ── enables ──> D12 (condition labels)
T13 (text)            ── enables ──> T3 (find_by_text)

D2 (props on nodes)   ── enhances ──> T1, T2, D1 (richer tree)
D3 (slot flow)        ── required by ──> T1 for App Router layouts to render correctly
D7 (stable path IDs)  ── enhances ──> T2 (focus_on can take a path, not just name)
D8 (find_by_text returns tree context) ── depends on ──> D1's ancestor-chain logic
D10 (pagination)      ── depends on ──> T1 working at all

A1 (dump everything) ── conflicts with ──> everything token-sensitive
A4 (run_query DSL)   ── conflicts with ──> T2/T3/T4 (undermines their discoverability)
```

### Dependency Notes

- **T9+T10+T15 are foundation**: the parser can't even build a correct tree without App Router file conventions, dynamic segments, and path aliases. These must land first, in the same phase as T1.
- **T1 is the indexing step**: T2/T3/T4 are queries over the tree T1 builds. In a stateless stdio server, each call rebuilds; future caching (N1) would hoist this.
- **T7 (style extraction) is the linchpin for T4 and D4/D6**: the whole "find/filter by style" capability collapses if the class-token collector is flaky. Invest here.
- **D1 (ancestor chain) is in the prototype — don't lose it.** It's the single highest-leverage presentation idea carrying over.
- **D3 (children slot flow) is table-stakes for App Router specifically**, even though the prototype built it for RN. Without it, every `<Layout>` node looks like a dead end.

---

## MVP Definition

### Launch With (v1)

- [x] T1 `get_full_hierarchy(route)` — core tool
- [x] T2 `focus_on(component, scope)` — prevents context blowout
- [x] T3 `find_by_text(query)` — primary lookup path
- [x] T4 `find_by_style(query)` — second lookup path
- [x] T5 file:line on every node
- [x] T6 markdown (default) + JSON output
- [x] T7 style extraction (Tailwind exact, CSS Modules by reference, inline `style` by literal, styled-components best-effort)
- [x] T8 conditional-render branches preserved
- [x] T9 App Router file conventions
- [x] T10 dynamic segments + route groups
- [x] T11 `"use client"` boundary annotation
- [x] T12 recursion + duplicate-subtree folding
- [x] T13 text content with truncation
- [x] T14 error-tolerant parsing
- [x] T15 tsconfig path alias resolution
- [x] T16 stdio + npm distribution
- [x] D1 ancestor-chain rendering (already in prototype — keep)
- [x] D3 slot flow (children tracking — already in prototype — keep)
- [x] D6 `layoutOnly` option (already in prototype — keep)
- [x] D12 branch condition labels (already in prototype — keep)

### Add After Validation (v1.x)

- [ ] D2 props as first-class node attributes — add when users ask for prop-aware edits
- [ ] D5 `get_route_map()` discovery tool — add once users complain about "where do I start?"
- [ ] D7 stable path IDs — add when file:line churn causes follow-up-call failures
- [ ] D8 `find_by_text` returns ancestor chain — cheap enhancement, add opportunistically
- [ ] D10 depth/pagination controls — add once a user hits a token-overrun on a real repo
- [ ] D11 summary/one-line mode — add alongside D5 if users want ultra-compact listings
- [ ] N2 `diff_between_routes` — add if repeated manual diffs in client chats
- [ ] N3 `summarize_component` — add when design-system users show up

### Future Consideration (v2+)

- [ ] D4 normalized Tailwind variant match — only if class-literal matching (T4) proves insufficient
- [ ] D9 styled-components / emotion template extraction — on demand, driven by user base
- [ ] N1 incremental cache / watch mode — gated on p95 perf showing a real problem
- [ ] N4 cross-file usages — only if users ask _and_ we see a good UX distinct from existing tools
- [ ] N5–N7 niceties — defer
- [ ] N8 RSC graph — only if we can build without a running dev server (else cede to next-devtools-mcp)
- [ ] N9 non-Next.js parsers — when there's user demand + a reference repo + a volunteer parser author

---

## Feature Prioritization Matrix

| #      | Feature                  | User Value | Implementation Cost | Priority     |
| ------ | ------------------------ | ---------- | ------------------- | ------------ |
| T1     | `get_full_hierarchy`     | HIGH       | MEDIUM              | P1           |
| T2     | `focus_on`               | HIGH       | MEDIUM              | P1           |
| T3     | `find_by_text`           | HIGH       | LOW                 | P1           |
| T4     | `find_by_style`          | HIGH       | MEDIUM              | P1           |
| T5     | file:line on nodes       | HIGH       | LOW                 | P1           |
| T6     | markdown + JSON          | HIGH       | LOW                 | P1           |
| T7     | style extraction         | HIGH       | MEDIUM              | P1           |
| T8     | branches preserved       | HIGH       | MEDIUM              | P1           |
| T9     | App Router conventions   | HIGH       | MEDIUM              | P1           |
| T10    | dynamic segments         | HIGH       | LOW                 | P1           |
| T11    | `"use client"` marker    | HIGH       | LOW                 | P1           |
| T12    | recursion/duplicate fold | HIGH       | LOW                 | P1 (have it) |
| T13    | text content             | MEDIUM     | LOW                 | P1           |
| T14    | error tolerance          | HIGH       | LOW                 | P1 (have it) |
| T15    | path aliases             | HIGH       | LOW                 | P1           |
| T16    | stdio + npm              | HIGH       | LOW                 | P1           |
| D1     | ancestor chain           | HIGH       | LOW (have it)       | P1           |
| D3     | slot flow                | HIGH       | LOW (have it)       | P1           |
| D6     | layoutOnly flag          | MEDIUM     | LOW (have it)       | P1           |
| D12    | branch condition labels  | HIGH       | LOW (have it)       | P1           |
| D2     | props on nodes           | MEDIUM     | MEDIUM              | P2           |
| D5     | `get_route_map`          | MEDIUM     | LOW                 | P2           |
| D7     | stable path IDs          | MEDIUM     | MEDIUM              | P2           |
| D8     | find_by_text + ancestors | MEDIUM     | LOW                 | P2           |
| D10    | depth/pagination         | MEDIUM     | MEDIUM              | P2           |
| D11    | summary mode             | MEDIUM     | LOW                 | P2           |
| D4     | normalized Tailwind      | LOW        | MEDIUM              | P3           |
| D9     | CSS-in-JS extraction     | LOW        | MEDIUM              | P3           |
| N1–N11 | all Nice-to-Haves        | varies     | varies              | P3           |

**Priority key:** P1 = v1 launch • P2 = v1.x post-validation • P3 = v2+

---

## Competitor / Comparable-Tool Feature Analysis

| Capability                                                               | Vercel next-devtools-mcp        | Serena (LSP-based)   | Aider repomap       | ast-grep-mcp            | tree-sitter MCP                | Storybook MCP            | **ui-to-hierarchy(us)**     |
| ------------------------------------------------------------------------ | ------------------------------- | -------------------- | ------------------- | ----------------------- | ------------------------------ | ------------------------ | --------------------------- |
| Next.js App Router–aware                                                 | YES (runtime)                   | No                   | No                  | No                      | No                             | No                       | **YES (static)**            |
| Works without running dev server                                         | No (needs live server)          | Yes                  | Yes                 | Yes                     | Yes                            | Needs built Storybook    | **Yes**                     |
| Returns a true render tree (not symbol list)                             | Partial (RSC graph via runtime) | No                   | No                  | No (returns AST slices) | Partial (AST, not render tree) | No (flat component list) | **Yes**                     |
| Layout chain + `{children}` slot-flow                                    | Yes (runtime)                   | No                   | No                  | No                      | No                             | No                       | **Yes**                     |
| Conditional-render branches preserved                                    | No                              | No                   | No                  | No                      | No                             | No                       | **Yes**                     |
| file:line on every node                                                  | Yes                             | Yes                  | Partial (def lines) | Yes                     | Yes                            | No                       | **Yes**                     |
| Style-aware query (Tailwind etc.)                                        | No                              | No                   | No                  | Possible via patterns   | No                             | No                       | **Yes**                     |
| Ancestor-chain focus mode                                                | No                              | No                   | No                  | No                      | No                             | No                       | **Yes**                     |
| Markdown ASCII tree output                                               | Partial                         | No (symbol JSON)     | Yes (custom format) | No (match hits)         | No                             | No                       | **Yes (default)**           |
| Runs on unmodified codebase (no dev server, no Storybook, no LSP server) | No                              | Needs LSP            | Yes                 | Yes                     | Yes                            | Needs Storybook          | **Yes**                     |
| Pluggable for non-Next.js frameworks                                     | No                              | Yes (LSP handles it) | Yes                 | Yes                     | Yes                            | Storybook-specific       | **Architecture yes, v1 no** |

**Key insight:** every comparable tool either (a) needs a running process (dev server, LSP, Storybook), or (b) works at the symbol/AST level rather than the render-tree level. The niche for static, App-Router-shaped, render-tree-with-layout-hints is genuinely open.

---

## Output-Format Decisions (Evidence-Based)

- **Default: Markdown ASCII tree** using `├── / └── / │` connectors. Evidence: Checksum's experiments (JSON ≈ Markdown overall, Markdown wins for documents/trees); Markdown uses 40–60% fewer tokens than equivalent XML for structural content; LLMs emit ASCII trees unprompted, indicating strong training-set prior.
- **Opt-in: JSON** via `format: "json"` parameter. Evidence: MCP clients increasingly want structured outputs for multi-step composition; JSON is universally parseable.
- **Rejected: XML** — ~80% more tokens for equivalent structural content; LLMs parse it less naturally than Markdown/JSON.
- **Rejected: S-expressions** — compact, but no existing LLM has strong training-set prior for rendering/consuming them; would require every agent to be prompted to understand the format.
- **Rejected: YAML** — indentation-sensitive, brittle when embedded in prompts that already use Markdown; no token advantage over JSON for trees.

---

## Sources

**Direct comparables (MCP servers and code-intelligence tools):**

- [Vercel next-devtools-mcp](https://github.com/vercel/next-devtools-mcp) — Next.js 16+ MCP exposing `get_page_metadata`, `get_project_metadata`; runtime-only
- [Next.js MCP Server Guide](https://nextjs.org/docs/app/guides/mcp)
- [Serena MCP](https://github.com/oraios/serena) — LSP-based symbol navigation for coding agents
- [Aider repomap](https://aider.chat/docs/repomap.html) — tree-sitter + PageRank for ranked, budgeted codebase context
- [Aider repomap deep-dive](https://deepwiki.com/Aider-AI/aider/4-repository-understanding-and-context)
- [ast-grep-mcp](https://github.com/ast-grep/ast-grep-mcp) — structural AST search as MCP tools
- [wrale/mcp-server-tree-sitter](https://github.com/wrale/mcp-server-tree-sitter) — tree-sitter AST/symbols as MCP tools
- [Storybook LLMs Extractor](https://github.com/Acring/storybook-llms-extractor) — component-metadata extraction for LLMs
- [Resharper MCP](https://github.com/joshua-light/resharper-mcp) — IDE-backed `find_usages`, `go_to_definition`
- [Synapps MCP](https://pypi.org/project/synapps-mcp/1.4.9/) — graph-based code intelligence with `find_usages`, `find_callees`

**Output format evidence:**

- [Checksum: JSON vs XML vs Markdown for LLM Tasks](https://checksum.ai/blog/does-output-format-actually-matter-an-experiment-comparing-json-xml-and-markdown-for-llm-tasks)
- [ImprovingAgents: Best Nested Data Format for LLMs](https://www.improvingagents.com/blog/best-nested-data-format/)
- [CraftMarkdown: Markdown vs JSON for LLMs](https://www.craftmarkdown.com/markdown-vs-json-for-llms)

**Context/token-budget evidence:**

- [Glama: Eliminating Token Bloat in MCP](https://glama.ai/blog/2025-12-14-code-execution-with-mcp-architecting-agentic-efficiency)
- [CodeRabbit: Ballooning Context in the MCP Era](https://www.coderabbit.ai/blog/handling-ballooning-context-in-the-mcp-era-context-engineering-on-steroids)
- [RavChat: MCP Token Bloat](https://www.ravchat.com/model-context-protocol-token-bloat)
- [JetBrains: Building LLM-Friendly MCP Tools](https://blog.jetbrains.com/ruby/2026/02/rubymine-mcp-and-the-rails-toolset/)

**MCP protocol references:**

- [MCP Pagination Specification](https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/pagination)
- [MCP Tool Design: Six-Tool Pattern](https://www.mcpbundles.com/blog/mcp-tool-design-pattern)

---

_Feature research for: ui-to-hierarchyMCP (Next.js App Router component-hierarchy extractor)_
_Researched: 2026-04-20_
