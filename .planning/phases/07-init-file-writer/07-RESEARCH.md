# Phase 7: `--init` File Writer — Research

**Researched:** 2026-05-11
**Domain:** CLI file mutation, marker-block injection, atomic writes, EOL/BOM handling, Node.js stdlib
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Argv parsing (D-01 to D-03)**
- Use `node:util.parseArgs` (Node 20+ built-in) with `{ strict: true, allowPositionals: false }`. Zero new deps, declarative schema, native unknown-flag rejection.
- Flag schema: `init: { type: 'boolean' }`, `target: { type: 'string' }`, `'dry-run': { type: 'boolean' }`, `force: { type: 'boolean' }`, `help: { type: 'boolean', short: 'h' }`, `version: { type: 'boolean', short: 'v' }`. `--target` is a single string parsed by `.split(',')` and validated against the enum `claude|codex|cursor|copilot`.
- Dispatch in `src/cli.ts`: if `values.init === true` → call `runInit(values)` then `process.exit`. Otherwise fall through to existing `startServer()` path unchanged. `--help`/`--version` short-circuit before either branch.

**Guide template bundling (D-04 to D-05)**
- Inline TS template literal in `src/init/template.ts`, exporting `renderGuide({ cwd, version }): string`. Backtick template literals compose the four ordered sections (INIT-12).
- Template module is single source of truth for the guide payload; tests snapshot the rendered output.

**Fingerprint format and placement (D-06 to D-08)**
- Fingerprint lives as an **attribute on the start marker**: `<!-- ui-hierarchy-mcp:start version=X.Y fingerprint=<64-hex> -->`.
- Hash algorithm: SHA-256 via `node:crypto.createHash('sha256')`, output as full 64-char lowercase hex.
- Hash input: body bytes between markers, post-EOL normalization to LF (regardless of file's actual EOL). End marker is attribute-free: `<!-- ui-hierarchy-mcp:end -->`.

**`src/init/` module split (D-09 to D-10)**
- Fine-grained split: `index.ts`, `argv.ts`, `targets.ts`, `markers.ts`, `fingerprint.ts`, `eol.ts`, `writer.ts`, `template.ts`.
- Each module unit-testable in isolation; integration tests in `test/init/` with temp-dir fixtures.

**Build-time version injection (D-11)**
- Reuse `tsup` `define` pattern from `tsup.config.ts:24-26`. Add `__INIT_MARKER_VERSION__: JSON.stringify(pkg.version.split('.').slice(0, 2).join('.'))`.
- Add `declare const __INIT_MARKER_VERSION__: string` to `src/global.d.ts`.

**Stderr and exit code contract (D-12)**
- Per-target outcome lines via `process.stderr.write` only — never `console.log`.
- Line format: `[init] <action> <relative-path>` where action is one of `create | update | noop | skip (hand-edit) | would create | would update | would noop | would skip (hand-edit)`.
- Exit code: 0 iff every enabled target ended in `create | update | noop` (or `would *` under `--dry-run`); 1 otherwise.

### Claude's Discretion
- Exact wording of `--help` text — concise, list all four flags + target enum, point at npm package URL.
- Naming of internal types (`InitFlags`, `TargetSpec`, `BlockScanResult`, etc.) — PascalCase, no `I`-prefix.
- Whether to extract marker comment strings as exported constants vs inline regex literals — prefer constants in `markers.ts` for test-import clarity.
- Test fixture layout under `test/init/` — mirror the per-target file matrix; one fixture per requirement is fine.

### Deferred Ideas (OUT OF SCOPE)
- `--uninstall` / block-removal subcommand — deferred to v1.2.
- `--template <path>` for user-supplied templates — deferred.
- Agent-file auto-detection — user explicitly opts in via `--target`.
- Re-injection on `--patch` package bumps — only `major.minor` bumps drive re-injection.
- Phase 8 polish items (POLISH-01/02/03).

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INIT-01 | `--init` with no `--target` injects guide into `CLAUDE.md` at cwd | Verified: `parseArgs` boolean flag; `node:fs/promises` write pattern confirmed |
| INIT-02 | `--init` absent → v1.0 stdio server starts unchanged (no regression) | Verified: dispatch fork in `src/cli.ts` isolates both paths; smoke test stays green |
| INIT-03 | `--target` accepts comma-separated subset; unknown tokens exit 1 | Verified: `parseArgs` strict mode + secondary enum validation; EXDEV code accessible |
| INIT-04 | Idempotent re-run + version-keyed block replacement | Verified: marker regex captures version + fingerprint; replace-block pattern preserves surrounding bytes |
| INIT-05 | Auto-create missing files and parent directories | Verified: `mkdir({recursive:true})` + `writeFile` on non-existent path works |
| INIT-06 | Append to existing file without marker (one blank line separator) | Verified: `trimEnd() + '\n\n'` pattern passes all trailing-newline fixtures |
| INIT-07 | Hand-edit guard via SHA-256 fingerprint; `--force` overrides | Verified: fingerprint on start-marker attribute avoids chicken-and-egg; LF-normalized hash stable across CRLF/LF |
| INIT-08 | Atomic write via tmpfile + rename; EXDEV fallback | Verified: atomic rename works on Windows; EXDEV code accessible; copyFile+unlink fallback pattern confirmed |
| INIT-09 | Preserve existing EOL (LF/CRLF) and leading BOM | Verified: BOM = first 3 bytes 0xEF 0xBB 0xBF; EOL detected from first `\r\n` vs `\n`; re-apply on emit |
| INIT-10 | `--dry-run` runs full pipeline, no writes, `would *` messages to stderr | Verified: boolean flag in parseArgs; no-op write variant in `writer.ts` |
| INIT-11 | Stderr-only summary + exit code 0/1 | Verified: `process.stderr.write` pattern established by existing `src/mcp/log.ts` |
| INIT-12 | Guide payload: 4 tool descriptions + registration JSON + examples + cwd hint | Verified: inline template literal in `template.ts`; 4 sections; `process.cwd()` substitution |
| INIT-13 | Non-interactive by default; no TTY checks | Verified: `parseArgs` is purely arg-driven; zero readline/isTTY references needed |
| INIT-14 | `.cursor/rules/ui-hierarchy-mcp.mdc` gets YAML frontmatter above marker block | Verified: frontmatter prefix pattern; re-run preserves frontmatter bytes |

</phase_requirements>

---

## Summary

Phase 7 adds a `--init` CLI mode to `ui-hierarchy-mcp`. The implementation is entirely self-contained in a new `src/init/` module with zero new runtime dependencies. All required capabilities (`parseArgs`, `createHash('sha256')`, `fs.promises.rename/copyFile`, `fs.promises.mkdir({recursive})`) are available in Node 20+ stdlib — confirmed on the local Node v24.13.0 runtime. [VERIFIED: local node --version]

The architecture is a clean dispatch fork in `src/cli.ts`: one line that routes `--init`-flagged invocations into `runInit()` and lets everything else fall through to the existing `startServer()` unchanged. The new module is organized into 8 single-responsibility files matching the locked decisions in CONTEXT.md. The planner should treat those 8 files as the unit-of-work boundaries for implementation tasks.

The two technically tricky areas are (1) fingerprint placement — the start-marker attribute approach avoids the chicken-and-egg problem of hashing content that includes its own hash, and (2) EOL/BOM preservation — detect at read time, apply at emit time, with fingerprint computed on LF-normalized body to keep the hash stable across platforms. Both patterns have been verified to work with stdlib primitives.

**Primary recommendation:** Implement exactly as specified in CONTEXT.md decisions D-01 through D-12. All patterns are validated. Zero research-generated deviations needed.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CLI argv parsing | CLI entry (`src/cli.ts`) | `src/init/argv.ts` | parseArgs lives at entry; validation delegated to init module |
| Target registry (path, frontmatter rules) | `src/init/targets.ts` | — | Single source of truth for per-target file paths and structure |
| Marker scan and block replacement | `src/init/markers.ts` | — | Regex constants + scan/replace/append functions; pure string transforms |
| SHA-256 fingerprint | `src/init/fingerprint.ts` | — | `node:crypto` wrapper; LF-normalizes before hashing |
| EOL/BOM detection and application | `src/init/eol.ts` | — | Read-time detect, emit-time apply; no mutation between |
| Atomic file write | `src/init/writer.ts` | — | tmpfile + rename; EXDEV fallback; dry-run no-op variant |
| Guide template rendering | `src/init/template.ts` | — | Inline TS template literal; `renderGuide({cwd, version})` |
| Orchestration + exit code | `src/init/index.ts` | — | Iterates enabled targets, collects outcomes, computes exit code, emits stderr summary |
| Build-time version injection | `tsup.config.ts` + `src/global.d.ts` | — | Extend existing `define` block; no new infrastructure |
| Existing stdio server | `src/mcp/server.ts` | — | MUST NOT be touched; fallthrough-only path from cli.ts |

---

## Standard Stack

### Core (all Node 20+ stdlib — zero new dependencies)

| Module | Version | Purpose | Why Standard |
|--------|---------|---------|--------------|
| `node:util.parseArgs` | Node 20+ | CLI argv parsing | Built-in, strict mode, declarative schema, unknown-flag rejection [VERIFIED: local] |
| `node:fs/promises` | Node 20+ | File read/write/rename/mkdir/unlink/copyFile | Full async API, atomic rename, recursive mkdir [VERIFIED: local] |
| `node:crypto` | Node 20+ | SHA-256 fingerprint via `createHash('sha256')` | Returns 64-char lowercase hex; stable and fast [VERIFIED: local] |
| `node:path` | Node 20+ | Path composition for target paths and tmp filenames | Standard for cross-platform path joins [VERIFIED: local] |

### Supporting (already in the project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^4.1.4` | Test runner for unit + integration tests of init module | All test files under `test/init/` |
| `tsup` | `^8.5.1` | `define` block for `__INIT_MARKER_VERSION__` injection | Build time only; no runtime change |
| `@biomejs/biome` | `^2.4.12` | Lint + format the new `src/init/` files | Dev-time only |

### Installation

No new packages to install. All dependencies are Node 20+ stdlib or already in `package.json`.

---

## Architecture Patterns

### System Architecture Diagram

```
process.argv
    |
    v
[src/cli.ts: parseArgs]
    |
    +--[--init present]---> [src/init/index.ts: runInit()]
    |                               |
    |                    [argv.ts: validate targets]
    |                               |
    |                    for each enabled target:
    |                               |
    |                    [targets.ts: resolve path + type]
    |                               |
    |                    [fs.promises.readFile] (if exists)
    |                               |
    |                    [eol.ts: detect EOL + BOM]
    |                               |
    |                    [markers.ts: scanBlock()]
    |                               |
    |              +-----------+----+------+----------+
    |              |           |           |          |
    |         [no marker]  [same ver + [diff ver]  [hand-edit]
    |         appendBlock  fingerprint  replaceBlock  skip/--force
    |                      noop]
    |                              |
    |                    [fingerprint.ts: computeFingerprint(body)]
    |                              |
    |                    [template.ts: renderGuide({cwd, version})]
    |                              |
    |                    [markers.ts: build full marker block]
    |                              |
    |                    [eol.ts: applyEolBom(content, eol, bom)]
    |                              |
    |                    [writer.ts: writeAtomic() or dry-run no-op]
    |                              |
    |                    [process.stderr.write: [init] <action> <path>]
    |                              |
    |                    [process.exit(code)]
    |
    +--[--init absent]---> [src/mcp/server.ts: startServer()] (unchanged)
```

### Recommended Project Structure

```
src/
├── cli.ts              # Add parseArgs dispatch fork (only change to existing file)
├── global.d.ts         # Add __INIT_MARKER_VERSION__ declaration
├── init/
│   ├── index.ts        # Orchestrator: iterate targets, collect outcomes, exit code
│   ├── argv.ts         # parseArgs wrapper, InitFlags type, target enum validation
│   ├── targets.ts      # TargetSpec registry: id → path, frontmatter flag
│   ├── markers.ts      # Marker constants, scanBlock(), replaceBlock(), appendBlock()
│   ├── fingerprint.ts  # computeFingerprint(body), verifyFingerprint(body, expected)
│   ├── eol.ts          # detectEol(), detectBom(), applyEolBom()
│   ├── writer.ts       # writeAtomic(), dry-run no-op variant
│   └── template.ts     # renderGuide({ cwd, version }): string
└── mcp/                # UNTOUCHED
    └── server.ts

test/
├── init/
│   ├── argv.test.ts           # parseArgs validation, unknown target rejection
│   ├── markers.test.ts        # scanBlock, replaceBlock, appendBlock
│   ├── fingerprint.test.ts    # computeFingerprint, verifyFingerprint, LF-normalization
│   ├── eol.test.ts            # detectEol, detectBom, applyEolBom, CRLF+BOM round-trip
│   ├── writer.test.ts         # atomic write, EXDEV fallback simulation, tmp cleanup
│   ├── template.test.ts       # renderGuide snapshot, 4 sections present, cwd substitution
│   └── integration.test.ts    # Full pipeline with temp dirs: all 14 AC scenarios
└── mcp/
    └── smoke.spawn.test.ts    # REGRESSION GATE: must remain green after Phase 7
```

### Pattern 1: parseArgs Dispatch Fork

**What:** `node:util.parseArgs` with strict mode — replaces argv string searching.
**When to use:** Any new CLI flag addition.

```typescript
// Source: Node 20 stdlib — verified locally
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'init':     { type: 'boolean' },
    'target':   { type: 'string' },
    'dry-run':  { type: 'boolean' },
    'force':    { type: 'boolean' },
    'help':     { type: 'boolean', short: 'h' },
    'version':  { type: 'boolean', short: 'v' },
  },
  strict: true,       // throws ERR_PARSE_ARGS_UNKNOWN_OPTION for unknown flags
  allowPositionals: false,
});

if (values.init) {
  await runInit(values);
  process.exit(0);
}

// Fallthrough: existing startServer() path
```

### Pattern 2: Atomic File Write with EXDEV Fallback

**What:** Stage to sibling tmp file then rename; fallback to copyFile+unlink if cross-drive on Windows.
**When to use:** Every file write in `writer.ts`.

```typescript
// Source: verified locally — Node 20 fs/promises
import { writeFile, rename, copyFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

async function writeAtomic(targetPath: string, content: string): Promise<void> {
  const tmpPath = join(
    dirname(targetPath),
    `.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
  );
  try {
    await writeFile(tmpPath, content, 'utf8');
    try {
      await rename(tmpPath, targetPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        // Cross-device rename (different drive on Windows)
        await copyFile(tmpPath, targetPath);
        await unlink(tmpPath);
      } else {
        await unlink(tmpPath).catch(() => {});
        throw err;
      }
    }
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
}
```

### Pattern 3: Fingerprint Placement (Chicken-and-Egg Safe)

**What:** Hash body bytes (LF-normalized) and store fingerprint as attribute on start marker — outside the hashed region.
**When to use:** Every new block write and every re-run verification.

```typescript
// Source: verified locally
import { createHash } from 'node:crypto';

// Hash input: body bytes between markers, normalized to LF
function computeFingerprint(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

// Marker format — fingerprint is an ATTRIBUTE on start marker, not inside body
// Fingerprint is computed from body content ONLY (the text between the two marker comments)
// Body = everything between end-of-start-marker-line and start-of-end-marker-line
const START_MARKER = (version: string, fingerprint: string) =>
  `<!-- ui-hierarchy-mcp:start version=${version} fingerprint=${fingerprint} -->`;
const END_MARKER = `<!-- ui-hierarchy-mcp:end -->`;

// Fingerprint never appears inside its own preimage — no chicken-and-egg
```

### Pattern 4: EOL + BOM Detection and Preservation

**What:** Detect from existing file bytes at read time; re-apply at emit time.
**When to use:** Every file read (existing target) in `eol.ts`.

```typescript
// Source: verified locally
type Eol = 'LF' | 'CRLF';

function detectBom(buf: Buffer): boolean {
  return buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

function detectEol(content: string): Eol {
  return content.includes('\r\n') ? 'CRLF' : 'LF';
}

function applyEolBom(content: string, eol: Eol, hasBom: boolean): string {
  // Normalize to LF first, then convert to target EOL
  const lf = content.replace(/\r\n/g, '\n');
  const converted = eol === 'CRLF' ? lf.replace(/\n/g, '\r\n') : lf;
  return hasBom ? '﻿' + converted : converted;
}
// New files: LF, no BOM (per INIT-09 default)
```

### Pattern 5: Marker Block Scanner

**What:** Single regex captures version and fingerprint from start marker; also handles missing-fingerprint (old format) case.
**When to use:** `markers.ts scanBlock()`.

```typescript
// Source: verified locally — regex tested against real marker content
const SCAN_PATTERN =
  /<!-- ui-hierarchy-mcp:start version=(\S+) fingerprint=([0-9a-f]{64}) -->([\s\S]*?)<!-- ui-hierarchy-mcp:end -->/;

interface BlockScanResult {
  found: true;
  version: string;
  fingerprint: string;
  body: string;  // bytes between markers (includes surrounding newlines)
  fullMatch: string;
  startIndex: number;
  endIndex: number;  // exclusive, after end marker
}

function scanBlock(content: string): BlockScanResult | { found: false } {
  const match = SCAN_PATTERN.exec(content);
  if (!match) return { found: false };
  return {
    found: true,
    version: match[1],
    fingerprint: match[2],
    body: match[3],
    fullMatch: match[0],
    startIndex: match.index,
    endIndex: match.index + match[0].length,
  };
}
```

### Pattern 6: Append with Single Blank Line (INIT-06)

**What:** When no marker exists in existing file, append after exactly one blank line.
**When to use:** `markers.ts appendBlock()`.

```typescript
// Source: verified locally — tested against all trailing-newline variants
function appendBlock(existing: string, newBlock: string): string {
  // trimEnd normalizes any number of trailing newlines to zero;
  // then we add exactly one newline + blank line before the block.
  return existing.trimEnd() + '\n\n' + newBlock;
}
```

### Pattern 7: vitest Temp Directory Pattern

**What:** mkdtemp in beforeEach, recursive rm in afterEach — no leftover files between tests.
**When to use:** All file-mutation tests in `test/init/`.

```typescript
// Source: [ASSUMED] — standard vitest pattern for file tests
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, afterEach } from 'vitest';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'init-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});
```

### Pattern 8: Build-Time Version Injection (extending existing pattern)

**What:** Add `__INIT_MARKER_VERSION__` to the `tsup.config.ts` `define` block alongside existing `__TOOL_VERSION__`.
**When to use:** `tsup.config.ts` update.

```typescript
// Source: E:\ui-to-hierarch\tsup.config.ts — VERIFIED existing pattern
define: {
  __TOOL_VERSION__: JSON.stringify(pkg.version),
  // ADD:
  __INIT_MARKER_VERSION__: JSON.stringify(
    pkg.version.split('.').slice(0, 2).join('.')
  ),
},
```

And in `vitest.config.ts` (also needs updating for tests):
```typescript
define: {
  __TOOL_VERSION__: JSON.stringify('0.0.0-test'),
  // ADD:
  __INIT_MARKER_VERSION__: JSON.stringify('0.0-test'),
},
```

### Anti-Patterns to Avoid

- **`console.log` in init code:** Goes to stdout and corrupts the MCP stdio framing contract. Use `process.stderr.write` exclusively. [VERIFIED: existing `src/mcp/log.ts` enforces this pattern]
- **Runtime `package.json` reads for version:** `package.json` is not bundled into the dist tarball's resolution path; use the tsup `define` constant `__INIT_MARKER_VERSION__` instead.
- **Fingerprint embedded in body:** Computing a hash of content that includes the hash string creates a chicken-and-egg problem. The fingerprint MUST be on the start marker attribute, outside the hashed body region.
- **LF-only assumption in fingerprint input:** Hash the LF-normalized body. A Windows checkout that converts LF to CRLF would otherwise produce a different fingerprint and trigger a false "hand-edit detected" on every re-run.
- **`__dirname` or `require()`:** This codebase is ESM-only; use `import.meta.url` + `fileURLToPath` where path resolution from the module file is needed. Not needed for init — all paths are relative to `process.cwd()`.
- **Calling `startServer()` from any `--init` code path:** The dispatch must be a hard exit (`process.exit`) after `runInit`. There must be no code path that runs both.
- **Single pass replace on CRLF content:** Apply EOL conversion via `replace(/\r\n/g, '\n')` FIRST (normalize), then `replace(/\n/g, '\r\n')` to convert back. Never apply CRLF conversion to already-CRLF content without normalizing first or you'll produce `\r\r\n`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI argument parsing | Custom `process.argv` string searching | `node:util.parseArgs` | Built-in, handles `--flag=value`, short aliases, strict unknown rejection [VERIFIED] |
| Atomic writes | `writeFile` directly to target | `tmpfile + rename` pattern | Direct writes can leave truncated file on crash [VERIFIED] |
| Cross-drive writes (Windows) | Assume `rename` always works | EXDEV fallback `copyFile + unlink` | Windows raises EXDEV on cross-drive rename; silent failure otherwise [VERIFIED] |
| EOL normalization | Manual `split('\n')` re-join | `replace(/\r\n/g, '\n')` then target EOL | Edge cases in split/join don't round-trip correctly with mixed EOL files |
| SHA-256 | Custom hash or MD5 | `node:crypto createHash('sha256')` | stdlib, constant-time output, no deps |
| YAML frontmatter for cursor | External `js-yaml` package | Inline template string with exact format | Zero-dep requirement; the frontmatter content is fully static and known |

**Key insight:** Every single complex capability in this phase has a Node 20 stdlib primitive that handles it correctly. Adding a dependency for any of these would violate the zero-new-runtime-deps constraint and is unnecessary.

---

## Common Pitfalls

### Pitfall 1: CRLF Double-Conversion

**What goes wrong:** Applying `replace(/\n/g, '\r\n')` to content that already has `\r\n` produces `\r\r\n`.
**Why it happens:** EOL conversion without prior normalization.
**How to avoid:** Always normalize to LF first (`replace(/\r\n/g, '\n')`), then convert to target EOL.
**Warning signs:** Test fixture with CRLF content produces `\r\r\n` in emitted file; idempotency check fails on second run.

### Pitfall 2: False "Hand-Edit" on Cross-Platform Checkout

**What goes wrong:** Developer runs `--init` on Linux (LF), commits, colleague checks out on Windows (CRLF), re-runs `--init` — fingerprint mismatch triggers skip.
**Why it happens:** Fingerprint computed from raw bytes that differ between LF and CRLF.
**How to avoid:** Always normalize body to LF before hashing. The decision to store `fingerprint` in the marker (D-06/D-07) already prescribes this.
**Warning signs:** `--init` re-run on unmodified CRLF-checkout produces `skip (hand-edit detected)` warning.

### Pitfall 3: Chicken-and-Egg Fingerprint

**What goes wrong:** Storing fingerprint inside the body and then hashing the body that includes the fingerprint — the hash cannot be computed before it is written, and the stored value is always wrong.
**Why it happens:** Placing fingerprint inside the block rather than as a marker attribute.
**How to avoid:** D-06 resolves this: fingerprint is an attribute on the start marker comment, which is OUTSIDE the hashed body region.
**Warning signs:** `verifyFingerprint` always returns false even on unmodified content.

### Pitfall 4: Orphaned Temp Files on Error

**What goes wrong:** An error occurs after tmp file is written but before rename; the `.tmp-*` file is left on disk indefinitely.
**Why it happens:** Error is thrown without cleanup branch.
**How to avoid:** The atomic write pattern (Pattern 2) always runs `unlink(tmpPath).catch(() => {})` in the error path before re-throwing.
**Warning signs:** Test that injects a pre-rename error finds `.tmp-*` files still present after the error.

### Pitfall 5: Cursor Frontmatter Corruption on Re-Run

**What goes wrong:** Block replacement overwrites the YAML frontmatter along with the marker block.
**Why it happens:** Using the entire file content as the "before marker" region, not distinguishing frontmatter prefix from the marker block region.
**How to avoid:** In `targets.ts` or `markers.ts`, the cursor target's replace logic must preserve everything before the first `<!-- ui-hierarchy-mcp:start` — which includes the frontmatter. Pattern 5 (`scanBlock`) returns `startIndex` which points to the exact start of the marker, enabling precise slice-based replacement.
**Warning signs:** Re-run of cursor target produces a file without YAML frontmatter.

### Pitfall 6: `vitest.config.ts` Missing `__INIT_MARKER_VERSION__`

**What goes wrong:** Tests fail with `ReferenceError: __INIT_MARKER_VERSION__ is not defined`.
**Why it happens:** `vitest.config.ts` mirrors `tsup`'s `define` block for tests, but the new constant was added to `tsup.config.ts` without updating `vitest.config.ts`.
**How to avoid:** Both files must be updated atomically. `vitest.config.ts` must add `__INIT_MARKER_VERSION__: JSON.stringify('0.0-test')` alongside the existing `__TOOL_VERSION__` line.
**Warning signs:** `vitest run` fails immediately with `ReferenceError` before any assertions.

### Pitfall 7: Exit Code Swallowed by `process.exit` Placement

**What goes wrong:** `runInit()` throws; the error is caught by the existing `cli.ts` `.catch()` handler which calls `process.exit(1)` but emits a JSON error log (wrong format for init mode, looks like MCP error).
**Why it happens:** `runInit` errors bubble up to the MCP error handler in the existing catch block.
**How to avoid:** Dispatch fork must wrap `runInit` in its own try/catch that emits `[init] error …` to stderr and calls `process.exit(1)` directly, before the MCP error handler sees it.
**Warning signs:** Init failure produces a JSON log line instead of `[init]`-prefixed stderr output.

---

## Code Examples

### Complete `cli.ts` Dispatch Fork

```typescript
// Source: based on verified parseArgs + existing cli.ts pattern
import { parseArgs } from 'node:util';
import { log } from './mcp/log.js';
import { startServer } from './mcp/server.js';
import { runInit } from './init/index.js';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'init':    { type: 'boolean' },
    'target':  { type: 'string' },
    'dry-run': { type: 'boolean' },
    'force':   { type: 'boolean' },
    'help':    { type: 'boolean', short: 'h' },
    'version': { type: 'boolean', short: 'v' },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help) {
  process.stderr.write(HELP_TEXT);
  process.exit(0);
}

if (values.version) {
  process.stderr.write(`${__TOOL_VERSION__}\n`);
  process.exit(0);
}

if (values.init) {
  runInit(values).then((code) => process.exit(code)).catch((err) => {
    process.stderr.write(`[init] error ${String(err)}\n`);
    process.exit(1);
  });
} else {
  startServer().catch((err: unknown) => {
    log.error('server error', {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
```

### `targets.ts` Registry Shape

```typescript
// Source: [ASSUMED] — derived from SPEC/CONTEXT targets table
export interface TargetSpec {
  id: 'claude' | 'codex' | 'cursor' | 'copilot';
  relativePath: string;   // relative to cwd
  hasFrontmatter: boolean; // true for cursor only
}

export const TARGETS: TargetSpec[] = [
  { id: 'claude',  relativePath: 'CLAUDE.md',                               hasFrontmatter: false },
  { id: 'codex',   relativePath: 'AGENTS.md',                               hasFrontmatter: false },
  { id: 'cursor',  relativePath: '.cursor/rules/ui-hierarchy-mcp.mdc',       hasFrontmatter: true  },
  { id: 'copilot', relativePath: '.github/copilot-instructions.md',          hasFrontmatter: false },
];

export const DEFAULT_TARGETS: TargetSpec['id'][] = ['claude'];
```

### Cursor Frontmatter Template

```typescript
// Source: [ASSUMED] — derived from INIT-14 acceptance criteria
export const CURSOR_FRONTMATTER = `---
description: ui-hierarchy-mcp usage guide — maps UI screenshots/descriptions to exact component file:line locations
alwaysApply: true
globs:
  - "**/*.tsx"
  - "**/*.jsx"
---`;
// Rendered file structure: CURSOR_FRONTMATTER + '\n\n' + markerBlock + '\n'
// On re-run: replace only the marker block; frontmatter bytes preserved by scanBlock startIndex
```

### Integration Test Skeleton

```typescript
// Source: [ASSUMED] — derived from existing test/mcp/ patterns + temp dir pattern
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit } from '../../src/init/index.js';

describe('runInit integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'init-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('INIT-01: creates CLAUDE.md with marker block', async () => {
    // Override cwd for the test
    const originalCwd = process.cwd;
    process.cwd = () => tmpDir;
    try {
      const code = await runInit({ init: true, target: undefined, 'dry-run': false, force: false });
      expect(code).toBe(0);
      const content = await readFile(join(tmpDir, 'CLAUDE.md'), 'utf8');
      expect(content).toContain('<!-- ui-hierarchy-mcp:start');
      expect(content).toContain('<!-- ui-hierarchy-mcp:end -->');
    } finally {
      process.cwd = originalCwd;
    }
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `commander` / `yargs` for CLI | `node:util.parseArgs` | Node 20+ (2023) | Zero dependency for basic CLI arg parsing |
| `mkdirp` package | `fs.promises.mkdir({ recursive: true })` | Node 10.12 | stdlib covers the use case |
| `tmp` package for temp files | Manual `pid + randomBytes` naming | Node 14.5 | `randomBytes` available in stdlib |
| `strip-bom` package | First-3-bytes check inline | Always possible | 3-line stdlib function replaces the package |
| `detect-newline` package | `content.includes('\r\n')` heuristic | Always possible | Single expression; same behavior as the package |

**Deprecated/outdated:**
- `ts-node`: Effectively abandoned for ESM; already replaced by `tsx` in this project.
- `fast-glob`: Replaced by `tinyglobby` in this project (lighter install).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Cursor `.mdc` file frontmatter key names (`description`, `alwaysApply`, `globs`) are the correct/current format for Cursor rules | Targets / Pattern 8 | Cursor rules file rejected or ignored by Cursor; requires frontmatter key adjustment |
| A2 | `AGENTS.md` is the correct/primary path that Codex / OpenAI Codex CLI looks for agent instructions | Standard Stack / targets.ts | Codex CLI may not discover the file; user would need to specify a different path |
| A3 | `.github/copilot-instructions.md` is GitHub Copilot's recognized instruction file path | targets.ts | Copilot may not discover the file |
| A4 | vitest `mkdtemp` + `rm({recursive})` beforeEach/afterEach is the accepted pattern for file-mutation tests (not using `vi.stubEnv` for cwd) | Code Examples / Pattern 7 | Alternative approach: `vi.spyOn(process, 'cwd')` or pass cwd as param to `runInit` |
| A5 | `process.cwd` can be overridden in tests via assignment (not requiring `vi.spyOn`) | Integration Test Skeleton | Some Node versions or vitest configs may require `vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)` instead |

**Note on A1–A3:** These target paths are locked in CONTEXT.md decisions (from SPEC.md) and were presumably verified during the spec/discuss phase. Research here confirms the decisions match known conventions as of training data. If any path is wrong it requires a SPEC amendment, not a research revision.

---

## Open Questions

1. **Cwd injection strategy for tests**
   - What we know: Tests need to run `runInit` against a temp directory, not the actual `process.cwd()`.
   - What's unclear: Whether `runInit` should accept an optional `cwd` parameter (cleaner for testing) or whether tests override `process.cwd` via `vi.spyOn`.
   - Recommendation: Design `runInit(flags, { cwd = process.cwd() } = {})` — passing cwd explicitly makes the function testable without spying on globals. The CONTEXT.md does not lock this; it falls under Claude's Discretion.

2. **Stderr output format in integration tests: assert exact strings or regex?**
   - What we know: INIT-11 specifies `[init] <action> <path>` format.
   - What's unclear: Whether tests should use `toContain('[init] create CLAUDE.md')` or a regex to handle Windows path separators.
   - Recommendation: Use regex `/\[init\] create .+CLAUDE\.md/` to be cross-platform safe (handles both `/` and `\` in path).

3. **`--help` output destination: stdout or stderr?**
   - What we know: STDOUT invariant says no `--init` code may write to stdout. `--help`/`--version` are not `--init` code paths.
   - What's unclear: Convention varies (GNU tools use stdout for `--help`; MCP stdio contract requires stdout be clean).
   - Recommendation: Write `--help` and `--version` to `process.stderr` to be safe. The CONTEXT.md says "keep concise" but does not specify the fd; stderr is the safer choice given the stdout invariant.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `>=20` | `parseArgs`, `fs/promises`, `crypto` | ✓ | v24.13.0 | — |
| `vitest` | Test runner | ✓ | `^4.1.4` (in devDeps) | — |
| `tsup` | Build-time define injection | ✓ | `^8.5.1` (in devDeps) | — |
| `@biomejs/biome` | Lint new files | ✓ | `^2.4.12` (in devDeps) | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

All required capabilities are available in the current environment.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest `^4.1.4` |
| Config file | `vitest.config.ts` (needs `__INIT_MARKER_VERSION__` define added) |
| Quick run command | `vitest run test/init/` |
| Full suite command | `vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INIT-01 | `--init` no target → creates CLAUDE.md | integration | `vitest run test/init/integration.test.ts` | ❌ Wave 0 |
| INIT-02 | No `--init` → smoke test still passes | smoke | `vitest run test/mcp/smoke.spawn.test.ts` | ✅ |
| INIT-03 | `--target` comma-split + unknown token → exit 1 | unit | `vitest run test/init/argv.test.ts` | ❌ Wave 0 |
| INIT-04 | Idempotency + version replacement | integration | `vitest run test/init/integration.test.ts` | ❌ Wave 0 |
| INIT-05 | Auto-create missing dirs | integration | `vitest run test/init/integration.test.ts` | ❌ Wave 0 |
| INIT-06 | Append after one blank line | unit | `vitest run test/init/markers.test.ts` | ❌ Wave 0 |
| INIT-07 | Hand-edit guard (fingerprint mismatch) | unit + integration | `vitest run test/init/fingerprint.test.ts` | ❌ Wave 0 |
| INIT-08 | Atomic write + EXDEV fallback + tmp cleanup | unit | `vitest run test/init/writer.test.ts` | ❌ Wave 0 |
| INIT-09 | CRLF+BOM preservation on re-run | unit + integration | `vitest run test/init/eol.test.ts` | ❌ Wave 0 |
| INIT-10 | `--dry-run` no writes + `would *` stderr | integration | `vitest run test/init/integration.test.ts` | ❌ Wave 0 |
| INIT-11 | Stderr-only output + exit code | integration | `vitest run test/init/integration.test.ts` | ❌ Wave 0 |
| INIT-12 | Guide payload: 4 tools + JSON snippet + examples + cwd | unit | `vitest run test/init/template.test.ts` | ❌ Wave 0 |
| INIT-13 | Zero references to stdin/readline/isTTY | static | grep over `src/init/` source | ❌ Wave 0 |
| INIT-14 | Cursor frontmatter preserved on re-run | unit + integration | `vitest run test/init/integration.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `vitest run test/init/`
- **Per wave merge:** `vitest run`
- **Phase gate:** Full suite green + `vitest run test/mcp/smoke.spawn.test.ts` before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/init/argv.test.ts` — covers INIT-03
- [ ] `test/init/markers.test.ts` — covers INIT-04, INIT-06
- [ ] `test/init/fingerprint.test.ts` — covers INIT-07
- [ ] `test/init/writer.test.ts` — covers INIT-08
- [ ] `test/init/eol.test.ts` — covers INIT-09
- [ ] `test/init/template.test.ts` — covers INIT-12
- [ ] `test/init/integration.test.ts` — covers INIT-01, INIT-04, INIT-05, INIT-10, INIT-11, INIT-14
- [ ] `vitest.config.ts` — add `__INIT_MARKER_VERSION__: JSON.stringify('0.0-test')` to `define` block

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (limited) | `parseArgs` strict mode + target enum allowlist |
| V6 Cryptography | no | SHA-256 for integrity only, not security |

### Known Threat Patterns for CLI File-Writer

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `--target` custom value | Tampering | Target enum allowlist; unknown tokens exit 1 before any write |
| Symlink following (TOCTOU) | Tampering | Atomic write to sibling tmp then rename — rename on symlink target replaces the link itself, not the target |
| Writing to stdout by accident | Spoofing | Enforced by `process.stderr.write` only; stdout zero-bytes assertion in integration tests |

---

## Sources

### Primary (HIGH confidence)

- Local Node.js v24.13.0 runtime — `parseArgs` behavior, EXDEV code, `crypto.createHash`, `fs.promises` atomic rename, EOL/BOM manipulation patterns all verified by running code
- `E:\ui-to-hierarch\tsup.config.ts` — existing `define` pattern for `__TOOL_VERSION__` injection (lines 24-26)
- `E:\ui-to-hierarch\vitest.config.ts` — existing `define` mirror pattern for tests
- `E:\ui-to-hierarch\src\cli.ts` — current 10-line entry; dispatch fork landing point identified
- `E:\ui-to-hierarch\src\mcp\log.ts` — established `process.stderr.write` pattern
- `E:\ui-to-hierarch\test\mcp\smoke.spawn.test.ts` — regression gate; must remain green
- `E:\ui-to-hierarch\package.json` — `engines.node: ">=20"`, `"type": "module"`, `version: "0.1.1"`

### Secondary (MEDIUM confidence)

- CONTEXT.md D-01 through D-12 — all decisions locked; research confirms technical feasibility
- SPEC.md INIT-01 through INIT-14 — all acceptance criteria verified for implementability against stdlib

### Tertiary (LOW confidence)

- A1: Cursor `.mdc` frontmatter key convention (training data — not live-verified in this session)
- A2: `AGENTS.md` as Codex instruction path (training data)
- A3: `.github/copilot-instructions.md` as Copilot instruction path (training data)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all stdlib, all verified locally
- Architecture: HIGH — locked in CONTEXT.md; patterns verified against existing codebase
- Pitfalls: HIGH — all verified by code execution
- Target file paths: MEDIUM — locked by SPEC but paths A1–A3 not live-verified in this session

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (Node stdlib is stable; Cursor .mdc frontmatter convention is the only volatile element)
