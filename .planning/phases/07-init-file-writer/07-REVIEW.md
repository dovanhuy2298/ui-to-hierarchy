---
phase: 07-init-file-writer
reviewed: 2026-05-11T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - src/cli.ts
  - src/global.d.ts
  - src/init/argv.ts
  - src/init/eol.ts
  - src/init/fingerprint.ts
  - src/init/index.ts
  - src/init/markers.ts
  - src/init/targets.ts
  - src/init/template.ts
  - src/init/writer.ts
  - test/init/__snapshots__/template-guide.md
  - test/init/argv.test.ts
  - test/init/eol.test.ts
  - test/init/fingerprint.test.ts
  - test/init/integration.test.ts
  - test/init/markers.test.ts
  - test/init/targets.test.ts
  - test/init/template.test.ts
  - test/init/writer.test.ts
  - tsup.config.ts
  - vitest.config.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: fixes_applied
fixed:
  - CR-01
  - WR-01
  - WR-02
  - WR-03
  - WR-04
  - IN-01
  - IN-02
  - IN-03
fixed_at: 2026-05-11
remaining: []
---

# Phase 7: Code Review Report

**Reviewed:** 2026-05-11
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

Note: This document is intentionally pure ASCII. The CR-01 finding describes BOM behavior using the escape sequence "U+FEFF" and the byte triple "EF BB BF" only -- no literal invisible Unicode appears anywhere in this file.

## Summary

The Phase 7 `--init` implementation is generally well-structured: pure leaf modules, a single orchestrator, atomic-write semantics, and a clear fingerprint preimage contract. Tests are thorough and the integration suite explicitly stresses the BLOCKER fingerprint-preimage invariant.

However, adversarial tracing surfaced one BLOCKER in the EOL/BOM round-trip path that produces a duplicated UTF-8 BOM whenever a pre-existing file already starts with a BOM, plus several WARNING-class quality and UX defects in the CLI argv dispatch and append semantics. The existing CRLF+BOM integration test does not catch the double-BOM bug because it only asserts on the first three bytes of the file, not on subsequent occurrences of "EF BB BF".

## Critical Issues

### CR-01: Double UTF-8 BOM written when existing file already has a BOM [FIXED 2026-05-11, commit b3a9bda]

**File:** `src/init/index.ts:108-157`, with `src/init/eol.ts:39-43` and `src/init/markers.ts:87-89`

**Issue:**
Node's `Buffer.toString("utf8")` does NOT strip a leading UTF-8 BOM; the BOM is returned as a U+FEFF code unit at index 0 of the resulting string. Tracing the flow in `runTarget`:

1. `existingBuf = await readFile(absPath)` -- buffer contains bytes "EF BB BF ...".
2. `existingText = existingBuf.toString("utf8")` -- string starts with U+FEFF (BOM NOT stripped by Node).
3. `hasBom = detectBom(existingBuf)` returns `true`.
4. `lfText = existingText.replace(/\r\n/g, "\n")` -- the U+FEFF is still at position 0 because `\r\n` is the only thing replaced.
5. On the "no marker block, append" branch: `appended = appendBlock(lfText, markerBlock)` keeps the leading U+FEFF because it is not whitespace and survives `trimEnd()`.
6. `newContent = applyEolBom(appended, eol, hasBom)` prepends ANOTHER U+FEFF (see `eol.ts:42`, which conditionally adds a literal BOM character when `hasBom` is true).

Result on disk: the file begins with the byte sequence "EF BB BF EF BB BF ..." -- a duplicated BOM. Many downstream tools (git diff viewers, some Markdown renderers, IDE encoding detectors) will render the second BOM as a visible zero-width-no-break-space glyph at the top of the file.

The `replaceBlock` branch has the same defect for any existing-file path: the leading U+FEFF is preserved inside `lfText`, written back through, and then `applyEolBom` adds a fresh BOM in front.

The existing integration test at `test/init/integration.test.ts:235-265` does NOT catch this -- it only asserts `bytes1[0..2]` equal "EF BB BF". It never checks that the byte triple does not also appear at offsets 3-5, nor that the U+FEFF code unit appears at most once in the decoded string. Idempotency on run 2 still holds (the doubly-BOM-ed file becomes input, but the noop branch returns `newContent = null` so the file is not re-written), so the integration suite passes despite the bug.

**Fix:**
Strip a leading U+FEFF from `existingText` once `hasBom` has been recorded, before any other processing:

```typescript
if (existingBuf !== null && existingText !== null) {
  hasBom = detectBom(existingBuf);
  eol = detectEol(existingText);
  if (hasBom && existingText.charCodeAt(0) === 0xfeff) {
    existingText = existingText.slice(1);
  }
}
```

Then add a regression test that asserts the byte sequence "EF BB BF" appears at most once in the run-1 output:

```typescript
const buf = await readFile(join(tmpDir, "CLAUDE.md"));
let bomCount = 0;
for (let i = 0; i + 2 < buf.length; i++) {
  if (buf[i] === 0xef && buf[i + 1] === 0xbb && buf[i + 2] === 0xbf) bomCount++;
}
expect(bomCount).toBe(1);
```

## Warnings

### WR-01: `parseInitArgs` strict mode rejects valid server-mode argv [FIXED 2026-05-11, commit 2dc28af]

**File:** `src/cli.ts:52-56`

**Issue:**
`parseInitArgs` runs unconditionally on every invocation, including when the user did not pass `--init` (i.e. when they intend to launch the MCP stdio server). Because `parseInitArgs` uses `strict: true` + `allowPositionals: false`, any future server-mode flag, positional argument, or third-party wrapper that adds an unknown flag will cause the CLI to abort with `[init] error ...`, a confusing error message for someone who never asked for init.

Concrete failure: `node dist/cli.js --debug` (a hypothetical future server flag) prints `[init] error Unknown option '--debug'` and exits 1, even though `--init` is absent. The error category (`init`) is also misleading.

**Fix:**
Only run the strict `parseInitArgs` validation when `meta.init` is truthy. For the non-init path, let the server module own its own argv schema:

```typescript
if (meta.init) {
  const parsed = parseInitArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`[init] error ${parsed.message}\n`);
    process.exit(1);
  }
  runInit(parsed.flags).then(...).catch(...);
} else {
  startServer().catch(...);
}
```

### WR-02: `appendBlock` produces a file with no trailing newline [FIXED 2026-05-11, commit 9828d5a]

**File:** `src/init/markers.ts:87-89`, used in `src/init/index.ts:156`

**Issue:**
`appendBlock` returns `existing.trimEnd() + "\n\n" + newBlock`. `newBlock` itself ends with `<!-- ui-hierarchy-mcp:end -->` (no trailing newline). The orchestrator's "create from scratch" branch (`index.ts:144-145`) adds a final `\n`, but the "append to existing file" branch (`index.ts:155-157`) does NOT. This produces a file with no terminal newline, a POSIX text-file convention violation and a common source of "No newline at end of file" noise in git diffs.

It also makes the two creation paths inconsistent: a brand-new file ends with `\n`, but a file that previously existed and got an appended block does not.

**Fix:**
Either add the trailing newline inside `appendBlock` or in the orchestrator on the append branch:

```typescript
// In index.ts on the !scan.found branch:
const appended = appendBlock(lfText, markerBlock) + "\n";
newContent = applyEolBom(appended, eol, hasBom);
```

Add a marker test that asserts `appendBlock(...).endsWith("\n")` once you decide on the convention.

### WR-03: `actionLabel("skip", true)` produces semantically odd "would skip (hand-edit)" [FIXED 2026-05-11, commit f69a39b]

**File:** `src/init/index.ts:81-89`

**Issue:**
Under `--dry-run`, the helper unconditionally prefixes any non-error outcome with `"would "`. For `skip`, the resulting label is `"would skip (hand-edit)"`, which reads as if the tool is considering skipping. In reality the skip is unconditional: `--dry-run` does not change the decision, and a real (non-dry-run) invocation on the same file would also skip. The "would" prefix only makes sense for outcomes that mutate disk (`create`, `update`); for `skip` and `noop` it is misleading.

This is a quality/UX defect, not a correctness one, but it weakens the D-12 stderr vocabulary contract.

**Fix:**
Only prefix mutating outcomes:

```typescript
function actionLabel(outcome: Outcome, dryRun: boolean): string {
  if (outcome === "error") return "error";
  if (outcome === "skip") return "skip (hand-edit)";
  if (outcome === "noop") return "noop";
  return dryRun ? `would ${outcome}` : outcome;
}
```

### WR-04: `--help` / `--version` write to stderr instead of stdout [FIXED 2026-05-11, commit 1880f34]

**File:** `src/cli.ts:43-50`

**Issue:**
`--help` and `--version` write to `process.stderr`. Conventional CLI behavior (and POSIX guidance) is that explicit `--help` / `--version` output goes to stdout because it is the requested output of a successful command, not a diagnostic. Tools that pipe `npx ui-hierarchy-mcp --version | something` will get an empty pipe.

The argument that stdout is reserved for MCP framing (INIT-11) does not apply here: the server is not running on these short-circuit paths and exits immediately.

**Fix:**
```typescript
if (meta.help) {
  process.stdout.write(HELP_TEXT);
  process.exit(0);
}
if (meta.version) {
  process.stdout.write(`${__TOOL_VERSION__}\n`);
  process.exit(0);
}
```

## Info

### IN-01: Option schema duplicated between `cli.ts` and `argv.ts` [FIXED 2026-05-11, commit d7ba997]

**File:** `src/cli.ts:31-40` and `src/init/argv.ts:59-66`

**Issue:**
The option schemas in `cli.ts` (loose) and `argv.ts` (strict) are duplicates. Drift between the two is a real risk: adding a new flag in one place but not the other would produce silent unknown-flag rejection in strict mode. There is no shared constant.

**Fix:**
Extract the shared option schema to a constant in `init/argv.ts` and import it in `cli.ts`:

```typescript
export const INIT_OPTION_SCHEMA = {
  init: { type: "boolean" as const },
  target: { type: "string" as const },
  "dry-run": { type: "boolean" as const },
  force: { type: "boolean" as const },
  help: { type: "boolean" as const, short: "h" as const },
  version: { type: "boolean" as const, short: "v" as const },
};
```

### IN-02: Dead defensive check in `scanBlock` [FIXED 2026-05-11, commit 964e2b1]

**File:** `src/init/markers.ts:55-56`

**Issue:**
`if (!m || m.index === undefined) return { found: false };` -- `RegExp.prototype.exec` always returns a result with `index` defined when it returns a non-null match. The `m.index === undefined` arm is unreachable. Not harmful, but adds noise and may confuse readers about whether a non-indexed match is possible.

**Fix:**
```typescript
if (!m) return { found: false };
```

### IN-03: Empty `existingText` falls into the append branch [FIXED 2026-05-11, commit 064b9b3]

**File:** `src/init/index.ts:140-178`

**Issue:**
The branching predicate is `if (existingText === null)`. An empty file (file exists, 0 bytes) sets `existingText = ""`, which is non-null, so the code goes through `scanBlock("")` returning `{found: false}` then `appendBlock("", markerBlock)` returning `"\n\n" + markerBlock`. The result is a file that begins with two blank lines before the marker: cosmetically ugly but functionally correct (idempotent on re-run).

This is corner-case quality; not exercised by current tests.

**Fix:**
Treat empty existing content as the create path:

```typescript
if (existingText === null || existingText.length === 0) {
  // create branch
}
```

Or short-circuit `appendBlock` on empty input to skip the leading separator:

```typescript
export function appendBlock(existing: string, newBlock: string): string {
  const trimmed = existing.trimEnd();
  return trimmed.length === 0 ? newBlock : trimmed + "\n\n" + newBlock;
}
```

---

_Reviewed: 2026-05-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
