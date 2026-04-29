# Phase 04 — Security Audit (next-js-app-router-adapter)

**ASVS Level:** standard
**Block-on:** high
**Threats Closed:** 17/17 (10 mitigate verified in code, 7 accepted)
**Open:** 0
**Unregistered Flags:** none (no `## Threat Flags` section in any 04-XX-SUMMARY.md)

## Threat Verification — Mitigate

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-04-02 | Tampering | mitigate | All new fixtures land under `test/fixtures/next-app-router/` and `test/fixtures/next-detect-*/` (verified via Glob: 17 fixture files, all confined). |
| T-04-04 | Tampering (symlink) | mitigate | `src/adapters/next/discover.ts:42` and `src/adapters/next/route-map.ts:384` both pass `cwd: appRoot` to `tinyglobby`. `grep realpath` returns no matches in `src/adapters/next/`. |
| T-04-05 | DoS (symlink loop) | mitigate | `tinyglobby` is the globber: `discover.ts:15` and `route-map.ts:26` both `import { glob } from "tinyglobby"`. tinyglobby has built-in inode tracking. |
| T-04-06 | DoS (node_modules walk) | mitigate | `ignore: ["**/_*/**", "**/node_modules/**"]` present in both `discover.ts:44` and `route-map.ts:386`. |
| T-04-09 | Tampering (path traversal) | mitigate | `route-map.ts:368`: `if (segments.some((s) => s === "." || s === "..")) return cloneEmpty();`. Test `test/adapters/next/route-map.test.ts:172` ("returns matched:false on path-traversal route /../etc") asserts `{ matched: false, entries: [], params: {}, slots: {} }`. |
| T-04-10 | Information disclosure (`_private`) | mitigate | (a) Glob ignore `**/_*/**` in both `discover.ts:44` and `route-map.ts:386`. (b) Defense-in-depth in `route-map.ts:111-115` where `seg.kind === "private"` short-circuits to a detached node, plus `route-map.ts:286` excludes `private` during walk. Tests `discover.test.ts:21-25` and `route-map.test.ts:112-126` (NEXT-02) assert `_internal` excluded from entries AND slots. |
| T-04-11 | DoS (symlink loop in route-map) | mitigate | `route-map.ts:26` uses `tinyglobby`. Same engine as T-04-05. |
| T-04-13 | Info disclosure (slots leak into entries) | mitigate | `SegmentNode.parallelSiblings` is a separate `Map` from `children` (`route-map.ts:42-46`). `promoteParallel` (lines 150-162) moves `@slot` children out of `children` into `parallelSiblings`. `walkSlot` writes only to `slots[slotName]` (lines 245-253, 311-318). Test `route-map.test.ts:104-110` asserts `m.entries.some((p) => p.includes("/@modal/"))).toBe(false)`. |
| T-04-15 | Spoofing (synthetic parse-error runtime) | mitigate | `src/adapters/next/NextJsAdapter.ts:94` sets `runtime: "server"` on the synthetic parse-error `ComponentDefinition`. `test/adapters/types.test.ts:30` asserts `runtime: "server"` is present in the canonical 13-field shape. |
| T-04-16 | Tampering (async stub forgets await) | mitigate | All three shims (`detect`, `discoverEntries`, `mapRouteToEntry`) in `NextJsAdapter.ts:42-53` use `async`/`return` of the awaited delegate. Smoke tests `NextJsAdapter.test.ts` and `runtime.test.ts` assert concrete return shapes (objects with `entries`, `slots`, `runtime` fields), which would fail on a forgotten `await` (would receive a `Promise`). |

## Threat Verification — Accept (documented, no code check)

| Threat ID | Category | Rationale (from PLAN) |
|-----------|----------|------------------------|
| T-04-01 | Tampering | Fixture path with `..`/absolute is a developer-time concern; tests run in trusted dev sandbox. |
| T-04-03 | Elevation | `next.config.mjs` is never `import()`-ed; only `fs.access`-ed (verified `detect.ts:25-28`). |
| T-04-07 | Elevation | `next.config.ts` likewise only `fs.access`-ed. |
| T-04-08 | DoS | >50k file App Router accepted as out-of-scope perf concern; no SLA in v1. |
| T-04-12 | DoS | 10000-segment URL recursion accepted; not realistic threat surface. |
| T-04-14 | Info disclosure | `"use client"` injection by definition originates in user code; trust boundary lies upstream. |
| T-04-17 | DoS | Per-file directive read latency accepted; cache deferred per PROJECT.md constraints. |

## Unregistered Flags

None. No `## Threat Flags` section was emitted in any of `04-01-SUMMARY.md`, `04-02-SUMMARY.md`, `04-03-SUMMARY.md`, `04-04-SUMMARY.md`.

## Implementation Files Audited (read-only)

- `src/adapters/next/NextJsAdapter.ts`
- `src/adapters/next/detect.ts`
- `src/adapters/next/discover.ts`
- `src/adapters/next/route-map.ts`
- `src/adapters/next/segments.ts`
- `test/adapters/next/*.test.ts`
- `test/adapters/types.test.ts`

No implementation file modified.
