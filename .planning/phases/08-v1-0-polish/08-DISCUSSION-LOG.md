# Phase 8: v1-0-polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 08-v1-0-polish
**Areas discussed:** Line map storage shape, Resolve flow (ResolveResult vs adapter lookup), Integration test placement

---

## Line Map Storage Shape

| Option | Description | Selected |
|--------|-------------|----------|
| A. Extend `ParseResult.ok` | Add `declLines: Map<string, number>` to the `'ok'` variant. Computed once in `parseFile` after parse. AST + lookup co-located. | ✓ |
| B. Separate field on `ParseContext` | Add `componentLines: Map<absPath, Map<name, line>>`. Keeps `ParseResult` shape unchanged. Two parallel caches. | |
| C. Lazy traverse from AST cache | No map. When line is needed, traverse `astCache.get(file)` to find declaration. Avoids shape change but re-traverses per resolve. | |

**User's choice:** A — extend `ParseResult.ok`.
**Notes:** Co-locating the declaration-line lookup with the AST removes the sync risk between two caches. Computation happens once during the existing parse pass (SPEC constraint).

---

## Resolve Flow — ResolveResult vs Adapter Lookup

| Option | Description | Selected |
|--------|-------------|----------|
| A. Add `line` to `ResolveResult.local` | `{ ok: true; kind: 'local'; absolutePath; line }`. Adapter `resolveModule` calls `parseFile` on target and sets `line`. Analyzer just reads `result.line`. Changes D-12 contract shape. | ✓ |
| B. Analyzer-side lookup post-resolve | `ResolveResult` unchanged. After local-ok, Analyzer calls `parseFile(ctx, result.absolutePath)` then reads `declLines.get(importedName)`. Cache-friendly, no contract shape change. | |

**User's choice:** A — extend `ResolveResult.local`.
**Notes:** Single source of truth for the resolved-component identity (path + line) lives in the adapter. Fallback rule (D-03 in CONTEXT.md): if `declLines` doesn't have the name (default export, re-export indirection, parse error), the adapter returns `line: 1` — preserves existing v1.0 behavior on cases we can't detect.

---

## Integration Test Placement

| Option | Description | Selected |
|--------|-------------|----------|
| A. Append to `mcp-e2e.test.ts` | Add `describe('format: markdown', ...)` in the existing file. Reuse setup. Minimal diff. | |
| B. New `mcp-markdown.test.ts` | Sibling file in `test/integration/`. Extract helper to `_helpers.ts` if needed. Format-specific concern isolated. | ✓ |
| C. Parametrize via `describe.each` | Refactor existing cases as table-driven `[json, markdown]`. Parity enforced automatically. Refactor scope wider than SPEC. | |

**User's choice:** B — separate `mcp-markdown.test.ts` file.
**Notes:** Keeps existing JSON e2e file untouched. Helper extraction is at planner's discretion based on what's currently inline in `mcp-e2e.test.ts` (D-06).

---

## Claude's Discretion

- Naming of the new `declLines` field (working name only).
- Inline vs helper (`collectDeclLines(ast)`) for the per-file map computation.
- Exact set of Babel node kinds recorded (min: `FunctionDeclaration`, `VariableDeclarator`, `ClassDeclaration`, named `ExportSpecifier`).
- Whether to extract a shared `test/integration/_helpers.ts` (D-06) — planner decides after reading current `mcp-e2e.test.ts`.

## Deferred Ideas

- `describe.each` parametrization across JSON + markdown for full parity coverage — future, not v1.0 polish.
- Column numbers on resolved nodes — SPEC out-of-scope.
- True line for external-kind components — D-12/D-13 contract preserves call-site line.
- Orphan exports in `src/mcp/errors.ts` — deferred to v1.2 per STATE.md.
- F-01 Claude Code transcript export — separate carry-forward.
- Cross-call AST cache / watch mode — PROJECT.md constraint.
