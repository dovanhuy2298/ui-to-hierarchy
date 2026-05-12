---
phase: 08-v1-0-polish
verified: 2026-05-12T00:00:00Z
status: passed
score: 3/3 ROADMAP success criteria verified; 3/3 POLISH requirements satisfied
overrides_applied: 0
requirements:
  - POLISH-01
  - POLISH-02
  - POLISH-03
scores:
  truths_verified: 3
  truths_total: 3
  requirements_satisfied: 3
  requirements_total: 3
  artifacts_verified: 7
  artifacts_total: 7
  key_links_wired: 6
  key_links_total: 6
  uat_tests_passed: 4
  uat_tests_total: 4
  full_suite: 353/353 vitest cases / 44 files / 0 fail
---

# Phase 8: v1.0 Polish — Verification Report

**Phase Goal:** Markdown output reaches parity with JSON on warnings, the integration suite covers `format: "markdown"` end-to-end for ≥2 fixtures, and resolved component nodes report true declaration line numbers.

**Verified:** 2026-05-12T00:00:00Z
**Status:** passed
**Re-verification:** No — initial (retroactive) verification; UAT already passed 4/4 with cited evidence.

## Executive Summary

Phase 8 closes the three v1.0 carry-forward gaps (POLISH-01, POLISH-02, POLISH-03) without altering JSON output, envelope shape, or `schemaVersion`. Goal-backward verification confirms every success criterion is observable in the codebase:

1. `src/renderers/markdown.ts:133-143` emits one `<!-- warning: … -->` line per `envelope.warnings` entry followed by a blank line, then the tree. When `warnings.length === 0`, no leading block is added — preserving v1.0 byte-identity.
2. All four MCP tool handlers (`get-full-hierarchy`, `focus-on`, `find-by-text`, `find-by-style`) pass the live `envelope` into `renderMarkdown`, fulfilling the wiring contract.
3. `test/integration/mcp-markdown.test.ts` spawns a real MCP stdio client and exercises `format: "markdown"` against `phase-05/micro/mutation-test` and `phase-05/kitchen-sink`, asserting all three contract clauses (glyph regex, ` @ ` separator on non-comment lines, no literal backslash).
4. `src/core/parser/index.ts:183` populates `ParseResult.declLines` per-file from a single Babel pass (FunctionDeclaration, VariableDeclarator-arrow/CallExpression/TaggedTemplate, ClassDeclaration, ExportSpecifier). `src/core/Analyzer.ts:301-307` reads `result.line` from the resolved `ResolveResult.local` and writes it onto the `TreeNode`, with the D-03 fallback to `1` only when the binding is absent or the parse failed.
5. The regression fixture `test/fixtures/phase-05/micro/line-test/components/Foo.tsx` declares `Foo` on line 3; `test/core/analyzer.test.ts:614+` asserts the resolved TreeNode reports `line === 3`, not `1`.

UAT recorded 4/4 pass with concrete evidence (08-UAT.md). Full suite passes 353/353 across 44 files. The audit (`.planning/v1.1-MILESTONE-AUDIT.md`) corroborates these findings under Cross-Phase Integration.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Markdown output surfaces analyzer warnings as an `<!-- warning: … -->` block, parity with JSON (POLISH-01) | VERIFIED | `src/renderers/markdown.ts:133-143` iterates `envelope.warnings`, pushes one HTML-comment line per warning, then a blank line, then walks the tree. Empty-warnings case skips the block entirely → existing snapshots in `test/renderers/markdown.test.ts` pass without `--update`. UAT test #2 explicitly verifies both branches. |
| 2 | Integration suite covers `format: "markdown"` end-to-end for ≥2 fixtures with glyph + `@`-separator + no-backslash assertions (POLISH-02) | VERIFIED | `test/integration/mcp-markdown.test.ts:33-44` registers two fixtures (`phase-05/micro/mutation-test` route `/`, `phase-05/kitchen-sink` route `/feed`). `assertMarkdownContract` (lines 46-63) enforces `/[├└│]/`, ` @ ` on every non-comment line, and `not.toContain('\\')`. Each fixture spawns its own MCP stdio client via `spawnMcpClient`. UAT test #4 → 2/2 pass. |
| 3 | Resolved local-kind component nodes carry the true declaration line, not `line: 1` (POLISH-03) | VERIFIED | `src/core/parser/index.ts:183` builds `declLines` via `collectDeclLines`. `src/adapters/types.ts:325` extends `ParseResult.ok` with `declLines: Map<string, number>`. `src/core/resolver/index.ts:83,103` and `src/core/resolver/barrel.ts:91` look the imported name up and populate `result.line`. `src/core/Analyzer.ts:301-307` writes `result.line` onto the TreeNode. Regression: `test/fixtures/phase-05/micro/line-test/components/Foo.tsx` declares `Foo` on line 3; `test/core/analyzer.test.ts:614+` asserts `node.line === 3`. |

**Score:** 3/3 ROADMAP truths VERIFIED.

### Required Artifacts (Levels 1-3: exists, substantive, wired)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/renderers/markdown.ts` | Reads `envelope.warnings`; emits HTML-comment prefix block when non-empty | VERIFIED | Lines 133-143 implement the block; `envelope` parameter is consumed (no longer `_envelope`). Imported by all 4 tool handlers. |
| `src/mcp/tools/get-full-hierarchy.ts` | Passes envelope into `renderMarkdown` | VERIFIED | Line 45: `: renderMarkdown(tree, envelope)`. |
| `src/mcp/tools/focus-on.ts` | Passes envelope into `renderMarkdown` | VERIFIED | Line 49: same call pattern. |
| `src/mcp/tools/find-by-text.ts` | Passes envelope into `renderMarkdown` | VERIFIED | Line 44: same call pattern. |
| `src/mcp/tools/find-by-style.ts` | Passes envelope into `renderMarkdown` | VERIFIED | Line 44: same call pattern. |
| `test/integration/mcp-markdown.test.ts` | ≥2 fixtures, MCP stdio path, 3 contract clauses | VERIFIED | 109 lines; 2 fixtures × 1 test = 2 cases, each through real `StdioClientTransport`; assertions enforce glyph, ` @ `, and no-backslash. |
| `src/core/parser/index.ts` (+ `src/core/resolver/index.ts`, `src/core/resolver/barrel.ts`, `src/adapters/types.ts`, `src/core/Analyzer.ts`) | Per-file `declLines` map populated at parse time; resolver propagates line; analyzer writes onto TreeNode | VERIFIED | `collectDeclLines` covers FunctionDeclaration, VariableDeclarator (incl. `forwardRef`/`memo`/`styled` callable-like wrappers per WR-02), ClassDeclaration, ExportSpecifier, and ExportDefaultDeclaration when named. Resolver reads `parsed.declLines.get(importedName) ?? 1` (D-03 fallback). Analyzer applies the line in `resolveComponentCallsites`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Tool handlers (4×) | `renderMarkdown` | `renderMarkdown(tree, envelope)` | WIRED | All four tools (`get-full-hierarchy`, `focus-on`, `find-by-text`, `find-by-style`) call the renderer with the live envelope; no `_` prefix → param is consumed. |
| `renderMarkdown` | `envelope.warnings` | `envelope.warnings.length`, `for (const msg of envelope.warnings)` | WIRED | `src/renderers/markdown.ts:135-138`. |
| `parseFile` | `declLines` (in cached `ParseResult`) | `collectDeclLines(ast.program.body)` | WIRED | `src/core/parser/index.ts:183-185`. |
| `resolveModule` / barrel resolver | `parsed.declLines.get(importedName)` | declLine lookup with `?? 1` fallback | WIRED | `src/core/resolver/index.ts:83,103`; `src/core/resolver/barrel.ts:91`. |
| `resolveComponentCallsites` | `TreeNode.line` | `line: result.line` on `result.ok && result.kind === "local"` | WIRED | `src/core/Analyzer.ts:301-307`. |
| Integration test | Built MCP server | `spawnMcpClient` + `StdioClientTransport` | WIRED | `test/integration/mcp-markdown.test.ts:71-77`; shared helper from `_helpers.ts` (D-06). |

### Requirements Coverage

| Requirement | Source | Description | Status | Evidence |
|-------------|--------|-------------|--------|----------|
| POLISH-01 | `08-01-PLAN.md` | Markdown warning surfacing — HTML-comment prefix block when warnings present; byte-identical when empty | SATISFIED | `src/renderers/markdown.ts:133-143`; `test/renderers/markdown.test.ts` `describe("warnings prefix")`; UAT test #2. |
| POLISH-02 | `08-04-PLAN.md` | ≥2 fixtures × `format: "markdown"` end-to-end with glyph / ` @ ` / no-backslash contract | SATISFIED | `test/integration/mcp-markdown.test.ts`; 2 fixtures pass real-stdio assertions; UAT test #4. |
| POLISH-03 | `08-02-PLAN.md` + `08-03-PLAN.md` | True declaration line propagation (parser declLines → ResolveResult.local.line → TreeNode.line) | SATISFIED | `src/core/parser/index.ts:183`; `src/adapters/types.ts:325`; `src/core/resolver/index.ts:83,103`; `src/core/resolver/barrel.ts:91`; `src/core/Analyzer.ts:301-307`; regression test `test/core/analyzer.test.ts:614+` on `line-test` fixture (Foo declared on line 3). |

No orphaned requirements. REQUIREMENTS.md lists POLISH-01/02/03 for Phase 8 and all three appear in the per-plan `requirements` frontmatter of `08-01-PLAN.md`, `08-02-PLAN.md`, `08-03-PLAN.md`, `08-04-PLAN.md`.

## Goal-Backward Check

**Question:** Does the codebase deliver the Phase 8 goal as stated in ROADMAP.md?

> "Markdown output reaches parity with JSON on warnings, integration tests cover the markdown format end-to-end, and resolved component nodes report true declaration line numbers."

**Answer:** Yes.

- **Markdown ↔ JSON parity on warnings:** JSON consumers see `envelope.warnings` directly; markdown consumers now see the same content as a leading HTML-comment block. No envelope shape change, so JSON output stays byte-identical (D-08/D-09/D-10/D-11 preserved). The empty-warnings branch keeps v1.0 byte-identity, so previously authored snapshot tests survive untouched.
- **End-to-end markdown integration coverage:** `mcp-markdown.test.ts` is a sibling of `mcp-e2e.test.ts` per D-05, drives the binary through real stdio per D-06, and covers ≥2 fixtures per D-07. The Windows-critical backslash guard (`expect(out).not.toContain('\\')`) protects D-07 path-normalization on CI.
- **True declaration line:** The parser side populates `declLines` during the existing parse pass (no second pass, no re-parse — D-02 honored). The resolver reads from the cached `ParseResult`. The analyzer writes the resolved line onto the TreeNode. The fallback contract (D-03) preserves correctness for anonymous defaults, namespaced imports, and bindings missing from `declLines` — they continue to return `1`, which is the documented behavior. External / not-found / ambiguous / cycle resolver variants are untouched (D-04).

The goal is observable in the running code, not just claimed in SUMMARY.md.

## Test Coverage Summary

| Suite | Result | Notes |
|-------|--------|-------|
| `test/renderers/markdown.test.ts` | 7/7 pass | Warning-prefix positive + negative branches; 4 pre-existing snapshots unchanged (byte-identity preserved). |
| `test/core/parser/parseFile.test.ts` | 13/13 pass | `declLines` map populated for FunctionDeclaration, VariableDeclarator-arrow, ClassDeclaration, ExportSpecifier; forwardRef/memo/styled covered via WR-02. |
| `test/core/analyzer.test.ts` | all pass | POLISH-03 regression: resolved `Foo` TreeNode reports `line === 3` for `phase-05/micro/line-test` fixture; D-04 preservation for external/cycle/not-found/ambiguous. |
| `test/integration/mcp-markdown.test.ts` | 2/2 pass | `phase-05/micro/mutation-test` route `/` and `phase-05/kitchen-sink` route `/feed`; contract: glyph + ` @ ` + no backslash. |
| `test/integration/mcp-e2e.test.ts` | 20/20 pass | JSON regression — unaffected by Phase 8. |
| Full vitest suite | 353/353 pass / 44 files / 0 fail | Run during UAT (08-UAT.md "Verification Notes"). |

### Behavioral Spot-Checks

| Behavior | Source of truth | Result | Status |
|----------|-----------------|--------|--------|
| Built CLI boots and responds to MCP `listTools` | `mcp-e2e.test.ts` spawns `dist/cli.js` over stdio | server boots; 4 tools registered | PASS |
| Markdown response over real stdio contains glyphs, `@` separator, no backslash | `mcp-markdown.test.ts` 2/2 | both fixtures pass `assertMarkdownContract` | PASS |
| Build produces ESM bundle for node20 | UAT test #1 | `pnpm build` → `dist/cli.js` ~100.96 KB | PASS |

### Anti-Patterns Scan

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (none) | No `TBD` / `FIXME` / `XXX` introduced in Phase 8 source files | n/a | Clean. The only remaining `line: 1` in `Analyzer.ts` is the documented D-03 fallback for anonymous defaults / namespaced / unknown bindings — intentional, not a stub. |
| (none) | `_envelope` underscore-discard removed; `envelope` is consumed | n/a | Clean. |

### Human Verification Required

None. The phase produces deterministic, byte-level outputs (warning prefix block when non-empty, byte-identity when empty, regression on declaration line). UAT executed all four tests with cited evidence; nothing remains that human inspection could meaningfully add beyond what automated tests already enforce.

## Verdict

**status: passed.** All 3 ROADMAP success criteria are observable in the codebase and exercised by automated tests. All 3 POLISH requirements satisfied. UAT 4/4 pass. Full suite 353/353 pass. No gaps, no overrides, no deferred items.

This phase is ready for milestone close-out via `/gsd-complete-milestone v1.1`.

---

*Verified: 2026-05-12T00:00:00Z*
*Verifier: Claude (gsd-verifier, retroactive)*
