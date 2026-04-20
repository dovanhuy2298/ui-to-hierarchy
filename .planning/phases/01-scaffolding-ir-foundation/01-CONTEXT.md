# Phase 1: Scaffolding & IR Foundation - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Project skeleton compiles and the IR (intermediate representation) + renderers are provably correct against hand-written fixtures — independent of any parser. No Babel parsing happens in this phase. The parser, adapters, and real MCP server all come later (Phases 2–5).

Scope anchor: deliver (a) an ESM bundle with shebanged `bin/ui-to-hierarch`, (b) typed IR definitions, (c) markdown + JSON renderers that round-trip hand-written fixtures, (d) the Babel traverse ESM interop shim (covered by test even though no parsing happens yet), and (e) the project-root resolution helper (ARCH-03).

</domain>

<decisions>
## Implementation Decisions

### IR Node Kinds (D-01 — D-03)
- **D-01:** IR v1 supports nine node kinds via zod `discriminatedUnion("kind", ...)`:
  `component`, `element`, `text`, `branch`, `list`, `slot`, `error`, `fragment`, `spread`.
- **D-02:** No `unknown` kind. Expressions we cannot statically reason about are dropped silently in Phase 3 extractors (not this phase's concern; noted so Phase 3 planner doesn't add a kind).
- **D-03:** Fragments (`<>...</>`) are a first-class IR node, NOT flattened into the parent. Spreads (`{...props}`, spread children) are also a first-class IR node so agents see dynamic expansion points.

### IR Schema Authoring (D-04, D-05)
- **D-04:** Zod is the single source of truth for the IR. TS types are inferred via `z.infer<typeof TreeNodeSchema>`. No hand-written `interface TreeNode` alongside the zod schema.
- **D-05:** Fixture round-trip tests (SC-2, SC-3) parse fixture objects through the zod schema at test time — validation is free because zod@4 is already required for MCP tool inputs (Phase 2).

### File:Line Attachment (D-06, D-07)
- **D-06:** Every IR node has flat fields `file: string` and `line: number`. Matches prototype's `fileRel` style. `column` is reserved for future use but NOT added in v1.
- **D-07:** `file` is always **relative to `resolvedRoot`** and uses **forward slashes** even on Windows (satisfies ROADMAP Phase 1 SC-2). Absolute paths are never emitted from IR.

### Markdown Renderer Format (D-08 — D-11)
- **D-08:** Tree glyphs: box-drawing `├──`, `└──`, `│` (Unicode). No ASCII fallback in v1.
- **D-09:** `file:line` suffix at end of line, separated by ` @ `:
  `├── <Card> flex gap-4 p-6 @ app/page.tsx:12`
- **D-10:** Per-kind label conventions:
  - `component` → `<Name>` (angle brackets signal JSX)
  - `element` → `div` / `span` / … (lowercase, no brackets)
  - `text` → `"..."` (double-quoted literal, truncate long text with ellipsis — length policy TBD in planning)
  - `branch` → `? cond` (the condition expression, source-serialized)
  - `list` → `.map` (marker only; item template is the single child)
  - `slot` → `{children}` or `@slotName`
  - `error` → `! <parse error message>`
  - `fragment` → `<>`
  - `spread` → `{...expr}`
- **D-11:** Layout hints (OUT-02, populated from Phase 3) render **inline between the node label and the `@ file:line`** suffix. Phase 1 renderer accepts an optional `layoutHint?: string` field on the IR node; when empty, nothing is emitted. Phase 1 fixtures exercise this path with hand-written hints so the renderer is ready for Phase 3.

### JSON Renderer & Envelope (D-12 — D-15)
- **D-12:** Discriminator field is `kind` (matches prototype and zod `discriminatedUnion` convention).
- **D-13:** Every JSON response carries `schemaVersion: "1"` at the envelope level so future breaking changes are detectable by clients.
- **D-14:** Metadata envelope fields (all required in v1): `resolvedRoot` (ARCH-03), `toolVersion` (read from package.json at build time via tsup replace), `warnings: string[]` (empty array in Phase 1; populated from Phase 3 onward), `generatedAt` (ISO 8601 timestamp).
- **D-15:** Envelope shape:
  ```json
  {
    "schemaVersion": "1",
    "resolvedRoot": "E:/repo",
    "toolVersion": "0.1.0",
    "generatedAt": "2026-04-20T12:34:56.000Z",
    "warnings": [],
    "tree": { /* TreeNode */ }
  }
  ```
  The markdown renderer returns the `tree` rendered as a string plus the same envelope metadata in a companion structure (shape to be finalized in planning — stays consistent with this JSON shape).

### Directory Layout (D-16, D-17)
- **D-16:** `src/` is organized as 5 islands plus `cli.ts`:
  ```
  src/
    ir/         # Zod schemas + inferred TS types; pure, no side effects
    renderers/  # markdown.ts, json.ts; read IR, emit string/object
    core/       # Analyzer orchestration (Phase 5 target) — placeholder in Phase 1
    adapters/   # Framework plugins (Phase 3+) — placeholder in Phase 1
    mcp/        # stdio server + tool definitions (Phase 2) — placeholder in Phase 1
    cli.ts      # bin entry
  ```
  Phase 1 creates `ir/`, `renderers/`, and `cli.ts`. `core/`, `adapters/`, `mcp/` exist as empty directories with a `.gitkeep` or a stub `index.ts` so ARCH-01 boundaries can be asserted from day one.
- **D-17:** ARCH-01 island rule enforced via ESLint `no-restricted-imports` (or Biome equivalent if Biome is picked during planning). CI fails if `ir/` or `renderers/` or `core/` import anything under `adapters/`. No dependency-cruiser / madge in v1. The ESLint rule is part of Phase 1 deliverables — it must fail loudly if someone later breaks the boundary.

### Fixture Strategy (D-18)
- **D-18:** Test fixtures for SC-2 / SC-3:
  - One **kitchen-sink** fixture (`test/fixtures/ir/kitchen-sink.ts`) exercising every one of the 9 node kinds (component nested in component, element, text, branch with both ternary and `&&`, list with `.map`, slot, error, fragment, spread) with hand-picked layout hints on a few nodes.
  - 2–3 **small focused** fixtures for edge cases (empty tree, single leaf node, deeply nested branch).
  - Markdown output tested via `toMatchFileSnapshot` (vitest). JSON output tested via `toMatchInlineSnapshot` for the small fixtures and via zod schema validation for the kitchen-sink.

### CLI Behavior in Phase 1 (D-19)
- **D-19:** `bin/ui-to-hierarch` stub prints `"mcp server not implemented yet"` to stderr and exits 0. Enough to satisfy SC-1 (build + shebang present + executable). Real MCP stdio server lands in Phase 2. No `--help`, no `--version`, no file/stdin handling in Phase 1.

### Babel Interop Shim (D-20)
- **D-20:** Although no parsing happens in Phase 1, the `traverse.default ?? traverse` ESM/CJS interop shim is written and unit-tested now (SC-4). The shim lives at `src/core/babel-shim.ts` (one of the placeholder files in `core/`). Test imports `@babel/traverse` through the shim and asserts the result is a callable function. Any future regression (Babel version bump breaking interop) fails this test loudly.

### Project-Root Resolution (D-21)
- **D-21:** Helper at `src/core/resolve-root.ts`. Resolution order: explicit arg > `UI_TO_HIERARCH_ROOT` env var > `process.cwd()` (ARCH-03). Returns an **absolute, forward-slash-normalized** path. Used by the envelope builder to populate `resolvedRoot`. Unit-tested for all three branches plus Windows path normalization.

### Claude's Discretion

Not captured above — downstream agents have latitude on these choices provided they respect locked decisions:
- Exact ESLint vs Biome pick (CLAUDE.md greenfield: either is fine).
- Exact test fixture file names / directory layout under `test/`.
- Whether to split zod schema into per-kind files or keep one file in `ir/`.
- How to implement text truncation in markdown renderer (character limit, suffix marker).
- Whether `schemaVersion` lives as a top-level envelope field or as a `meta.schemaVersion` nested field — either is acceptable as long as it's stable.

### Folded Todos

None — no pending todos matched this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — Vision, key decisions, in/out of scope list
- `.planning/REQUIREMENTS.md` — specifically **OUT-01** and **ARCH-03** (Phase 1 requirements)
- `.planning/ROADMAP.md` §"Phase 1: Scaffolding & IR Foundation" — locked success criteria (SC-1…SC-5)

### Tech stack (prescriptive, pinned)
- `CLAUDE.md` §"Technology Stack" — every version pinned (MCP SDK ^1.29, zod ^4.1, @babel/parser ^7.29, tsup ^8.5, vitest ^4.3, Node ≥20, tsx ^4.21)
- `CLAUDE.md` §"Packaging (npm CLI via npx)" — tsup config shape, `bin`, `engines`, shebang handling
- `CLAUDE.md` §"What NOT to Use" — forbidden choices (SDK pre-1.0, `@babel/core`, HTTP transports, zod v3, ts-node, `tsc` as bundler, fast-glob, Bun in shipped path, naive `import traverse from "@babel/traverse"`)

### Reference code
- `generate-component-hierarchy.ts` (repo root) — prototype. HIGH relevance for:
  - Line 96–114: existing `JSImport`, `RenderFlow`, `ComponentDefinition`, `TreeNode` types — the starting point we are **redesigning**, not porting verbatim (prototype has 5 kinds; v1 IR has 9)
  - `parseAst` plugin set — reuse in Phase 3
  - `rel(filePath)` — forward-slash normalization pattern we adopt for D-07

### External docs (for planning to fetch fresh)
- MCP TypeScript SDK server docs: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md (needed mostly in Phase 2, but envelope shape here should stay compatible with SDK response conventions)
- Babel traverse ESM interop issue #13855 — justifies the D-20 shim test
- Vitest snapshot guide — `toMatchFileSnapshot` / `toMatchInlineSnapshot` for D-18 fixtures

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`generate-component-hierarchy.ts` prototype types** (lines 96–114): the `TreeNode` shape is a close-but-not-equal ancestor of v1 IR. Kinds expand from 5 → 9; fields move from `fileRel` to `file`; `recursive`/`duplicate` flags may or may not carry over (revisit in Phase 3). Do not import from the prototype — it's a Bun script and lives outside `src/`.
- **`rel(filePath)` helper** (prototype line 117–119): shows the canonical Windows-safe relative-path normalization pattern (`path.relative` + `split(sep) + join("/")`). D-07 adopts this.
- **`parseAst` plugin list** (prototype line 121–127): `["jsx", "typescript", "classProperties", "decorators-legacy", "dynamicImport", "topLevelAwait"]` — will be reused in Phase 3. Phase 1 doesn't need it but noting here so Phase 3 research doesn't re-derive it.

### Established Patterns
- No conventions yet (greenfield repo — only the prototype + CLAUDE.md + .planning/ exist). Phase 1 is where conventions get set. Downstream phases will inherit:
  - Zod-first schema authoring (D-04)
  - Flat `file`/`line` on every node (D-06)
  - Forward-slash paths everywhere (D-07)
  - Island boundaries enforced by ESLint (D-17)

### Integration Points
- `bin` entry declared in `package.json` (CLAUDE.md pins name `ui-to-hierarch`). The tsup build emits `dist/cli.js` with shebang via `banner.js` — Phase 2 will replace the stub body with real MCP server startup, but the `bin` wiring is complete after Phase 1.
- Envelope shape (D-15) is the contract Phase 2 MCP tool handlers will return. Don't change shape without revisiting Phase 2 plans.

</code_context>

<specifics>
## Specific Ideas

- User prefers the **angle-bracketed component label** `<Card>` to distinguish components from lowercase DOM elements — came up in D-10. Downstream agents should NOT drop the angle brackets in future renderers.
- Box-drawing Unicode glyphs are acceptable on user's platform (Windows 11) — no ASCII fallback asked for (D-08). If Phase 6 hardening finds clients that can't render Unicode, revisit there.
- The `@ file:line` separator (not `[file:line]` or column-prefix) is the chosen style — D-09.

</specifics>

<deferred>
## Deferred Ideas

### From discussion
- **`unknown` IR kind for unreasonable expressions** — user declined in D-02. If Phase 3 finds real-world cases where silently dropping is worse than surfacing, revisit as a Phase 3 spec amendment.
- **Text truncation policy for markdown renderer** — deliberately not locked; left to planner's discretion (Claude's Discretion section). Revisit if Phase 6 real-client testing shows long text children blow up output size.
- **`column` field on IR nodes** — reserved but not implemented (D-06). Add when a consumer needs to highlight a sub-line span.
- **Dependency-cruiser / madge for boundary enforcement** — declined in favor of ESLint rule (D-17). Revisit if the rule proves insufficient (e.g., dynamic imports slip through).
- **CLI dev helper mode** (accept TSX via stdin, print tree) — declined for Phase 1 scope (D-19). Could become a `--debug` flag in Phase 6 or a separate `ui-to-hierarch-dev` bin.

### Reviewed Todos (not folded)
None — no todos matched.

</deferred>

---

*Phase: 01-scaffolding-ir-foundation*
*Context gathered: 2026-04-20*
