---
phase: 08-v1-0-polish
plan: 04
subsystem: test/integration
tags: [polish-02, integration, markdown, mcp-stdio]
requires:
  - 08-01-PLAN (renderMarkdown surfaces envelope.warnings as HTML comments)
  - 08-03-PLAN (resolved local-kind TreeNodes carry true declaration line)
provides:
  - End-to-end integration coverage for `format: "markdown"` over the spawned MCP binary
  - Shared spawn/lifecycle helper (test/integration/_helpers.ts) reusable by future integration files
affects:
  - test/integration/_helpers.ts (new — spawnMcpClient + assertFreshBuild + distCli/srcCli)
  - test/integration/mcp-markdown.test.ts (new — 2 markdown integration cases)
  - test/integration/mcp-e2e.test.ts (refactored to import spawnMcpClient; behavior unchanged)
tech_stack_added: []
tech_stack_patterns:
  - "Shared spawn helper in test/integration/_helpers.ts: spawnMcpClient(name) returns { client, transport, stderrChunks }; caller owns close()."
  - "Markdown contract assertions in a single helper (assertMarkdownContract) — glyph regex, per-line @-separator scan, backslash guard — applied uniformly across fixtures."
key_files_created:
  - test/integration/_helpers.ts
  - test/integration/mcp-markdown.test.ts
key_files_modified:
  - test/integration/mcp-e2e.test.ts
decisions:
  - "D-06 resolved: extract spawn lifecycle to _helpers.ts. mcp-e2e.test.ts had ~30 lines of inline spawn/path/freshness setup (above the ~10-line threshold). Helper exports assertFreshBuild, distCli, srcCli, spawnMcpClient; envelope handling stays in the suite files per plan task-1 acceptance criterion."
  - "Kitchen-sink route fallback: plan task-2 specified route:'/' for both fixtures, but test/fixtures/phase-05/kitchen-sink has no app/page.tsx at root (only sub-routes under app/feed, /login, /profile, etc.). Per plan's documented fallback (\"fall back to the first … directory whose app/page.tsx exists; document the chosen path in the SUMMARY\"), used route:'/feed' for kitchen-sink — the minimal sub-route exercising renderMarkdown end-to-end. Micro/mutation-test uses route:'/' as specified."
  - "Tool choice: get_full_hierarchy only (single tool per fixture). Plan explicitly approves this as 'the simplest tool that exercises renderMarkdown end-to-end'; matches POLISH-02 minimum coverage (≥2 cases asserting the markdown contract)."
duration_seconds: 156
completed_at: 2026-05-12T02:49:22Z
---

# Phase 08 Plan 04: POLISH-02 — markdown-format integration suite Summary

POLISH-02 closes the markdown integration-coverage gap: a new sibling test file `test/integration/mcp-markdown.test.ts` spawns the MCP binary against the two locked phase-05 fixtures (`micro/mutation-test` + `kitchen-sink`) and asserts the three locked markdown contract guards — tree glyph present, ` @ ` separator on every non-comment line, no literal backslash — through the real stdio transport. Spawn lifecycle was extracted to `test/integration/_helpers.ts` (D-06) and re-used by both `mcp-e2e.test.ts` and the new file.

## What changed

1. **`test/integration/_helpers.ts`** (new, 53 lines) — exports `assertFreshBuild()`, `distCli`, `srcCli`, and `spawnMcpClient(name, version?) : Promise<{ client, transport, stderrChunks }>`. The helper runs `assertFreshBuild()` inside `spawnMcpClient` so callers cannot forget the staleness guard. Envelope parsing, fixture-specific invariants, and tree walking deliberately stay out — per plan task-1 acceptance criterion ("No envelope-handling logic was moved into the helper").

2. **`test/integration/mcp-e2e.test.ts`** (refactored, -10 lines net) — removed inline `__dirname`/`distCli`/`srcCli`/`assertFreshBuild` and the inline `beforeAll` spawn block; imports `spawnMcpClient` and stores the returned `{ client, transport, stderrChunks }` on suite-local variables. All 20 existing tests still pass byte-for-byte (no behavior change).

3. **`test/integration/mcp-markdown.test.ts`** (new, 109 lines) — two `describe` blocks driven from a fixtures array:
   - `phase-05/micro/mutation-test` at route `/`
   - `phase-05/kitchen-sink` at route `/feed` (see decisions: no root page in kitchen-sink)

   Each describe spawns its own MCP client via `spawnMcpClient`, calls `get_full_hierarchy` with `format: "markdown"`, then runs `assertMarkdownContract(out, label)` which enforces:
   - (a) `expect(out).toMatch(/[├└│]/)` — at least one tree glyph
   - (b) every non-empty, non-`<!--`-prefixed line contains ` @ `
   - (c) `expect(out).not.toContain("\\")` — D-07 backslash guard

   The result text is treated as a raw markdown string (no `JSON.parse`). Warnings prefix (POLISH-01) is intentionally not asserted here — that contract lives in plan 08-01's unit tests.

## Verification

- `pnpm build` → success (dist/cli.js 100.96 KB, esm, node20 target)
- `pnpm vitest run test/integration/mcp-e2e.test.ts` → 20/20 pass (baseline, post-refactor)
- `pnpm vitest run test/integration/mcp-markdown.test.ts` → 2/2 pass
- `pnpm vitest run test/integration` → 22/22 pass (20 e2e + 2 markdown)
- `pnpm vitest run` (full suite) → 44 files, 353 tests pass (was 351 before this plan; +2 markdown cases)

Grep gates from plan task-2 acceptance:
- `grep -c 'format: "markdown"' test/integration/mcp-markdown.test.ts` → 2 ✓ (≥2)
- `grep -c 'phase-05/micro' test/integration/mcp-markdown.test.ts` → 3 ✓ (≥1)
- `grep -c 'phase-05/kitchen-sink' test/integration/mcp-markdown.test.ts` → 3 ✓ (≥1)
- `grep -c 'format: "markdown"' test/integration/mcp-e2e.test.ts` → 0 ✓ (D-05: mcp-e2e stays JSON-only)
- Backslash guard regex present in mcp-markdown.test.ts → ✓ (`expect(out, …).not.toContain("\\")`)
- Glyph regex present in mcp-markdown.test.ts → ✓ (`expect(out, …).toMatch(/[├└│]/)`)

## Deviations from Plan

**1. [Rule 3 — Blocking issue] Kitchen-sink route fallback**
- **Found during:** Task 2 (fixture inspection)
- **Issue:** Plan task-2 prescribes `route: "/"` for both fixtures, but `test/fixtures/phase-05/kitchen-sink` has no `app/page.tsx` at the root. Only sub-routes (`/feed`, `/login`, `/profile`, …) have pages.
- **Fix:** Used `route: "/feed"` for the kitchen-sink case — the minimal sub-route that exercises `renderMarkdown` end-to-end. Plan task-2 explicitly authorized this exact fallback: "If micro/mutation-test does not contain a runnable app/ structure for `route: '/'`, fall back to the first `phase-05/micro/*` directory whose `app/page.tsx` exists; document the chosen path in the SUMMARY." Same principle applied to kitchen-sink (micro/mutation-test itself was fine with route:'/').
- **Files modified:** `test/integration/mcp-markdown.test.ts`
- **Commit:** b2939ff

No other deviations. No auto-fixes required. No auth gates. No architectural decisions surfaced.

## Out-of-scope items noted

None. The plan's `files_modified` envelope (`test/integration/mcp-markdown.test.ts`, `test/integration/_helpers.ts`) was honored exactly; mcp-e2e.test.ts was modified only to consume the extracted helper, which is the documented effect of the D-06 extraction path.

## Commits

| Task | Commit  | Description                                                |
| ---- | ------- | ---------------------------------------------------------- |
| 1    | bd13d64 | refactor(08-04): extract MCP spawn lifecycle to _helpers.ts |
| 2    | b2939ff | test(08-04): add markdown-format integration suite (POLISH-02) |

## Self-Check: PASSED

- `test/integration/_helpers.ts` → FOUND
- `test/integration/mcp-markdown.test.ts` → FOUND
- `test/integration/mcp-e2e.test.ts` (modified) → FOUND
- Commit `bd13d64` → FOUND in git log
- Commit `b2939ff` → FOUND in git log
- 2 markdown integration cases pass (`pnpm vitest run test/integration/mcp-markdown.test.ts` → 2/2)
- Full integration suite green (22/22)
- Full project test suite green (353/353)
