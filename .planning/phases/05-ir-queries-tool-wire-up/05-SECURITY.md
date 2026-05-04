---
phase: 5
slug: ir-queries-tool-wire-up
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-04
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| MCP client → tool handler | `args` validated by zod schema (Phase 2). | Tool args (projectRoot, route, text, style key/value) |
| Handler → Analyzer constructor | `args.projectRoot` resolved via `resolveRoot` (Phase 1 ARCH-03). | Absolute project root path |
| Analyzer → user filesystem (Babel parser) | Per-call AST cache reads user-provided files; covered by Phase 3 D-12 no-throw + `errorRecovery: true`. | Source bytes, user JSX/TSX |
| Adapter call surface | `FrameworkAdapter` methods may throw on programming bugs; user-data errors arrive as shape (`RouteMatch.matched=false`, `kind:"error"` RenderNodes). | Adapter exceptions, route shape |
| Analyzer exception → withErrorBoundary | Programming bugs surface as MCP error via `internalError()` (Phase 2 T-02-03 strips stacks). | Error message only |
| Per-call cache lifecycle | `ParseContext` + `styleIndex` are instance fields, GC'd at handler exit (ARCH-02). | None (no persistence) |
| Test fixtures → Babel parser | Fixture `.tsx` files parsed by Babel during tests; parse-error fixture is intentionally malformed. | Synthetic JSX (no PII) |
| Test mutation → filesystem | Mutation test rewrites `app/page.tsx` in-place inside `try/finally`. | Fixture bytes |
| Test client ↔ MCP server | In-process via `InMemoryTransport`; same-process trust. | Tool envelopes |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01-01 | Tampering | mutation-test fixture file | mitigate | `try/finally` + `writeFileSync` restore — `test/core/analyzer.test.ts:564,578,580`; CI gate `git status --porcelain test/fixtures/phase-05/micro/mutation-test/` | closed |
| T-05-01-02 | Information Disclosure | fixture content | accept | Synthetic JSX only; no PII/secrets | closed |
| T-05-01-03 | Denial of Service | parse-error file blocking parse | accept | Babel `errorRecovery: true` (Phase 3 D-12 lock) | closed |
| T-05-02-01 | Tampering | Analyzer cross-call state leakage | mitigate | ARCH-02 grep gate — zero `static` fields, zero module-scope `cache` in `src/core/Analyzer.ts`; mutation test asserts new content on second instance — `test/core/analyzer.test.ts:564-587`; duplicate gate `test/mcp/tools/find-by-style.test.ts:154` | closed |
| T-05-02-02 | Information Disclosure | adapter exception leaking stack to MCP error | mitigate | try/catch around adapter calls, messages routed to `ctx.warnings` — `src/core/Analyzer.ts:512-571,629-852`; `internalError` strips stacks — `src/mcp/errors.ts:23,25-36` | closed |
| T-05-02-03 | Denial of Service | pathological input causing infinite loop in slot substitution | mitigate | `replaceSlot` finite recursive visit-and-clone — `src/core/Analyzer.ts:203-222`; deterministic slot iteration via `Object.keys(rm.slots).sort()`; Phase 4 cycle guard | closed |
| T-05-02-04 | Tampering | `parseExpression` on user-supplied `style={{...}}` | mitigate | Pure parser (no eval), wrapped in try/catch, drop silently per D-14 — `src/core/Analyzer.ts:79-89` | closed |
| T-05-02-05 | Denial of Service | Levenshtein O(m*n) on unbounded text-node values | accept | Bounded by source-derived strings; top-5 ≤ 2-distance early-exit | closed |
| T-05-02-06 | Information Disclosure | Windows backslash leakage through IR `file:` field | mitigate | 26 `toForwardSlash` call sites in `src/core/Analyzer.ts`; no-backslash assertion `test/core/analyzer.test.ts:597-609` | closed |
| T-05-03-01 | Tampering | mutation-test fixture left dirty on test crash | mitigate | `try/finally` restore — `test/core/analyzer.test.ts:564,578,580`; manual CI gate command documented in `05-05-PLAN.md:319` | closed |
| T-05-03-02 | Tampering | parallel test on same file | accept | Vitest per-file isolation default; mutation test in single `it` block | closed |
| T-05-03-03 | Information Disclosure | snapshot files leaking environment-specific paths | mitigate | `toForwardSlash` discipline + forward-slash assertion `test/core/analyzer.test.ts:609`; PR review of committed snapshots | closed |
| T-05-04-01 | Information Disclosure | programming-bug stack leaking through MCP error | mitigate | `withErrorBoundary` → `internalError` (`err.message` only) — `src/mcp/errors.ts:23,25-36,55-64`; preserved in all 4 handlers (`src/mcp/tools/get-full-hierarchy.ts:36`, `focus-on.ts:33`, `find-by-text.ts`, `find-by-style.ts`) | closed |
| T-05-04-02 | Tampering | handler regressing R8 by hardcoding `isError:true` | mitigate | grep `isError\s*:\s*true` against `src/mcp/tools/` returns ZERO; tests assert `isError` falsy — `get-full-hierarchy.test.ts:124,140`, `focus-on.test.ts:99`, `find-by-text.test.ts:110`, `find-by-style.test.ts:143` | closed |
| T-05-04-03 | Spoofing | fabricated `projectRoot` outside repo | accept | All 4 handlers call `resolveRoot(args.projectRoot)` (Phase 1 ARCH-03) | closed |
| T-05-04-04 | Denial of Service | spamming tool calls each constructing fresh Analyzer | accept | ARCH-02 per-call construction confirmed; performance deferred to Phase 6 per SPEC | closed |
| T-05-05-01 | Tampering | phase-gate fixture-cleanup verification missed | mitigate | Primary: `try/finally` restore — `test/core/analyzer.test.ts:564-583`; secondary: `git status --porcelain test/fixtures/phase-05/micro/mutation-test/` documented `05-05-PLAN.md:319`, confirmed clean in `05-05-SUMMARY.md:132` | closed |
| T-05-05-02 | Information Disclosure | absolute Windows paths in test snapshots | mitigate | `toForwardSlash` discipline + structural-shape assertions on JSON envelopes; forward-slash assertion `test/core/analyzer.test.ts:609` | closed |
| T-05-05-03 | Spoofing | test calling tool with `projectRoot` outside repo | accept | Tests use `path.resolve("test/fixtures/...")` — fully controlled | closed |
| T-05-05-04 | Denial of Service | Tier 2 test suite runtime exceeding CI budget | accept | 4 test files × ~5–8 `it` blocks × O(routes × files) on small fixtures = bounded; cache strategy deferred to Phase 6 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-01-02 | Phase 5 fixtures are synthetic JSX authored for testing — no PII, secrets, or production data. | huydv98 | 2026-05-04 |
| AR-05-02 | T-05-01-03 | Babel `errorRecovery: true` is the Phase 3 D-12 lock; parse-error fixture exercises that path without blocking runtime. | huydv98 | 2026-05-04 |
| AR-05-03 | T-05-02-05 | Levenshtein input lengths bounded by source-derived JSX text values; top-5 ≤ 2-distance early-exit prevents pathological cost. | huydv98 | 2026-05-04 |
| AR-05-04 | T-05-03-02 | Vitest default per-file isolation; mutation test confined to one `it`. Revisit with `it.sequential` only if parallelism issues are observed. | huydv98 | 2026-05-04 |
| AR-05-05 | T-05-04-03 | `resolveRoot` resolves to absolute path; static-analysis only (no code execution); attack surface already mitigated by Phase 1 ARCH-03. | huydv98 | 2026-05-04 |
| AR-05-06 | T-05-04-04 | ARCH-02 mandates per-call construction; cross-call performance is Phase 6 territory per SPEC; intra-call memoization via `routeTreeCache` already present. | huydv98 | 2026-05-04 |
| AR-05-07 | T-05-05-03 | Tests use `path.resolve("test/fixtures/...")`; production attack surface identical to Phase 1 ARCH-03 mitigation. | huydv98 | 2026-05-04 |
| AR-05-08 | T-05-05-04 | Tier 2 suite bounded; cache strategy deferred to Phase 6 if CI budget pressure emerges. | huydv98 | 2026-05-04 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-04 | 20 | 20 | 0 | gsd-security-auditor |

### Audit Notes

- **No new attack surface introduced.** All 3 plan summaries (05-03, 05-04, 05-05) explicitly report "None" — no new network endpoints, auth paths, or trust boundaries.
- **ARCH-02 defense in depth:** grep gate duplicated across `test/core/analyzer.test.ts:587` and `test/mcp/tools/find-by-style.test.ts:154`.
- **Phase-gate handler-wiring grep** at `test/mcp/tools/find-by-style.test.ts:158-161` confirms no `notImplemented(name)` and `new Analyzer` present in all 4 handler files.
- **T-05-05-01 informational note:** the `git status --porcelain` phase gate is documented as a manual CI verification command rather than an automated test assertion. The primary code-level mitigation (try/finally restore) provides the actual guarantee; consider adding the git-status check to a CI script as a safety net.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-04
