---
phase: 02-mcp-transport-shell
fixed_at: 2026-04-29T02:39:00Z
review_path: .planning/phases/02-mcp-transport-shell/02-REVIEW.md
iteration: 2
findings_in_scope: 11
fixed: 10
skipped: 1
status: all_fixed
---

# Phase 02: Code Review Fix Report (iteration 2)

**Fixed at:** 2026-04-29T02:39:00Z
**Source review:** `.planning/phases/02-mcp-transport-shell/02-REVIEW.md` (re-review of 2026-04-29)
**Iteration:** 2

This iteration addresses the 11 Info-severity findings from the 2026-04-29 maintainability re-review. The earlier 2026-04-21 fix iteration (WR-01/02/03, IN-01/04 of that pass) is preserved in the git log (commits `1ace2b8`, `1c9a37e`, `26b7f70`, `beaa592`) and is not re-applied here.

**Summary:**
- Findings in scope: 11 (all Info severity, fix_scope=all)
- Fixed: 10
- Skipped: 1 (IN-10, explicitly deferred by reviewer to Phase 5)
- Verification per fix: `pnpm typecheck` + `pnpm test` (78 tests). Final pass also ran `pnpm build` + `pnpm run test:smoke` + `pnpm lint` — all green.

## Fixed Issues

### IN-08: log meta key collision

**Files modified:** `src/mcp/log.ts`
**Commit:** `e1f9511`
**Applied fix:** Spread `meta` before canonical `level`/`msg`/`ts` fields so a buggy caller passing `{ level: "error" }` cannot silently override the canonical level. Added an inline comment explaining the ordering invariant.

### IN-06: stale planning-doc reference in comment

**Files modified:** `src/mcp/server.ts`
**Commit:** `2ed94df`
**Applied fix:** Replaced the `// CRITICAL: ... see RESEARCH.md Pitfall 1` comment with a self-contained explanation of why `createServer` and `startServer` are split (test injection of `InMemoryTransport`). Comment now survives `.planning/` rotation.

### IN-07 + IN-09: smoke test phrasing and stricter stderr assertion

**Files modified:** `test/mcp/smoke.spawn.test.ts`
**Commit:** `ff9e98e`
**Applied fix:**
- IN-07: Replaced `pnpm build` / `pnpm run test:smoke` references with `npm run build (or your package manager's equivalent)` in both the file-level comment and the `existsSync` error message.
- IN-09: Strengthened the stderr-is-JSON contract — the test now asserts every non-empty stderr line parses as structured JSON with a non-empty `level` field, not merely "at least one such line exists". This catches regressions where `console.log` would leak into stderr alongside structured logs.

### IN-04: hardcoded "Phase 5" reference in tool descriptions

**Files modified:** `src/mcp/tools/find-by-style.ts`, `src/mcp/tools/find-by-text.ts`, `src/mcp/tools/focus-on.ts`, `src/mcp/tools/get-full-hierarchy.ts`
**Commit:** `9daa7af`
**Applied fix:** Took option (a) — dropped the trailing `Phase 2 stub — ... Phase 5` sentence from every tool description. The centralized `notImplemented()` helper still surfaces the Phase 5 reference at runtime, so users see the message exactly once and a roadmap rename is a one-line edit. Tool descriptions are wire-protocol surface seen by LLM clients and shouldn't carry developer-roadmap noise.

### IN-03: duplicated `projectRoot` schema fragment

**Files modified:** `src/mcp/tools/common.ts` (new), `src/mcp/tools/find-by-style.ts`, `src/mcp/tools/find-by-text.ts`, `src/mcp/tools/focus-on.ts`, `src/mcp/tools/get-full-hierarchy.ts`
**Commit:** `51f1d4f`
**Applied fix:** Extracted the 6-line `projectRoot` zod fragment to `src/mcp/tools/common.ts` as `projectRootSchema` and reused across all four tool input schemas. Description text is now defined exactly once.

### IN-02: duplicated try/catch + `_root` boilerplate

**Files modified:** `src/mcp/errors.ts`, `src/mcp/tools/find-by-style.ts`, `src/mcp/tools/find-by-text.ts`, `src/mcp/tools/focus-on.ts`, `src/mcp/tools/get-full-hierarchy.ts`
**Commit:** `c7255c7`
**Applied fix:** Took option (b) — added `withErrorBoundary(toolName, fn)` helper to `errors.ts` and refactored each handler to call it. Each handler is now a single-statement body wrapping the eventual real logic; Phase 5 wire-up edits one body per tool instead of preserving boilerplate alongside new logic. The `_root` validation call is preserved (remains intentional eager validation for stub-time correctness).

### IN-01 + IN-11: tool registration boilerplate / 4-file change to add a tool

**Files modified:** `src/mcp/tools/index.ts` (new), `src/mcp/server.ts`, `test/mcp/server.test.ts`
**Commit:** `c921d36`
**Applied fix:** Created `src/mcp/tools/index.ts` exporting a typed `tools[]` registry as the single source of truth for the registered tool surface. `server.ts` now iterates this list (one `for` loop replaces four near-identical `registerTool` blocks). The barrel uses `tool.inputSchema.shape` to feed the SDK's `ZodRawShapeCompat` parameter directly.

`test/mcp/server.test.ts` derives expected count from `registeredTools.length` and expected names from `registeredTools.map(t => t.name)`, making the test auto-track registry additions. Adding a new tool is now a 2-file change (create file, append to barrel) instead of 4-file.

### IN-05: cast ceremony in tests

**Files modified:** `test/helpers.ts` (new), `test/mcp/server.test.ts`, `test/mcp/errors.test.ts`
**Commit:** `2739b80`
**Applied fix:** Created `test/helpers.ts` exporting `asToolResponse(unknown): ToolResponse` and `firstText(r): string`. Replaced ~6 inline `(r.content[0] as { type: string; text: string }).text` casts in `server.test.ts` with `firstText(r)`. Removed the duplicate local `firstText` definition in `errors.test.ts` and imported the shared one. Both test files now share one definition.

### Format pass over `src/mcp` (collateral)

**Files modified:** `src/mcp/tools/index.ts`, `src/mcp/log.ts` (effective changes after autocrlf normalization)
**Commit:** `a8dbb87`
**Applied fix:** Ran `biome check --write .` to clear pre-existing formatter violations in files touched by this fix iteration. Also replaced two ineffective `biome-ignore` suppression comments in `tools/index.ts` (biome wasn't actually flagging the `any`) with descriptive inline comments. After this pass `pnpm lint` reports zero errors.

## Skipped Issues

### IN-10: `ToolResponse = CallToolResult` paper-thin alias

**File:** `src/mcp/errors.ts:1-3`
**Reason:** Reviewer explicitly wrote "Defer until Phase 5. No action needed in this phase." — finding is informational and intentionally tracked, not actionable in Phase 02.
**Original issue:** `ToolResponse` is a one-line alias for `CallToolResult`. Phase 5 will likely want explicit error vs success variants. Flagged so the team treats this as known-thin rather than a real domain type.

---

_Fixed: 2026-04-29_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
