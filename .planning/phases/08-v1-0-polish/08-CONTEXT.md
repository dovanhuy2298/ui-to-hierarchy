# Phase 8: v1-0-polish - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the three v1.0 carry-forward gaps documented in `.planning/STATE.md`:
1. Markdown renderer surfaces `envelope.warnings` as HTML comments.
2. MCP integration suite exercises `format: "markdown"` end-to-end on ≥2 fixtures.
3. Resolved local-kind component nodes carry the true declaration line instead of the `line: 1` placeholder.

No JSON output, schema, or v1.0 acceptance contract changes.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**3 requirements are locked.** See `08-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `08-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Modifying `renderMarkdown` to read `envelope.warnings` and emit HTML-comment lines
- Adding ≥2 integration test cases for `format: "markdown"` covering `phase-05/micro` and `phase-05/kitchen-sink`
- Adding a component-declaration-line lookup to the parser output (per-file map populated during the existing parse pass)
- Extending the local-kind `ResolveResult` so the declaration line propagates to `TreeNode.line`
- Replacing `line: 1` at `src/core/Analyzer.ts:304` with the looked-up line
- Updating affected unit tests / snapshots that previously asserted `line: 1` on resolved local nodes

**Out of scope (from SPEC.md):**
- JSON renderer changes — JSON already surfaces `warnings`; no envelope/schemaVersion change
- Adding a column number to resolved nodes
- Resolving external-kind components to a true line (keeps call-site `file:line` per D-12/D-13)
- Performance work, caching changes, watch mode (cache deferred per PROJECT.md)
- Markdown layout-hint formatting changes
- Cleaning up orphan exports in `src/mcp/errors.ts` (deferred to v1.2)
- F-01 live Claude Code transcript export
- Adding new MCP tools or changing tool signatures

</spec_lock>

<decisions>
## Implementation Decisions

### Line Map Storage Shape
- **D-01:** Extend `ParseResult.ok` with a `declLines: Map<string, number>` field. The parser computes this map once in `parseFile` (in `src/core/parser/index.ts`) immediately after `@babel/parser` produces the AST, before the result is cached into `ctx.astCache`. AST and component-line lookup live together — no parallel cache to keep in sync. Updates the discriminated union in `src/adapters/types.ts:304` (`'ok'` variant only — `'error'` variant unchanged).

### Resolve Flow — ResolveResult Shape
- **D-02:** Extend `ResolveResult` local variant to `{ ok: true; kind: "local"; absolutePath: string; line: number }` (`src/adapters/types.ts:260`). Adapter's `resolveModule` is responsible for populating `line`: after resolving the absolute path, it calls `parseFile(ctx, absolutePath)` (cache-friendly — re-uses `ctx.astCache`), then reads `parseResult.declLines.get(importedName)`. `Analyzer.ts:304` then writes `result.line` onto the resolved `TreeNode` instead of the hard-coded `1`.
- **D-03:** Fallback rule: if `declLines.get(importedName)` is `undefined` (default export with no matching name, re-export indirection, or parse failure on the target file), the adapter returns `line: 1`. This preserves current v1.0 behavior for cases we don't detect, and unit tests that previously asserted `line: 1` for such cases continue to pass.
- **D-04:** `external` / `not-found` / `cycle` / `ambiguous` variants of `ResolveResult` are unchanged — D-12/D-13 contract preserved. External components still carry the call-site `file:line` (per existing `Analyzer.ts:312` comment "external or unresolved: preserve call-site file:line").

### Integration Test Placement
- **D-05:** Create a new file `test/integration/mcp-markdown.test.ts` (sibling to existing `test/integration/mcp-e2e.test.ts`). Format-specific concern stays isolated; existing `mcp-e2e.test.ts` keeps its JSON focus untouched.
- **D-06:** If the existing `mcp-e2e.test.ts` has inline server-spawn / fixture-root setup, extract those into `test/integration/_helpers.ts` and import from both files. If the existing setup is already a small, easily-copied block (≤~10 lines), inline-duplicate is acceptable rather than forcing a refactor. Planner decides based on what's already there.
- **D-07:** The two markdown integration cases target `test/fixtures/phase-05/micro` and `test/fixtures/phase-05/kitchen-sink` (per SPEC POLISH-02). Each case asserts: (a) at least one tree glyph (`├──`, `└──`, or `│`), (b) every non-comment line contains ` @ ` separator, (c) `expect(out).not.toContain('\\')` (D-07 backslash guard, critical on Windows).

### Claude's Discretion
- Naming of the new map field (`declLines` is the working name — planner may rename if a clearer convention emerges).
- Whether `declLines` is computed by an inline traversal in `parseFile` or by a small helper (`collectDeclLines(ast)`) in `src/core/parser/`.
- Which Babel node kinds to record: at minimum `FunctionDeclaration`, `VariableDeclarator` (for `const Foo = () => ...`), `ClassDeclaration`, and names re-exported via `ExportSpecifier`. Default exports without a binding name are not recordable — fallback rule (D-03) handles them.
- Test helper extraction shape (D-06) — planner reads `mcp-e2e.test.ts` and decides.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements
- `.planning/phases/08-v1-0-polish/08-SPEC.md` — Locked requirements, boundaries, acceptance criteria. MUST read before planning.

### Project-level
- `.planning/PROJECT.md` — v1 scope, "cache deferred" constraint
- `.planning/STATE.md` — source of truth for the three carry-forward gaps this phase addresses
- `.planning/REQUIREMENTS.md` — POLISH-01/02/03 checkboxes that flip on completion

### Decisions this phase touches
- D-02 (per-call `astCache`) — `src/adapters/types.ts:319-330` (`ParseContext`)
- D-07 (forward-slash only paths) — enforced by backslash guard in markdown tests
- D-12/D-13 (`resolveModule` no-throw, discriminated `ResolveResult`) — `src/adapters/types.ts:253-264`
- `EnvelopeSchema` (`schemaVersion: "1"` frozen) — `src/ir/envelope.ts:10`

### Files this phase modifies
- `src/renderers/markdown.ts:107` (`renderMarkdown` — uses `_envelope`)
- `src/core/parser/index.ts:26` (`parseFile` — populate `declLines`)
- `src/core/Analyzer.ts:299-305` (write `result.line` instead of `1`)
- `src/adapters/types.ts:260` (extend `ResolveResult` local variant)
- `src/adapters/types.ts:304` (extend `ParseResult` ok variant)
- `src/adapters/next/*` (whichever file implements `resolveModule` — populates `line`)
- `test/integration/mcp-markdown.test.ts` (new)
- Snapshot files under `test/renderers/` and any unit tests asserting `line: 1` on resolved local nodes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ctx.astCache: Map<string, ParseResult>` already keyed by forward-slash absolute path — `parseFile` already cache-hits on re-entry. Adapter's added `parseFile(ctx, absolutePath)` call in the resolve path is free on cache hit.
- `parseFile` already returns a discriminated union with `kind: "ok" | "error"` — adding `declLines` to the `ok` branch is a localized change.
- `@babel/parser` already produces AST with `loc.start.line` on every node — no parser config change needed.

### Established Patterns
- Pure-function parser layer (D-01) — `parseFile` stays pure; `declLines` computation is deterministic from the AST.
- No-throw contract (D-12) — `resolveModule`'s new `parseFile` call must handle `kind: "error"` by falling back to `line: 1` (D-03), never throwing.
- In-band warnings (D-?? in Analyzer comments) — if a declaration lookup misses unexpectedly, do NOT push to `ctx.warnings` for the fallback path; it's expected behavior for default exports.

### Integration Points
- `src/adapters/next/*` `resolveModule` — single place that constructs `{ ok: true, kind: "local", absolutePath }`. This is where the new `parseFile` lookup + `line` population happens.
- `src/core/Analyzer.ts:299-305` — single read site for `result.absolutePath`; same site adds `line: result.line` instead of `line: 1`.
- `renderMarkdown(tree, _envelope)` in `src/renderers/markdown.ts:107` — rename `_envelope` → `envelope`, prepend warning-comment block when `envelope.warnings.length > 0`. Existing `walk()` and snapshot output unchanged for empty-warnings case.

</code_context>

<specifics>
## Specific Ideas

- Markdown warning prefix format is locked by SPEC §1 acceptance: `<!-- warning: {message} -->` per warning (array order), then one blank line, then existing root line. For `warnings: []`, byte-identical to v1.0 output (no leading blank line).
- Fixture choice for POLISH-02 is locked by SPEC: `phase-05/micro` + `phase-05/kitchen-sink`.
- Regression test for POLISH-03 needs a fixture where a named component declaration starts at line ≥ 3 (so `line: 1` vs true line is observable). May need to add a small test fixture if no existing fixture qualifies.

</specifics>

<deferred>
## Deferred Ideas

- Parametrizing existing `mcp-e2e.test.ts` cases as `describe.each([{ format: 'json' }, { format: 'markdown' }])` for full parity coverage — out of scope for v1.0 polish; revisit when the test suite grows past the point where one-off format files become unwieldy.
- Recording column numbers on resolved nodes — SPEC explicitly out-of-scope; `TreeNode` schema does not carry column.
- True line for external-kind components — D-12/D-13 contract intentionally keeps call-site `file:line`.
- Orphan export cleanup in `src/mcp/errors.ts` — deferred to v1.2 per STATE.md.
- F-01 live Claude Code transcript export — separate carry-forward, not part of polish.
- Cross-call AST cache / watch mode — PROJECT.md constraint "cache deferred".

</deferred>

---

*Phase: 08-v1-0-polish*
*Context gathered: 2026-05-11*
