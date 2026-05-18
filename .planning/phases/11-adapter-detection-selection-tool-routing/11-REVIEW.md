---
phase: 11-adapter-detection-selection-tool-routing
reviewed: 2026-05-18T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/adapters/expo/ExpoRouterAdapter.ts
  - src/adapters/expo/detect.ts
  - src/adapters/next/detect.ts
  - src/adapters/select.ts
  - src/init/argv.ts
  - src/cli.ts
  - src/mcp/tools/get-full-hierarchy.ts
  - src/mcp/tools/focus-on.ts
  - src/mcp/tools/find-by-text.ts
  - src/mcp/tools/find-by-style.ts
  - test/adapters/expo/detect.test.ts
  - test/adapters/select.test.ts
  - test/adapters/next/detect.test.ts
  - test/cli/framework-flag.test.ts
findings:
  critical: 4
  warning: 5
  info: 3
  total: 12
status: fixed
---

# Phase 11: Code Review Report

**Reviewed:** 2026-05-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 11 adds ExpoRouterAdapter, two-signal detection probes for both frameworks,
the `selectAdapter` orchestrator, the `--framework` CLI flag, and refactors all
four MCP tool handlers to route through `selectAdapter`. The overall shape is
sound, but four blockers prevent safe shipping: a process-global singleton that
leaks state across concurrent tool calls, path-traversal exposure on user-supplied
`projectRoot`, a `Promise.allSettled`-vs-`Promise.all` gap that silently drops
probe errors, and a stale tool description string locked to Next.js. Five warnings
cover the `--framework` allowlist living in two places, mismatched detect logic
between `detect` (old) and `detectNextJs` (new), missing `_layout.js/.jsx`
variants, a test that relies on process-level timeout instead of a mock, and a
`setFrameworkOverride(undefined as any)` type unsafety in tests.

---

## Critical Issues

### CR-01: Process-global `_frameworkOverride` singleton races across concurrent MCP calls

**File:** `src/adapters/select.ts:8-17`

**Issue:** `_frameworkOverride` is a module-level variable. The MCP server is a
long-running process; when two concurrent tool calls arrive (e.g., two simultaneous
`get_full_hierarchy` requests, one from an agent and one from an IDE plugin) with
different `projectRoot` values, the override set by `setFrameworkOverride` in
`cli.ts` at startup is safe for that use case — but the public `setFrameworkOverride`
export allows any code path (including tests that forget `beforeEach` cleanup) to
permanently mutate the singleton for the rest of the process lifetime. In the test
suite, `select.test.ts:27` calls `setFrameworkOverride(undefined as any)` (see WR-01
below) to reset state: this means the reset mechanism already relies on `undefined`
being accepted, but the function signature `(v: string): void` does not accept it.
More critically, if the server ever supports parallel project roots (different tools
calling `selectAdapter` with different roots while the override is set for one of
them), all roots will get the same overridden adapter regardless of their actual
content. The parameter `override: string | undefined = _frameworkOverride` in
`selectAdapter` reads the module-level variable at call time, meaning a late call
to `setFrameworkOverride` between tool calls changes which adapter every subsequent
call gets — there is no per-request isolation.

**Fix:** Do not expose `setFrameworkOverride` as a mutable global. Pass the
override as an explicit parameter through the call chain from CLI startup, or
store it in a per-request context object. For the CLI use case, read it once at
startup and close over it:

```typescript
// cli.ts — capture at startup, pass explicitly
const frameworkOverride = frameworkVal; // string | undefined

// In each tool handler, pass override into selectAdapter explicitly:
const adapter = await selectAdapter(root, frameworkOverride);
```

Remove the module-level `_frameworkOverride` and the `setFrameworkOverride` export
entirely. If test isolation requires resetting state, inject via function argument
rather than a global setter.

---

### CR-02: `Promise.all` swallows individual probe errors — a probe exception causes total failure with no meaningful error message

**File:** `src/adapters/select.ts:23-26`

**Issue:** `Promise.all([detectNextJs(projectRoot), detectExpoRouter(projectRoot)])`
will reject with the first probe error. If `detectNextJs` throws (for example,
a permission error on `package.json` that the `catch {}` in `detect.ts` does NOT
catch — only JSON parse errors are caught there; an `EACCES` on `readFile` IS
caught, but if the outer `try` somehow throws at a different point), the entire
`selectAdapter` call rejects with an unhandled promise rejection that surfaces as
a generic server error, not a user-actionable tool error. More concretely: the
detect functions use `catch {}` to suppress errors, but only inside their own
`try` blocks. If a bug is introduced in a future detect function that throws
outside a `try`, `Promise.all` rejects and the tool handlers' `withErrorBoundary`
must then handle it. The issue right now is that the behavior difference between
"probe throws" (Promise.all rejects → withErrorBoundary emits generic error) and
"probe returns detected:false" (zero-match ToolResponse) is invisible to the
caller — a filesystem permission problem looks identical to a clean zero-match.

The more concrete immediate bug: `Promise.all` has no timeout. On a very slow
network-mounted path, both probes hang indefinitely, blocking the MCP response
forever. There is no cancellation mechanism.

**Fix:** Use `Promise.allSettled` and convert rejected settlements to
`{ detected: false, signals: [] }` with a warning:

```typescript
const [nextSettled, expoSettled] = await Promise.allSettled([
  detectNextJs(projectRoot),
  detectExpoRouter(projectRoot),
]);
const nextResult = nextSettled.status === "fulfilled"
  ? nextSettled.value
  : { detected: false, signals: [] as string[] };
const expoResult = expoSettled.status === "fulfilled"
  ? expoSettled.value
  : { detected: false, signals: [] as string[] };
```

Probe failures should be surfaced as warnings in the tool response, not silently
collapsed or allowed to bubble as unhandled rejections.

---

### CR-03: No path-traversal guard on user-supplied `projectRoot` — arbitrary filesystem read

**File:** `src/adapters/expo/detect.ts:22`, `src/adapters/next/detect.ts:43`

**Issue:** Both detect functions call `readFile(join(absRoot, "package.json"), ...)` 
where `absRoot` comes directly from the MCP tool input `projectRoot` field. The
`resolveRoot` function in `src/core/resolve-root.ts` calls `path.resolve(candidate)`,
which converts relative paths to absolute and normalizes `..` traversals — but it
does NOT restrict the resolved path to any safe prefix. An MCP client (or a
malicious prompt injection) can pass `projectRoot: "/"` or
`projectRoot: "C:\\Users\\username\\.ssh"` and the server will read
`package.json` from that directory. On a system where `~/.ssh/package.json` exists,
its contents are JSON-parsed and inspected for dependency keys. More broadly, the
detect functions iterate over `NEXT_CONFIGS` and call `fs.access` on each —
confirming the existence of arbitrary paths under any directory on disk.

The four tool handlers all call `resolveRoot(args.projectRoot)` → `selectAdapter(root)` →
`detectNextJs/detectExpoRouter(root)` with no restriction on what `root` can be.

**Fix:** Add a `containsPath` guard in `resolveRoot` or in `selectAdapter` that
rejects roots that are not under a configured safe prefix (e.g., an env-var
allowlist). At minimum, reject paths that resolve to filesystem roots or well-known
sensitive directories:

```typescript
// src/core/resolve-root.ts — add after path.resolve:
const resolved = path.resolve(candidate);
const SENSITIVE = ["/etc", "/root", os.homedir() + "/.ssh"];
if (SENSITIVE.some(s => resolved === s || resolved.startsWith(s + path.sep))) {
  throw new Error(`projectRoot resolves to a sensitive system path: ${resolved}`);
}
```

A more principled fix is to require that `projectRoot` be a directory (not a file
path) and contain a `package.json` before any further probing. The current code
already reads `package.json`, but ignores a missing file silently — a missing
`package.json` at an attacker-controlled root means the probe proceeds to check
for config files via `fs.access`, leaking directory structure.

---

### CR-04: Stale tool description in `get-full-hierarchy.ts` is framework-locked to Next.js after the multi-framework refactor

**File:** `src/mcp/tools/get-full-hierarchy.ts:14-15`

**Issue:** The `description` string reads:

> "Returns the ordered layout chain and page component subtree for a **Next.js App Router** route."

After Phase 11's refactor, `get-full-hierarchy` routes through `selectAdapter` and
can serve Expo Router projects as well. The description is now factually incorrect
for any Expo Router project. MCP clients and AI agents use the tool description to
decide which tool to call — a description that says "Next.js App Router" will cause
agents to skip calling this tool for Expo Router projects, defeating the purpose of
the multi-framework refactor.

Additionally, the `route` parameter description and regex in the `inputSchema`
(line 21-27) are also Next.js-specific:
- The regex `/^\/$|^\/(?:[\w-]+|\[[\w.]+\]...)...$/` encodes Next.js dynamic
  route syntax only.
- The description says "Next.js App Router route path".

For Expo Router, the routing convention is the same file-based pattern but the
tool description will mislead agents into thinking it does not apply.

**Fix:** Update the description and `route` param description to be
framework-neutral, or add a note that it works for both Next.js App Router and
Expo Router:

```typescript
export const description =
  "Returns the ordered layout chain and page component subtree for a " +
  "file-based router project (Next.js App Router or Expo Router).";
```

For the `route` param description, note Expo Router compatibility. The regex is
acceptable as-is since both frameworks share the same route path syntax.

---

## Warnings

### WR-01: `setFrameworkOverride` type signature rejects `undefined` but tests pass it

**File:** `src/adapters/select.ts:10`, `test/adapters/select.test.ts:27`

**Issue:** `setFrameworkOverride(v: string): void` declares `v` as `string`, but
`select.test.ts:27` calls `setFrameworkOverride(undefined as any)` to reset the
singleton. This is a type lie that TypeScript accepts only because of the `as any`
cast. If the function body ever does `v.toLowerCase()` or similar, the `undefined`
reset silently throws at runtime.

**Fix:** Change the signature to accept `undefined` explicitly:

```typescript
export function setFrameworkOverride(v: string | undefined): void {
  _frameworkOverride = v;
}
```

---

### WR-02: `--framework` allowlist is duplicated between `cli.ts` and `select.ts` — they can drift

**File:** `src/cli.ts:77`, `src/adapters/select.ts:19-20`

**Issue:** The valid framework values `["nextjs", "expo-router"]` are hardcoded in
two places: `cli.ts` (line 77, the `VALID_FRAMEWORKS` array) and `select.ts` (the
`if (override === "nextjs")` / `if (override === "expo-router")` branches, line
19-20). If a new framework is added, a developer must update both files. Forgetting
`cli.ts` means the CLI rejects a valid value; forgetting `select.ts` means a
validated value falls through to the probe path instead of short-circuiting. The
help text in `cli.ts:14` is a third copy.

**Fix:** Export a `VALID_FRAMEWORKS` constant from `select.ts` and import it into
`cli.ts`:

```typescript
// src/adapters/select.ts
export const VALID_FRAMEWORKS = ["nextjs", "expo-router"] as const;
export type FrameworkName = typeof VALID_FRAMEWORKS[number];
```

---

### WR-03: `detectExpoRouter` does not check for `_layout.js` or `_layout.jsx` — misses JS-only Expo projects

**File:** `src/adapters/expo/detect.ts:36-49`

**Issue:** Signal 2 only checks for `_layout.tsx`. Expo Router supports JavaScript
projects where the root layout is `app/_layout.js` or `app/_layout.jsx`. A JS-based
Expo Router project with `expo-router` in `package.json` AND `app/_layout.js` will
have Signal 1 but not Signal 2, returning `detected: false`. The project is then
either undetected (zero-match error) or — worse — if some other probe matches —
misidentified.

**Fix:** Extend `layoutCandidates` to include `.js` and `.jsx` variants:

```typescript
const layoutCandidates = [
  { rel: "app/_layout.tsx", full: join(absRoot, "app", "_layout.tsx") },
  { rel: "app/_layout.jsx", full: join(absRoot, "app", "_layout.jsx") },
  { rel: "app/_layout.js",  full: join(absRoot, "app", "_layout.js") },
  { rel: "src/app/_layout.tsx", full: join(absRoot, "src", "app", "_layout.tsx") },
  { rel: "src/app/_layout.jsx", full: join(absRoot, "src", "app", "_layout.jsx") },
  { rel: "src/app/_layout.js",  full: join(absRoot, "src", "app", "_layout.js") },
];
```

---

### WR-04: `detect` (old Next.js function) and `detectNextJs` (new) use divergent logic — one can return true while the other returns false for the same root

**File:** `src/adapters/next/detect.ts:21-36` vs `38-62`

**Issue:** The legacy `detect(absRoot)` function (line 21) checks for `next.config.*`
AND `app/` or `src/app/`. The new `detectNextJs(absRoot)` function (line 38) checks
for `"next"` in `package.json` AND `next.config.*`. These are different two-signal
combinations. A project that has `next.config.js` + `app/` but no `next` dep in
`package.json` will have `detect()` return `true` but `detectNextJs()` return
`false` (detected: false). Conversely, a project with `next` in `package.json`
and `next.config.js` but a Pages-only structure (no `app/`) returns `detect()=false`
but `detectNextJs()=true`.

`selectAdapter` uses `detectNextJs`; the original `detect` function is presumably
still used by `NextJsAdapter.detect()` somewhere (it is exported from the file and
tested). Having two different detection answers for the same root from the same
module is a latent correctness bug.

**Fix:** Align the two functions or deprecate `detect` and have `NextJsAdapter.detect`
delegate to `detectNextJs`:

```typescript
// In NextJsAdapter or wherever detect() is called:
export async function detect(absRoot: string): Promise<boolean> {
  const { detected } = await detectNextJs(absRoot);
  return detected;
}
```

---

### WR-05: `framework-flag.test.ts` integration test uses process-level `spawnSync` timeout as test correctness signal

**File:** `test/cli/framework-flag.test.ts:20-29`

**Issue:** The test for `--framework nextjs` (valid value) asserts that `result.stderr`
does NOT contain `[framework] error`. However, the process is killed after a 3-second
timeout (`timeout: 3000`) because the MCP server hangs waiting for stdin. The test
relies on the process being alive long enough to not emit an error, but if the process
crashes for a different reason (e.g., missing `__TOOL_VERSION__` global at runtime
with tsx, or a startup import error) within 3 seconds, `result.status` will be
non-zero and `result.stderr` may contain unrelated errors — yet the test passes
because it only checks that the specific `[framework] error` string is absent.

The test should assert `result.status` is `null` (killed by timeout, meaning it
started successfully) rather than only checking that a specific string is absent
from stderr.

**Fix:**

```typescript
it("does not exit with framework error for valid --framework nextjs", () => {
  const result = spawnSync(
    "node",
    ["--import=tsx/esm", "src/cli.ts", "--framework", "nextjs"],
    { encoding: "utf8", timeout: 3000, cwd: path.resolve("e:/ui-to-hierarch") },
  );
  // null status = killed by timeout (server started and was waiting for MCP input)
  // 0 = clean exit (unexpected but acceptable)
  // 1+ = error exit (framework validation or startup failure)
  expect(result.status).toBeOneOf([null, 0]);
  expect(result.stderr).not.toContain("[framework] error");
});
```

---

## Info

### IN-01: `ExpoRouterAdapter.detect()` always returns `false` — correct as stub but silently breaks any caller relying on the adapter's own `detect`

**File:** `src/adapters/expo/ExpoRouterAdapter.ts:23-25`

**Issue:** The `detect` method returns `false` unconditionally. This is documented
as a stub. However, if any code path calls `adapter.detect(root)` after `selectAdapter`
returns an `ExpoRouterAdapter` instance (e.g., a future diagnostic or verification
step), it will always be told the adapter does not match. This is a correctness
time-bomb if the `detect` method is ever used for post-selection verification.

**Fix:** Track this as a known stub with a `TODO` or throw `NotImplementedError`
to make the stub's incompleteness explicit rather than silently lying:

```typescript
async detect(_absRoot: string): Promise<boolean> {
  // TODO(Wave 2): implement real detection; stub returns false.
  // Do NOT call this method on an already-selected ExpoRouterAdapter instance.
  return false;
}
```

---

### IN-02: Hardcoded absolute Windows path in test file

**File:** `test/cli/framework-flag.test.ts:13`

**Issue:** `cwd: path.resolve("e:/ui-to-hierarch")` is a hardcoded absolute Windows
path. This test will fail on any machine where the project is not checked out at
`e:/ui-to-hierarch` (CI, other developer machines, macOS/Linux).

**Fix:** Use a path relative to the test file or the project root:

```typescript
cwd: path.resolve(import.meta.dirname, "../../.."),
// or
cwd: path.resolve(process.cwd()),
```

---

### IN-03: `get-full-hierarchy.ts` route regex does not validate trailing slash rule it describes

**File:** `src/mcp/tools/get-full-hierarchy.ts:21-28`

**Issue:** The `route` field description says "No trailing slash except for root."
The regex `^\/$|^\/(?:...)(?:\/(?:...))* $` correctly handles the root `/` case
and requires no trailing slash for non-root paths — but this is enforced only
implicitly by the regex structure. If the regex is ever modified (e.g., to add new
dynamic segment patterns), the trailing-slash constraint could silently break. The
constraint is documented in the description string but not with an explicit
`.refine()` check.

**Fix:** Add an explicit refine for clarity and maintainability:

```typescript
route: z.string()
  .regex(ROUTE_REGEX)
  .refine(
    v => v === "/" || !v.endsWith("/"),
    { message: "Route must not have a trailing slash (except root /)" }
  )
  .describe("..."),
```

---

_Reviewed: 2026-05-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
