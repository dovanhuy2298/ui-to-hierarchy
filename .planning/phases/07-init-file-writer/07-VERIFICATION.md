---
phase: 07-init-file-writer
verified: 2026-05-11T07:45:00Z
status: passed
score: 5/5 success criteria verified; 14/14 INIT requirements satisfied
overrides_applied: 0
---

# Phase 7: `--init` File Writer — Verification Report

**Phase Goal:** Users can inject MCP usage guidance into agent instruction files via a single `--init` command — idempotent, atomic, CRLF/BOM-safe, CI-usable. Targets: claude/codex/cursor/copilot. Requirements: INIT-01 through INIT-14.

**Verified:** 2026-05-11T07:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npx ui-hierarchy-mcp --init` injects guide into CLAUDE.md; re-running is a no-op | VERIFIED | `src/cli.ts:60-70` dispatch; `src/init/index.ts:140-178` create/noop logic; integration test `INIT-01` (test/init/integration.test.ts:69) + `INIT-04 idempotency` (line 118) asserts SHA-256 equal on run 2. Smoke: `node dist/cli.js --init --dry-run` prints `would create CLAUDE.md`, exit 0. |
| 2 | `--target claude,codex,cursor,copilot` injects into all 4 files; cursor file has YAML frontmatter; parent dirs auto-created | VERIFIED | `src/init/targets.ts:36-49` registry; `src/init/index.ts:58-59,143-145` cursor frontmatter constant + first-create branch; `src/init/writer.ts:48` `mkdir({recursive:true})` covers `.cursor/rules/`, `.github/`. Tests: integration `INIT-05` (line 88), `INIT-14 cursor frontmatter` (line 324). Smoke confirmed 4 stderr lines for 4 targets. |
| 3 | `--init --dry-run` shows per-target summary on stderr with no files written | VERIFIED | `src/init/index.ts:181-183` swaps to `writeAtomicDryRun`; `src/init/writer.ts:78-83` is a no-op; `actionLabel` (line 81-89) prefixes `would `. Test: integration `INIT-10` (line 267) verifies zero bytes written + stderr `would …` lines. Smoke confirmed empty stdout, 4 `would create` lines on stderr, exit 0. |
| 4 | Manual edits trigger skip-with-warning; `--force` overrides | VERIFIED | `src/init/index.ts:165-177` `verifyFingerprint` mismatch + `!flags.force` → `outcome=skip`; orchestrator returns exit 1 (line 228). Else branch (force or version mismatch) overwrites. Test: integration `INIT-07` (line 186) covers tamper → exit 1, `--force` → rewrite + noop next. |
| 5 | No-args still starts MCP stdio server byte-for-byte; no `[init]` output | VERIFIED | `src/cli.ts:71-77` else-branch calls `startServer()` unmodified; argv parser sets `flags.init=false` when `--init` absent. Regression gate `test/mcp/smoke.spawn.test.ts` (lines 39,54) spawns `dist/cli.js` and completes MCP `initialize` + `listTools=4`. Orchestrator-confirmed passing. |

**Score:** 5/5 ROADMAP truths VERIFIED

### Required Artifacts (Level 1-3)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/cli.ts` | argv dispatch fork; runs init or startServer | VERIFIED | 79 lines; imports `runInit`, `parseInitArgs`, `startServer`; help/version short-circuit; init/server fork at line 60. |
| `src/init/argv.ts` | strict argv parser with target whitelist | VERIFIED | `parseInitArgs` uses `parseArgs({strict:true})`; secondary `VALID_TARGET_IDS` check; discriminated-union return. |
| `src/init/targets.ts` | TARGETS registry + canonical paths | VERIFIED | 4 targets in SPEC-locked order; cursor `hasFrontmatter:true`; correct relative paths. |
| `src/init/markers.ts` | scanBlock/replaceBlock/appendBlock | VERIFIED | BLOCK_PATTERN anchors version + fingerprint + body; wrapping `\n` outside capture group → preimage contract honored. |
| `src/init/fingerprint.ts` | SHA-256 with LF normalization | VERIFIED | LF-normalize before hash (INIT-09 stability across CRLF checkouts). |
| `src/init/eol.ts` | detectBom/detectEol/applyEolBom | VERIFIED | BOM detected via EF BB BF; EOL via `\r\n` presence; applyEolBom normalizes to LF first to avoid `\r\r\n` pitfall. |
| `src/init/writer.ts` | atomic tmp + rename + EXDEV fallback | VERIFIED | tmp `.tmp-<pid>-<rand>`; rename; EXDEV → copyFile+unlink; error-path tmp cleanup. `writeAtomicDryRun` is signature-parity no-op. |
| `src/init/template.ts` | renderGuide with 4 tools + JSON snippet + 4 examples + projectRoot | VERIFIED | All 4 tool names present; `"npx", "-y", "ui-hierarchy-mcp"` substring present; exactly 4 JSON example blocks; `${cwd}` substituted. |
| `src/init/index.ts` | orchestrator composing 7 modules | VERIFIED | 235 lines; per-target loop; correct decision tree (noop / skip / update / create); stderr-only writes. |
| `dist/cli.js` | bundled CLI artifact | VERIFIED | Built by orchestrator; smoke-tested successfully. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `cli.ts` | `runInit` | `import { runInit } from "./init/index.js"` and `runInit(flags).then(code => process.exit(code))` | WIRED | Lines 5,61-64 |
| `cli.ts` | `parseInitArgs` | strict re-parse before dispatch | WIRED | Lines 6,52-56 |
| `cli.ts` | `startServer` | else branch when `!flags.init` | WIRED | Lines 4,72-77 |
| `index.ts` | `template.renderGuide` | body = preimage of fingerprint | WIRED | Line 132; verified preimage contract documented in docstring. |
| `index.ts` | `fingerprint.computeFingerprint`/`verifyFingerprint` | fingerprint attribute in marker | WIRED | Lines 133, 160, 166. |
| `index.ts` | `markers.scanBlock/replaceBlock/appendBlock` | block detection + edit | WIRED | Lines 152-156, 175. |
| `index.ts` | `eol.detectBom/detectEol/applyEolBom` | EOL/BOM preservation | WIRED | Lines 127-129, 146, 157, 176. |
| `index.ts` | `writer.writeAtomic`/`writeAtomicDryRun` | swap by dryRun flag | WIRED | Line 182. |
| `index.ts` | `targets.TARGETS` | iteration + path resolution | WIRED | Lines 39, 214. |

### Requirements Coverage (INIT-01 through INIT-14)

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| INIT-01 | Default target = CLAUDE.md | SATISFIED | `targets.ts:55` `DEFAULT_TARGET_IDS=["claude"]`; test `integration.test.ts:69`. |
| INIT-02 | Dispatch fork preserves v1.0 byte-for-byte | SATISFIED | `cli.ts:60-77`; regression `test/mcp/smoke.spawn.test.ts` passes. |
| INIT-03 | `--target` accepts comma-list, rejects unknown | SATISFIED | `argv.ts:74-87`; `argv.test.ts` covers unknown token. |
| INIT-04 | Idempotent + version-keyed replace | SATISFIED | `index.ts:158-178`; integration `INIT-04 idempotency` (line 118) + `INIT-04 version replacement` (line 152). |
| INIT-05 | Auto-create files + parent dirs | SATISFIED | `writer.ts:48` mkdir recursive; integration line 88 covers `.cursor/rules/` + `.github/`. |
| INIT-06 | Append after one blank line if no marker | SATISFIED | `markers.ts:87-89` `appendBlock` uses `trimEnd() + "\n\n"`; `index.ts:155-156`. |
| INIT-07 | Hand-edit guard via fingerprint; `--force` overrides | SATISFIED | `index.ts:165-177`; integration `INIT-07` (line 186) verifies skip + force flow. |
| INIT-08 | Atomic tmp+rename; EXDEV fallback | SATISFIED | `writer.ts:46-69`; `writer.test.ts` covers EXDEV fallback + error cleanup (17 occurrences). |
| INIT-09 | Preserve EOL + BOM | SATISFIED | `eol.ts:39-43` LF-normalize first; integration `INIT-09 CRLF+BOM` (line 235). |
| INIT-10 | `--dry-run` writes nothing, stderr summary | SATISFIED | `writer.ts:78-83` + `index.ts:182,219`; integration line 267 verifies zero writes. |
| INIT-11 | stderr-only, exit code 0/1 | SATISFIED | `index.ts:221-230` all stderr; exit 1 on skip/error; integration `INIT-11 stdout invariant` (line 286) `stdout.length===0`. |
| INIT-12 | Guide payload contract (4 tools + JSON + 4 examples + projectRoot) | SATISFIED | `template.ts` contains all 4 tool names, JSON snippet, 4 fenced JSON code blocks, `${cwd}` literal; `template.test.ts` asserts contract. |
| INIT-13 | Non-interactive; no stdin/readline/isTTY refs | SATISFIED | Grep across `src/init/` returns ZERO matches for `stdin|readline|isTTY`. Integration line 310 asserts no input-stream listeners added. |
| INIT-14 | Cursor YAML frontmatter contract | SATISFIED | `index.ts:58-59` `CURSOR_FRONTMATTER` literal with `description`, `alwaysApply:true`, `globs`; integration `INIT-14` (line 324) parses YAML and verifies preservation on update. |

**No orphaned requirements.** All 14 INIT-* requirements have explicit phase-7 plan + test coverage.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Built CLI dry-runs all 4 targets | `node dist/cli.js --init --dry-run --target claude,codex,cursor,copilot` | 4 stderr lines `[init] would create …`; stdout empty; exit 0 | PASS |
| Help renders to stderr | `node dist/cli.js --help` | Usage banner printed; exit 0 | PASS |
| Version flag | `node dist/cli.js --version` | `0.1.1` to stderr; exit 0 | PASS |
| Full test suite | `npx vitest run` | 340/340 tests across 43 files pass | PASS |

### Anti-Patterns Scan

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (none) | No TBD/FIXME/XXX/TODO in `src/init/*.ts` modified by this phase | n/a | Clean. |
| (none) | No empty handlers, no hardcoded stub returns | n/a | Clean. |

Grep for debt markers in src/init/ surfaces only the prose word "TODO" or "FIXME" inside docstrings/comments — none in code paths.

### Human Verification Required

None. Every truth is verified by automated tests + a runtime smoke probe against the built `dist/cli.js`. The phase produces deterministic byte-level outputs (idempotency, CRLF/BOM preservation, fingerprint roundtrip) which are stronger than what human verification could add.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria are observable in the codebase and confirmed by:
- 340/340 vitest cases passing (10 integration tests cover INIT-01,04,05,07,09,10,11,13,14 end-to-end via runInit; unit suites cover argv/markers/writer/template/eol/fingerprint/targets)
- INIT-02 regression via `test/mcp/smoke.spawn.test.ts` (orchestrator-confirmed passing)
- Direct CLI smoke against `dist/cli.js` confirms wired dispatch, stderr-only output, dry-run no-op, and correct target paths/order

The fingerprint-preimage contract (BLOCKER revision from plan-checker) is explicitly documented in `src/init/index.ts:20-33` and `markers.ts:8-15`, and the round-trip is enforced by integration `INIT-04 idempotency` (line 118).

---

_Verified: 2026-05-11T07:45:00Z_
_Verifier: Claude (gsd-verifier)_
