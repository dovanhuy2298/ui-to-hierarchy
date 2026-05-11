---
phase: 07-init-file-writer
plan: 02
subsystem: init
tags: [markers, fingerprint, eol, sha256, pure-functions]
requires: []
provides:
  - markers.scanBlock
  - markers.replaceBlock
  - markers.appendBlock
  - fingerprint.computeFingerprint
  - fingerprint.verifyFingerprint
  - eol.detectEol
  - eol.detectBom
  - eol.applyEolBom
affects:
  - Plan 04 (init orchestrator composes these primitives)
tech-stack:
  added: []
  patterns:
    - "Pure-function utility modules (no I/O, no global state)"
    - "TDD with RED → GREEN per task (test commit, then implementation commit)"
    - "node:crypto.createHash('sha256') for content integrity (not security)"
    - "LF-normalize-then-hash for cross-platform fingerprint stability"
    - "Normalize-then-convert for EOL re-encoding (avoids \\r\\r\\n)"
key-files:
  created:
    - src/init/markers.ts
    - src/init/fingerprint.ts
    - src/init/eol.ts
    - test/init/markers.test.ts
    - test/init/fingerprint.test.ts
    - test/init/eol.test.ts
  modified: []
decisions:
  - "BLOCK_PATTERN consumes wrapping newlines outside the body capture group so scan.body is byte-identical to the renderGuide preimage (INIT-04 idempotency contract)"
  - "applyEolBom always normalizes content to LF first then converts to target EOL, eliminating the \\r\\r\\n class of bugs at the source"
  - "scanBlock builds a fresh RegExp from BLOCK_PATTERN.source per call so callers cannot share regex lastIndex state through the exported constant"
metrics:
  tasks-completed: 2
  tests-added: 41
  files-created: 6
  duration-minutes: ~3
  completed-date: 2026-05-11
---

# Phase 7 Plan 02: Markers, Fingerprint, EOL Utilities Summary

Pure-function utility modules for marker block scanning/replacement, SHA-256 fingerprinting with LF normalization, and EOL/BOM detection — the trickiest correctness primitives of Phase 7, isolated and unit-tested before the orchestrator composes them in Plan 04.

## What Was Built

**Task 1 — `src/init/markers.ts`** (commits `d19611f` test, `6ccba4c` feat)
- `MARKER_START_PREFIX`, `MARKER_END` constants matching the wire format
- `BLOCK_PATTERN` regex with two load-bearing literal `\n` outside the body capture group
- `scanBlock(content)` returning a discriminated `BlockScanResult` union
- `replaceBlock(content, newBlock, scan)` using slice arithmetic for byte-exact preservation
- `appendBlock(existing, newBlock)` collapsing trailing newlines to a single `\n\n` separator

**Task 2 — `src/init/fingerprint.ts` and `src/init/eol.ts`** (commits `f74239c` test, `808e2fe` feat)
- `computeFingerprint(body)`: LF-normalize → SHA-256 → 64-char lowercase hex
- `verifyFingerprint(body, expected)`: thin equality wrapper
- `detectBom(buf)`: first 3 bytes EF BB BF
- `detectEol(content)`: CRLF iff `\r\n` substring found, else LF
- `applyEolBom(content, eol, hasBom)`: normalize → convert → optional U+FEFF prefix

## Contracts Locked In

| Truth | Verified by |
| --- | --- |
| `scanBlock` returns full result for well-formed blocks, `{found:false}` otherwise | `markers.test.ts` scanBlock suite |
| `scanBlock.body` excludes wrapping newlines (fingerprint preimage contract) | `markers.test.ts` "fingerprint preimage equivalence (regex contract)" × 3 body shapes |
| `replaceBlock` preserves bytes outside `[startIndex, endIndex)` byte-for-byte | `markers.test.ts` SHA-256 prefix/suffix equality assertion |
| `appendBlock` collapses any number of trailing newlines to exactly one blank line | `markers.test.ts` 4 trailing-newline cases |
| `computeFingerprint('a\nb') === computeFingerprint('a\r\nb')` (INIT-09) | `fingerprint.test.ts` × 2 cases |
| `applyEolBom` never produces `\r\r\n` | `eol.test.ts` "normalizes mixed/CRLF input to CRLF cleanly" |
| `detectBom` true iff first 3 bytes are EF BB BF | `eol.test.ts` 4 cases including short-buffer + partial-match |

## Verification

```
npx vitest run test/init/markers.test.ts test/init/fingerprint.test.ts test/init/eol.test.ts --reporter=dot
Test Files  3 passed (3)
     Tests  41 passed (41)
```

Acceptance grep checks all pass:
- `src/init/markers.ts`: marker constants present, regex consumes wrapping newlines outside body capture, `trimEnd()` in appendBlock, no `fs`/`readFile`/`writeFile`/`process` references, preimage test cases present.
- `src/init/fingerprint.ts`: `createHash('sha256')` present, `replace(/\r\n/g, ...)` present, no I/O references.
- `src/init/eol.ts`: `replace(/\r\n/g, ...)` present (normalize-then-convert), no I/O references.
- All three: no `stdin`/`readline`/`isTTY` references (INIT-13 partial assertion).

Note: `npx tsc --noEmit` surfaces one pre-existing error in `test/fixtures/phase-05/micro/parse-error/app/page.tsx` — this is an intentional parse-error fixture from an earlier phase, unrelated to this plan, out of scope per SCOPE BOUNDARY.

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` blocks and `<acceptance_criteria>` were precise enough that no judgement calls were needed at implementation time.

## Threat Mitigations Applied

| Threat ID | Status | Where |
| --- | --- | --- |
| T-07-05 (tampering on marker body) | mitigated | `verifyFingerprint` in `fingerprint.ts` detects body changes before any overwrite |
| T-07-07 (regex backtracking) | mitigated | `BLOCK_PATTERN` uses non-greedy `[\s\S]*?` bounded by required end-marker literal |
| T-07-08 (`\r\r\n` on round-trip) | mitigated | `applyEolBom` normalizes to LF first then converts to target EOL |

No new threat surface introduced.

## Known Stubs

None. All exports are fully implemented and unit-tested.

## TDD Gate Compliance

- Task 1: RED commit `d19611f` (test only, all 18 tests failing on missing import) → GREEN commit `6ccba4c` (implementation, all 18 passing).
- Task 2: RED commit `f74239c` (test only, all 23 tests failing on missing import) → GREEN commit `808e2fe` (implementation, all 23 passing).

Gate sequence intact for both tasks.

## Self-Check: PASSED

- `src/init/markers.ts` — FOUND
- `src/init/fingerprint.ts` — FOUND
- `src/init/eol.ts` — FOUND
- `test/init/markers.test.ts` — FOUND
- `test/init/fingerprint.test.ts` — FOUND
- `test/init/eol.test.ts` — FOUND
- Commit `d19611f` — FOUND
- Commit `6ccba4c` — FOUND
- Commit `f74239c` — FOUND
- Commit `808e2fe` — FOUND
