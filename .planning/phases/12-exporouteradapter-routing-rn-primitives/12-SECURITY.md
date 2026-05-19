---
phase: 12
slug: exporouteradapter-routing-rn-primitives
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-19
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| user repo → parser | Static analysis only — no code execution; same boundary carried forward from all prior phases | User-supplied TypeScript/JSX source (no secrets, no PII expected) |
| user fixture filesystem → discover.ts | Static path probing (`fs/promises.access` + `tinyglobby` glob) — no symlink traversal beyond default tinyglobby behavior | File paths only |
| user fixture source → parseSegment | Regex-only string classification on directory/file names — no untrusted input reaches downstream evaluators | Path segment strings |
| user JSX source → ExpoRouterAdapter.extractComponents | Babel parse + AST traversal only; no `eval`; same boundary as NextJsAdapter | User JSX/TSX source files |
| Analyzer JSXOpeningElement visitor → all adapters | The new visitor calls `adapter.slotMarker(name, importSource)` — a pure predicate with no side effects | AST node name + import source string |
| test fixture filesystem → Analyzer pipeline | Pure read-only static analysis for snapshot lock — identical boundary to all prior phases | Fixture file paths and source text |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-12-01 | Tampering | `src/core/import-bindings.ts` (new core utility) | mitigate | Island-rule guard in `test/architecture/island.test.ts` asserts core has no adapter imports; new file inherits the gate | closed |
| T-12-02 | Information Disclosure | Parser output | accept | Phase performs static analysis only on user-provided source; no PII, no secrets read; accepted risk carried forward from prior phases | closed |
| T-12-03 | Tampering | `discover.ts` glob inputs | mitigate | Glob ignore list is a fixed compile-time constant (`**/node_modules/**`, `**/components/**`, etc.); no dynamic injection path exists | closed |
| T-12-04 | Information Disclosure | `discover.ts` ignore patterns | accept | Files excluded by ignore list (`node_modules`, `components`, `hooks`, `utils`) are intentionally out of routing scope; this is a routing filter, not a security boundary | closed |
| T-12-05 | Tampering | `collectChildrenSlotLines` JSXOpeningElement extension | mitigate | New visitor is purely additive; `NextJsAdapter.slotMarker` cannot fire on a `JSXOpeningElement` name; regression covered by full suite green gate (≥494 tests) | closed |
| T-12-06 | Denial of Service | `extractComponents` warning channel (`pendingWarnings`) | mitigate | `pendingWarnings` bounded by number of `discoverEntries` calls (at most one entry per call); flushed and cleared on every `extractComponents` invocation; no unbounded accumulation possible | closed |
| T-12-07 | Information Disclosure | Tabs/Stack `options` attribute serialization | accept | `JSON.stringify` applied over literal-typed properties only (StringLiteral, NumericLiteral, BooleanLiteral); non-serializable values silently omitted per D-03; no execution of user code | closed |
| T-12-08 | Tampering | Locked snapshot files (`expo-basic.md`, `expo-tabs-and-dynamic.md`) | accept | Snapshots are baseline artifacts under version control; any unintended drift surfaces as a failing vitest test before merge | closed |
| T-12-SC | Tampering | npm install surface (Plans 02, 03, 04) | mitigate | Zero new runtime dependencies introduced across all four plans; `tinyglobby` was audited in Phase 9; supply-chain gate carried forward | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-12-01 | T-12-02 | Static analysis tool operating on user-controlled source; no PII or secrets are read; this is a design-level acceptance carried forward from Phase 9 onward | gsd-secure-phase (auto) | 2026-05-19 |
| AR-12-02 | T-12-04 | Ignore-pattern list (`components`, `hooks`, `utils`, `node_modules`) is a routing-scope decision, not a security control — files excluded for relevance, not confidentiality | gsd-secure-phase (auto) | 2026-05-19 |
| AR-12-03 | T-12-07 | Options serialization uses literal-only JSON.stringify; non-literal values are silently omitted, preventing arbitrary code paths from influencing output | gsd-secure-phase (auto) | 2026-05-19 |
| AR-12-04 | T-12-08 | Snapshot files are committed artifacts; version-control history and CI test failure on drift provide adequate tamper evidence for a dev-tool project | gsd-secure-phase (auto) | 2026-05-19 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-19 | 9 | 9 | 0 | gsd-secure-phase (claude-sonnet-4-6) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-19
