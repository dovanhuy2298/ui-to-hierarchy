---
status: complete
phase: 08-v1-0-polish
source:
  - 08-01-SUMMARY.md
  - 08-02-SUMMARY.md
  - 08-03-SUMMARY.md
  - 08-04-SUMMARY.md
started: 2026-05-12T02:57:29Z
updated: 2026-05-12T02:59:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Run `pnpm build` from a clean state, then spawn the MCP binary (`node dist/cli.js`) via the MCP Inspector or any stdio client. Server boots without errors on stderr, registers its tools, and a basic `get_full_hierarchy` call against a phase-05 fixture returns a valid envelope with no crash.
result: pass
evidence: |
  `pnpm build` → success, dist/cli.js 100.96 KB (esm, node20).
  `pnpm vitest run test/integration/mcp-e2e.test.ts` → 20/20 — spawns
  the built binary via stdio transport, calls `get_full_hierarchy`
  against phase-05 fixtures, asserts envelope shape and no crashes.

### 2. POLISH-01 — Markdown warnings prefix
expected: Call `get_full_hierarchy` with `format: "markdown"` on a project that produces envelope warnings. Output begins with one `<!-- warning: {msg} -->` line per warning (in array order), then exactly one blank line, then the tree. Calling on a project with zero warnings produces output byte-identical to v1.0 (no leading comment block).
result: pass
evidence: |
  `pnpm vitest run test/renderers/markdown.test.ts` → 7/7. The
  `describe("warnings prefix")` block asserts both the positive case
  (two warnings emit `<!-- warning: a -->` / `<!-- warning: b -->`
  followed by blank line then tree) and the negative case (empty
  warnings → no leading comment block). All four pre-existing snapshots
  (kitchen-sink / empty / single-leaf / deep-branch) pass without
  `--update`, confirming byte-identity.

### 3. POLISH-03 — True component declaration line
expected: Call `get_full_hierarchy` on a fixture where a local component is declared on line ≥2 (e.g. `test/fixtures/phase-05/micro/line-test/components/Foo.tsx` — `Foo` on line 3). The resolved TreeNode for that component reports `line: 3`, NOT the legacy placeholder `line: 1`. External / unresolved / cycle / not-found / ambiguous variants still behave as before.
result: pass
evidence: |
  `pnpm vitest run test/core/parser/parseFile.test.ts` →
  13/13 (declLines map populated for FunctionDeclaration,
  VariableDeclarator-arrow, ClassDeclaration, ExportSpecifier).
  `pnpm vitest run test/core/analyzer.test.ts` → all pass; the
  POLISH-03 case asserts the resolved `Foo` TreeNode for
  `phase-05/micro/line-test` carries `line === 3` (not 1), with file
  ending in `components/Foo.tsx`.
  D-04 preservation verified: external/cycle/not-found/ambiguous
  variants of `ResolveResult` untouched.

### 4. POLISH-02 — Markdown format end-to-end via stdio
expected: Spawn the built MCP binary and call `get_full_hierarchy` with `format: "markdown"` over real stdio against both `phase-05/micro/mutation-test` (route `/`) and `phase-05/kitchen-sink` (route `/feed`). Each response contains at least one tree glyph (`├`, `└`, or `│`), every non-empty / non-comment line contains ` @ `, and the output contains no literal backslash characters.
result: pass
evidence: |
  `pnpm vitest run test/integration/mcp-markdown.test.ts` → 2/2.
  Each describe spawns its own MCP client via `spawnMcpClient` from
  `test/integration/_helpers.ts`, calls `get_full_hierarchy` with
  `format: "markdown"` over real stdio, and runs
  `assertMarkdownContract` (glyph regex `/[├└│]/`, ` @ ` separator on
  every non-comment line, no literal backslash). Both
  `micro/mutation-test` at route `/` and `kitchen-sink` at route
  `/feed` pass the contract.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0

## Gaps

[none]

## Verification Notes

- Full suite: `pnpm vitest run` → 44 files / 353 tests pass / 0 fail.
- Build: `pnpm build` → clean ESM build, node20 target.
- All four POLISH requirements (POLISH-01, POLISH-02, POLISH-03 parts A+B)
  validated via the test suites their respective plans installed.
- No deviations between SUMMARY claims and observed test behavior.
