---
phase: 09-fixture-design-stub-packages
slug: fixture-design-stub-packages
status: SECURED
threats_open: 0
asvs_level: 1
created: 2026-05-13
audit_mode: RETROACTIVE-STRIDE
register_authored_at_plan_time: false
---

# Security Audit — Phase 09: fixture-design-stub-packages

## Scope

Phase 09 is entirely test infrastructure. It delivers:

- `test/fixtures/expo-basic/` — 11 files (stub node_modules + TSX app files)
- `test/fixtures/expo-tabs-and-dynamic/` — 12 files (stub node_modules + TSX app files)
- `test/core/resolver/expo-stubs.test.ts` — 1 smoke test (73 lines)

No production code was modified. No network endpoints, auth paths, or external service integrations were introduced. The phase is a pure addition of static TypeScript fixture files and a deterministic unit test.

---

## Trust Boundaries

| Boundary | Description | Direction |
|----------|-------------|-----------|
| VCS / git | Stub node_modules committed to git via .gitignore negation | Inbound (developer pushes; CI pulls) |
| Vitest test runner | Test invokes resolveModule() in-process; no subprocess | Internal |
| Fixture → resolver | Fixture paths passed as strings; resolver reads them statically | Internal |
| Fixture files | Static TSX/JSON/.d.ts; never executed at runtime or test time | Inert |

---

## STRIDE Threat Register

Threats were constructed retroactively from the implementation. ASVS Level 1 applies.

### T-09-01: Spoofing — Stub packages impersonate real npm packages at runtime

| Field | Value |
|-------|-------|
| Category | Spoofing |
| Disposition | accept |
| Rationale | Stub packages (`react-native@0.0.0`, `expo-router@0.0.0`) live exclusively under `test/fixtures/*/node_modules/`. They are never installed into the project's own `node_modules/` and are never on any Node.js resolution path that the production build or MCP server binary uses. The root `.gitignore` excludes `node_modules/` globally; the exception (`!test/fixtures/**/node_modules/`) is scoped to fixture directories only. The stubs have version `0.0.0` which is intentionally non-resolvable by any semver range a real package would request. No production code references these paths. Risk is accepted: confined to test infrastructure with no propagation path to production. |
| Status | CLOSED (accepted) |

### T-09-02: Spoofing — .gitignore negation silently exposes real node_modules if scope widens

| Field | Value |
|-------|-------|
| Category | Spoofing |
| Disposition | accept |
| Rationale | The root `.gitignore` negation `!test/fixtures/**/node_modules/` is glob-scoped to `test/fixtures/`. A developer adding a new fixture at a different path would need to extend the glob. The fixture-level `.gitignore` files (`!node_modules/`, `!node_modules/**`) reinforce the intent. The pattern is documented in the SUMMARY files. Risk accepted: incorrect staging of real node_modules would be caught by code review and CI diff inspection before merge. |
| Status | CLOSED (accepted) |

### T-09-03: Tampering — Stub .d.ts files export overly broad types (style?: any, ViewStyle = { [key: string]: any })

| Field | Value |
|-------|-------|
| Category | Tampering |
| Disposition | accept |
| Rationale | Stub types use `any` and open object shapes by design (SPEC REQ-3/REQ-4). These are type-checking shims for test fixture files only; they are never loaded by the TypeScript compiler in production builds. The production build target is `src/` exclusively. The stubs could permit wider TypeScript usage within fixtures, but this has no bearing on runtime behavior since the stubs are `.d.ts` declaration files with no emitted JavaScript. Risk accepted: intentional design choice for minimal stubs; scope is fixture-only. |
| Status | CLOSED (accepted) |

### T-09-04: Tampering — Fixture TSX files could introduce executable side-effects if parsed/evaluated

| Field | Value |
|-------|-------|
| Category | Tampering |
| Disposition | mitigate |
| Mitigation plan | Fixture files must be static declarations with no side-effectful top-level code. Verified: all TSX files contain only import statements, a single `const styles = StyleSheet.create(...)` call (a pure value), and a default-exported function declaration. No `fetch`, `exec`, `spawn`, `eval`, `require()`, or network calls are present in any fixture file. |
| Evidence | grep for `exec|spawn|fetch|http|network|require\(|eval` across `test/fixtures/expo-basic/` and `test/fixtures/expo-tabs-and-dynamic/` returned zero matches. |
| Status | CLOSED |

### T-09-05: Tampering — Smoke test could spawn subprocesses or access the network

| Field | Value |
|-------|-------|
| Category | Tampering |
| Disposition | mitigate |
| Mitigation plan | Smoke test must invoke `resolveModule()` directly in-process with no subprocess spawn, no network I/O, no file writes. |
| Evidence | `test/core/resolver/expo-stubs.test.ts` — grep for `exec|spawn|fetch|http|require\(|eval` returned zero matches. Test imports only `node:path`, `vitest`, `ParseContext` type, and `resolveModule`. No `child_process`, no `fs` writes, no `net` or `http` imports present. |
| Status | CLOSED |

### T-09-06: Repudiation — Stub packages have no version provenance (version 0.0.0)

| Field | Value |
|-------|-------|
| Category | Repudiation |
| Disposition | accept |
| Rationale | Version `0.0.0` is the declared stub convention (SPEC D-03). It is intentionally non-semver-resolvable from any external package registry. The stubs are committed to VCS; their provenance is the git commit history. No audit log is required for test-only stub packages at ASVS Level 1. |
| Status | CLOSED (accepted) |

### T-09-07: Information Disclosure — Stub node_modules committed to git expose internal type shapes

| Field | Value |
|-------|-------|
| Category | Information Disclosure |
| Disposition | accept |
| Rationale | The stub `.d.ts` files expose only the minimal type surface needed by the fixtures (View, Text, Slot, Tabs, etc.). This is a public repository (open-source MCP server project). The type shapes mirror the public API surface of `react-native` and `expo-router`. No proprietary types, credentials, internal API keys, environment variables, or sensitive business logic are present. Risk accepted: stubs are intentionally public-domain minimal type declarations. |
| Status | CLOSED (accepted) |

### T-09-08: Information Disclosure — Test file uses path.resolve() with relative strings

| Field | Value |
|-------|-------|
| Category | Information Disclosure |
| Disposition | accept |
| Rationale | `path.resolve("test/fixtures/expo-basic")` resolves relative to `process.cwd()` (the project root during vitest execution). This is standard practice for test files and does not disclose sensitive paths. The resolved paths are not logged, stored, or transmitted. Risk accepted: test-only pattern, no sensitive information at stake. |
| Status | CLOSED (accepted) |

### T-09-09: Denial of Service — Malformed fixture files could hang the resolver during tests

| Field | Value |
|-------|-------|
| Category | Denial of Service |
| Disposition | accept |
| Rationale | The smoke test invokes `resolveModule()` with bare specifiers (`"react-native"`, `"expo-router"`). Bare specifier resolution classifies packages as external without filesystem I/O for path traversal. The fixture files themselves are never parsed by the smoke test (SPEC isolation constraint). If a fixture file were malformed, it would only affect tests that parse fixture file content — not the Phase 9 resolver smoke test. Risk accepted: resolver is stateless and O(1) for bare specifier classification. |
| Status | CLOSED (accepted) |

### T-09-10: Elevation of Privilege — Stub node_modules files with malicious content are executed

| Field | Value |
|-------|-------|
| Category | Elevation of Privilege |
| Disposition | mitigate |
| Mitigation plan | Stub packages must contain only `.d.ts` declaration files and `package.json` manifests — no executable `.js` files. The `main` field in each stub `package.json` points to `index.js` which does not exist as a real file (only `index.d.ts` exists). If Node.js were to attempt to `require()` or `import()` these stubs at runtime, it would fail to find a `.js` file. The smoke test does not `import` or `require` these packages; it only calls `resolveModule()` with the bare specifier as a string. |
| Evidence | No `.js` files exist under `test/fixtures/expo-basic/node_modules/` or `test/fixtures/expo-tabs-and-dynamic/node_modules/`. The only files are `package.json` and `index.d.ts`. Verified by directory listing: expo-basic stub has `package.json` + `index.d.ts` for each package; expo-tabs-and-dynamic stubs are byte-identical. The smoke test (`expo-stubs.test.ts`) imports `resolveModule` from production source — not from the stub packages. |
| Status | CLOSED |

---

## Unregistered Flags

All three SUMMARY.md files report: **"Threat Flags: None"**

No unregistered threat flags from executor observation. Consistent with phase scope (pure test infrastructure, no runtime attack surface).

---

## Accepted Risks Log

| ID | Threat | Rationale | Owner | Review Trigger |
|----|--------|-----------|-------|----------------|
| AR-09-01 | T-09-01: Stub packages impersonate real npm packages | Version 0.0.0; scoped to test/fixtures/; never on production resolution path | Phase executor | If stubs are referenced from src/ or dist/ |
| AR-09-02 | T-09-02: .gitignore negation scope | Glob-scoped to test/fixtures/**; reinforced by fixture-level .gitignore | Phase executor | If new fixture roots outside test/fixtures/ are added |
| AR-09-03 | T-09-03: Stub types use `any` | Type-checking shims only; .d.ts files emit no JS; production build is src/-only | Phase executor | If stubs are ever loaded by production tsconfig |
| AR-09-06 | T-09-06: Stub version 0.0.0 has no external provenance | Intentional stub convention (SPEC D-03); provenance via git history | Phase executor | Never (by design) |
| AR-09-07 | T-09-07: Stub .d.ts committed to public VCS | Mirrors public npm package API surface; no sensitive content | Phase executor | If proprietary type shapes are added to stubs |
| AR-09-08 | T-09-08: path.resolve() with relative strings in test | Standard vitest pattern; process.cwd() is project root in CI | Phase executor | If tests are relocated or run from unexpected cwd |
| AR-09-09 | T-09-09: Malformed fixture could affect future tests | Smoke test is resolver-only; no fixture content is parsed | Phase executor | If future phases parse fixture content in same test file |

---

## Security Audit Trail

| Step | Finding | Verdict |
|------|---------|---------|
| Load plan files (09-01, 09-02, 09-03) | No threat_model blocks; RETROACTIVE-STRIDE mode confirmed | Noted |
| Load summary files | All three report "Threat Flags: None" | Noted |
| Read all fixture .d.ts stubs | No executable code; type declarations only; no @ts-expect-error; no declare namespace | CLOSED T-09-03, T-09-10 |
| Read all fixture .tsx files | No "use client", no useLocalSearchParams/useRouter, no React named import, no exec/spawn/fetch/network | CLOSED T-09-04 |
| Read smoke test file | No subprocess spawn, no network I/O, no fs writes; only resolveModule() invocation | CLOSED T-09-05 |
| Grep forbidden patterns across expo-basic/ | Zero matches for @ts-expect-error, declare namespace, "use client", useLocalSearchParams, useRouter | Confirmed |
| Grep forbidden patterns across expo-tabs-and-dynamic/ | Zero matches | Confirmed |
| Grep exec/spawn/fetch/eval in test file | Zero matches | CLOSED T-09-05 |
| Verify no .js files in stub node_modules | Only package.json + index.d.ts exist; no executable JS | CLOSED T-09-10 |
| Check root .gitignore negation scope | !test/fixtures/**/node_modules/ — glob-scoped; .env still blocked | Accepted |
| Check fixture-level .gitignore | !node_modules/ + !node_modules/** — reinforces convention | Noted |

---

## Sign-Off

| Field | Value |
|-------|-------|
| Auditor | claude-sonnet-4-6 (gsd-security-auditor) |
| Audit mode | RETROACTIVE-STRIDE |
| ASVS Level | 1 |
| Phase | 09 — fixture-design-stub-packages |
| Threats identified | 10 |
| Threats closed | 10 |
| Threats open | 0 |
| Blockers | None |
| Verdict | SECURED — phase may ship |
| Date | 2026-05-13 |
