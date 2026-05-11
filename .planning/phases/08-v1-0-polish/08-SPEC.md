# Phase 8: v1.0 Polish — Specification

**Created:** 2026-05-11
**Ambiguity score:** 0.09
**Requirements:** 3 locked

## Goal

Markdown tool output reaches parity with JSON on warning surfacing, the integration suite exercises `format: "markdown"` end-to-end for at least 2 fixtures, and resolved component nodes carry the true declaration line from the parser instead of the `line: 1` placeholder.

## Background

V1.0 shipped with three known gaps carried forward in `.planning/STATE.md`:

1. `src/renderers/markdown.ts:107` (`renderMarkdown`) ignores the `_envelope` argument entirely — `envelope.warnings` populated by `Analyzer.ts` (e.g. lines 294, 308) reach JSON consumers via the envelope but never appear in markdown output.
2. `test/integration/mcp-e2e.test.ts` only asserts `format: "json"` — markdown rendering has zero integration coverage. Unit tests under `test/renderers/` cover small trees but not the MCP tool boundary.
3. `src/core/Analyzer.ts:304` hard-codes `line: 1` for resolved local-kind component nodes. The `ResolveResult` discriminated union in `src/adapters/types.ts:259` (`{ ok: true; kind: "local"; absolutePath: string }`) currently has no `line` field. Parser already builds AST per file via `@babel/parser`, so the declaration `loc.start.line` is available at parse time.

This phase closes those three gaps without touching JSON output semantics, schema version, or any v1.0 acceptance contract.

## Requirements

1. **Markdown warning surfacing (POLISH-01)**: `renderMarkdown` emits one HTML comment per warning above the tree.
   - Current: `renderMarkdown(tree, _envelope)` in [src/renderers/markdown.ts:107](src/renderers/markdown.ts#L107) ignores `_envelope.warnings`. Markdown output starts directly with the root node line.
   - Target: When `envelope.warnings` is non-empty, the markdown output starts with one `<!-- warning: {message} -->` line per warning (preserving array order), followed by a blank line, followed by the tree. When `warnings` is empty, output is byte-identical to v1.0 (no leading blank line, no comment block).
   - Acceptance: For an envelope with `warnings: ["a", "b"]`, the output's first three lines are `<!-- warning: a -->`, `<!-- warning: b -->`, `` (blank), then the existing root line. For `warnings: []`, output equals current v1.0 output byte-for-byte (snapshot unchanged).
2. **Integration coverage for markdown format (POLISH-02)**: Integration tests exercise `format: "markdown"` end-to-end via the MCP tool boundary for ≥2 fixtures.
   - Current: [test/integration/mcp-e2e.test.ts](test/integration/mcp-e2e.test.ts) has no `format: "markdown"` calls; markdown-format integration coverage is 0 fixtures.
   - Target: New integration cases call each tool (or a representative subset that exercises `renderMarkdown`) with `format: "markdown"` against `test/fixtures/phase-05/micro` and `test/fixtures/phase-05/kitchen-sink`. Each case asserts: (a) at least one tree glyph (`├──`, `└──`, or `│`) is present, (b) every non-comment line contains the ` @ ` file:line separator, (c) the full output string does not contain a literal backslash (`expect(out).not.toContain('\\')`).
   - Acceptance: `vitest run test/integration` includes ≥2 new test cases tagged for markdown format covering the two fixtures above; all three assertions (glyph, `@` separator, no backslash) execute and pass.
3. **True declaration line on resolved component nodes (POLISH-03)**: Resolved local-kind component nodes report the actual source declaration line.
   - Current: [src/core/Analyzer.ts:304](src/core/Analyzer.ts#L304) sets `line: 1` for every resolved local-kind component. `ResolveResult` local variant ([src/adapters/types.ts:260](src/adapters/types.ts#L260)) does not carry a line. Parser populates `ParseResult` (cached in `ctx.astCache`) but does not expose component declaration lines.
   - Target: The parser/IR pipeline records a declaration-line lookup per parsed file (component-name → line) at parse time using Babel `loc.start.line`. The local-kind `ResolveResult` exposes the resolved declaration line (or the adapter populates it via the parser cache), and `resolveComponentCallsites` writes that line onto the `TreeNode` instead of `1`. No additional re-parsing of files is introduced; lookup uses existing `ctx.astCache`.
   - Acceptance: For a fixture with a named component declared at a line > 1 (e.g. a fixture file where `export function Foo()` starts on line ≥ 3), invoking any tool against the fixture and locating the resolved `Foo` component node in the resulting tree shows `node.line` equal to the actual declaration line, not `1`. A regression test asserts this on a deterministic fixture.

## Boundaries

**In scope:**
- Modifying `renderMarkdown` to read `envelope.warnings` and emit HTML-comment lines
- Adding ≥2 integration test cases for `format: "markdown"` covering `phase-05/micro` and `phase-05/kitchen-sink`
- Adding a component-declaration-line lookup to the parser output (per-file map populated during the existing parse pass)
- Extending the local-kind `ResolveResult` (or the resolve-path data flow) so the declaration line propagates to `TreeNode.line`
- Replacing `line: 1` at [src/core/Analyzer.ts:304](src/core/Analyzer.ts#L304) with the looked-up line
- Updating affected unit tests / snapshots that previously asserted `line: 1` on resolved local nodes

**Out of scope:**
- JSON renderer changes — JSON already surfaces `warnings`; no change to envelope shape or schemaVersion
- Adding a column number to resolved nodes — only line is in scope (TreeNode schema does not carry column)
- Resolving external-kind components to a true line — they intentionally keep call-site `file:line` (D-12/D-13 contract)
- Performance work, caching changes, or watch mode — explicitly deferred (PROJECT.md constraint: cache deferred)
- Markdown layout-hint formatting changes — only the warning prefix block is added
- Cleaning up the two orphan exports in `src/mcp/errors.ts` — deferred to v1.2 per STATE.md
- F-01 live Claude Code transcript export — separate carry-forward, not part of polish
- Adding new MCP tools or changing tool signatures

## Constraints

- `EnvelopeSchema` ([src/ir/envelope.ts:10](src/ir/envelope.ts#L10)) MUST remain unchanged — `schemaVersion: "1"` is consumer-facing
- No new runtime dependencies — fix uses existing `@babel/parser` / `@babel/traverse` / `@babel/types` and existing `ctx.astCache`
- Paths in markdown output MUST stay forward-slash only (D-07) — backslash-guard assertion enforces this on Windows
- The parser-side declaration-line lookup MUST be populated during the existing parse pass (no second pass, no re-parse)
- When `envelope.warnings` is empty, markdown output MUST be byte-identical to v1.0 (existing snapshots must not change)
- All changes MUST keep `engines.node >=20` and ESM-only output

## Acceptance Criteria

- [ ] `renderMarkdown` emits `<!-- warning: {msg} -->` line per warning (in array order) followed by a blank line, then the tree, when `envelope.warnings.length > 0`
- [ ] `renderMarkdown` output is byte-identical to v1.0 when `envelope.warnings.length === 0` (existing snapshots unchanged)
- [ ] `test/integration/mcp-e2e.test.ts` (or sibling integration file) exercises `format: "markdown"` against `test/fixtures/phase-05/micro` and `test/fixtures/phase-05/kitchen-sink`
- [ ] Each markdown integration case asserts: glyph present, `@` separator on every non-comment line, no backslash in output string
- [ ] Resolved local-kind component nodes in any tool response carry the true declaration `line` (not `1`), verified on a fixture where a component is declared past line 1
- [ ] `Analyzer.ts` no longer contains a hard-coded `line: 1` for resolved local components
- [ ] `EnvelopeSchema` is unchanged (no schemaVersion bump, no new fields added or removed)
- [ ] `vitest run` passes (existing + new tests) on Node 20
- [ ] All 3 POLISH requirements in `.planning/REQUIREMENTS.md` flip from `[ ]` to `[x]`

## Ambiguity Report

| Dimension          | Score | Min   | Status | Notes                                                                 |
| ------------------ | ----- | ----- | ------ | --------------------------------------------------------------------- |
| Goal Clarity       | 0.95  | 0.75  | ✓      | 3 concrete deliverables tied to existing file:line locations          |
| Boundary Clarity   | 0.88  | 0.70  | ✓      | Explicit out-of-scope list including JSON, schema, orphan exports     |
| Constraint Clarity | 0.85  | 0.65  | ✓      | Schema-frozen, no new deps, byte-identical when no warnings           |
| Acceptance Criteria| 0.92  | 0.70  | ✓      | 9 pass/fail checkboxes; deterministic fixture verification            |
| **Ambiguity**      | 0.09  | ≤0.20 | ✓      |                                                                       |

## Interview Log

| Round | Perspective     | Question summary                                | Decision locked                                                              |
| ----- | --------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| 0     | Researcher (scout) | What exists today re markdown/warnings/line:1? | renderMarkdown ignores envelope; line:1 hard-coded at Analyzer.ts:304        |
| 1     | Boundary Keeper | Exact warning block format in markdown?         | One `<!-- warning: ... -->` per line, then blank line, then tree             |
| 1     | Boundary Keeper | Which 2 fixtures for POLISH-02 integration?     | `phase-05/micro` + `phase-05/kitchen-sink`                                   |
| 1     | Boundary Keeper | Source of true component line?                  | Parser caches declaration-line map at parse time; no re-parse                |

---

*Phase: 08-v1-0-polish*
*Spec created: 2026-05-11*
*Next step: /gsd-discuss-phase 8 — implementation decisions (where to store the line map, ResolveResult shape change vs adapter-side lookup, integration test placement)*
