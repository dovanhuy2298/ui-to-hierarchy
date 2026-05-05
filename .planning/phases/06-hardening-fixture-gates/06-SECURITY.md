---
phase: 06
slug: hardening-fixture-gates
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-05
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| MCP stdio request | Untrusted client → server tool input | `format` enum, `path`, query strings (zod-validated) |
| MCP stdio response | Server → client envelope | IR tree, file paths (forward-slash normalized), JSX prop strings |
| File-system reads | Server → user's project source files | Source code (read-only, parser-only; no execution) |
| Repo commits | Test/perf/UAT artifacts → public git history | Synthetic fixtures, redacted UAT transcripts, host-stripped perf metrics |

Phase 06 modifies test infrastructure and adds two small wire-protocol changes (`format` enum on MCP tools, optional `attributes` on IR). No new runtime threat surface beyond what prior phases already gated.

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|-------------|------------------------|--------|
| T-06-01 | Information Disclosure | Hand-written fixture file content | accept | Synthetic component code only; no PII or secrets. D-12 privacy carve-out applies to UAT evidence, not fixtures. | closed |
| T-06-02 | Information Disclosure | Slot/marker fixture content | accept | Synthetic markers only ("Sidebar slot", "private-internal-marker"); no PII. | closed |
| T-06-03 | Information Disclosure | Synthetic monorepo fixture | accept | All names ("@acme/web", "Buy now") are synthetic; no PII or secrets; no `pnpm install` (D-05 honored). | closed |
| T-06-04 | Tampering | Stale `dist/cli.js` masking source-level changes | mitigate | `test/integration/mcp-e2e.test.ts:31-35` — `statSync` mtime guard throws when `src/cli.ts` is newer than `dist/cli.js`. | closed |
| T-06-05 | Information Disclosure | Backslash leaks in tool output (Windows) | mitigate | `test/integration/mcp-e2e.test.ts:272` per-node `/^[^\\]*$/` regex; `:276` envelope-wide `JSON.stringify(env).match(/\\\\/)` defense-in-depth. | closed |
| T-06-06 | Spoofing | Test imports adapter internals breaking island rule | mitigate | `test/integration/mcp-e2e.test.ts:15` D-11 marker; grep confirms zero `src/adapters` imports. | closed |
| T-06-07 | Information Disclosure | Host metadata in `06-PERF.md` | mitigate | `test/perf/measure.ts:92` D-10 hard exclusion; no `os.hostname`/`os.userInfo` calls; only platform/arch/Node/CPU/RAM emitted. | closed |
| T-06-08 | Information Disclosure | UAT evidence committed with home paths | mitigate | `06-UAT.md:44` runbook step 10 D-12 redaction; `:84` sign-off checklist gate. | closed |
| T-06-09 | Information Disclosure | uat-evidence transcripts leak local env details | mitigate | `06-UAT.md:77,84`; `06-07-PLAN.md:82,96,121` — mandatory USER_HOME redaction + sign-off gate. | closed |
| T-06-10 | Spoofing | Operator pre-ticks PASS Grid without verification | accept | Solo-dev + Claude trust model; sign-off checklist + transcripts provide audit trail. | closed |
| T-06-08-01 | Tampering | `format` parameter on MCP tool input schemas | mitigate | `z.enum(["markdown","json"]).default("markdown")` on all 4 tools: `find-by-style.ts:26-28`, `find-by-text.ts:26-27`, `focus-on.ts:31-32`, `get-full-hierarchy.ts:27-28`. | closed |
| T-06-08-02 | Information Disclosure | JSON-rendered envelope vs markdown | accept | Both formats render the same `tree` from the same Analyzer; JSON exposes no field markdown does not. D-15 envelope schema pinned at `schemaVersion:"1"`. | closed |
| T-06-09-01 | Tampering | Resolved `file` field used as IR identity | mitigate | All overrides pass through `toForwardSlash`: `src/core/Analyzer.ts:65,180,210,218,226,234,242,250,303,873`; resolver normalizes at `src/core/resolver/index.ts:75,93` and `relative.ts:31,37,44`. R5 invariant honored. | closed |
| T-06-09-02 | Denial of Service | Cyclic barrel chains in `chaseBarrel` | accept | Phase 3 resolver `chaseBarrel` already implements cycle detection; post-pass calls `resolveModule` once per callsite — bounded by tree size. | closed |
| T-06-09-03 | Information Disclosure | Warning text leaks file paths | accept | Existing convention; phase adds no new disclosure beyond existing `parse error in {file}` warnings. | closed |
| T-06-10-01 | Information Disclosure | Literal JSX prop strings in envelope | accept | Same source files envelope already exposes via `kind:"text"` nodes; user opted in by pointing analyzer at project. D-12 does not apply (UAT-only). | closed |
| T-06-10-02 | Tampering | Optional `attributes` field via inverse path | accept | No inverse path in v1 (envelope is server→client only); `.optional()` typed shape `Array<{name,value}>` rejects unexpected types at parse time. | closed |
| T-06-10-03 | Backward compat (D-15) | Existing v1 clients see unknown `attributes` field | mitigate | `src/ir/schema.ts:97,104` — `attributes: z.array(...).optional()`; `src/ir/envelope.ts:11` — `schemaVersion: z.literal("1")` retained; `src/renderers/envelope-builder.ts:36` emits `"1"`. Additive evolution per Standard Schema. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-01 / T-06-02 / T-06-03 | Hand-written fixture content is synthetic; no PII or secrets. Phase modifies test infrastructure only. | anhnt@dft.vn | 2026-05-05 |
| AR-06-02 | T-06-10 | Solo-developer + Claude workflow; trust model is single-operator self-reporting backed by sign-off checklist + transcripts. | anhnt@dft.vn | 2026-05-05 |
| AR-06-03 | T-06-08-02 | JSON envelope renders the same `tree` as markdown; no new disclosure class. | anhnt@dft.vn | 2026-05-05 |
| AR-06-04 | T-06-09-02 | Cycle detection pre-existing in Phase 3 resolver `chaseBarrel`; post-pass introduces no unbounded recursion. | anhnt@dft.vn | 2026-05-05 |
| AR-06-05 | T-06-09-03 | Existing warning-path disclosure pattern; phase adds no new leak surface. | anhnt@dft.vn | 2026-05-05 |
| AR-06-06 | T-06-10-01 | Literal JSX props originate from same source files envelope already exposes. | anhnt@dft.vn | 2026-05-05 |
| AR-06-07 | T-06-10-02 | No inverse (client→server envelope) path exists in v1; zod schema rejects unexpected shapes. | anhnt@dft.vn | 2026-05-05 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-05 | 18 | 18 | 0 | gsd-security-auditor |

### Audit Notes — 2026-05-05
- All 9 MITIGATE threats verified against implementation evidence (file:line cited above).
- All 9 ACCEPT threats documented in the Accepted Risks Log.
- Over-coverage observed for T-06-08-01: plan said "3 tool input schemas" but mitigation applies to all 4 MCP tools (extra coverage, not a gap).
- No `## Threat Flags` sections in any 06-NN-SUMMARY.md → no unregistered runtime flags from executors.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-05
