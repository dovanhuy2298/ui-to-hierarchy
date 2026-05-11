/**
 * `runInit` — orchestrator composing the seven leaf modules of the
 * `--init` pipeline (Phase 7, Plan 04).
 *
 * Owns:
 *  - per-target dispatch (read existing → detect EOL/BOM → scan marker →
 *    decide action → render + assemble → write → emit stderr → tally outcome)
 *  - the cursor-target YAML frontmatter contract (INIT-14)
 *  - version-upgrade detection vs. fingerprint hand-edit guard policy (INIT-04/INIT-07)
 *  - stderr action vocabulary (D-12) and exit-code computation
 *
 * Does NOT:
 *  - parse argv (lives in `./argv.ts`)
 *  - terminate the process (Plan 05 / cli.ts owns process termination)
 *  - write to the JSON-RPC output stream (INIT-11 invariant — that stream
 *    is reserved for MCP framing)
 *  - read terminal/keyboard state (INIT-13 non-interactive contract — the
 *    module references no input-stream APIs anywhere)
 *
 * Fingerprint preimage contract (BLOCKER-driven invariant from revision 2):
 *
 * `body = renderGuide(...)` is the fingerprint preimage. The marker block
 * is assembled as
 *
 *     `<!-- ui-hierarchy-mcp:start version=X.Y fingerprint=<hex> -->\n${body}\n<!-- ui-hierarchy-mcp:end -->`
 *
 * and Plan 02's `BLOCK_PATTERN` consumes the two wrapping `\n` OUTSIDE its
 * body capture group. Therefore on round-trip read,
 * `scan.body === renderGuide(...)` byte-for-byte (after LF normalization),
 * and `verifyFingerprint(scan.body, stored_fingerprint)` returns true on
 * an unmodified file. Do NOT deviate from this assembly — it is the
 * entire idempotency story (INIT-04).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { InitFlags } from "./argv.js";
import { TARGETS, type TargetSpec } from "./targets.js";
import {
  MARKER_END,
  MARKER_START_PREFIX,
  appendBlock,
  replaceBlock,
  scanBlock,
} from "./markers.js";
import { computeFingerprint, verifyFingerprint } from "./fingerprint.js";
import { applyEolBom, detectBom, detectEol, type Eol } from "./eol.js";
import { writeAtomic, writeAtomicDryRun } from "./writer.js";
import { renderGuide } from "./template.js";

/**
 * Literal YAML frontmatter prepended ONLY to the cursor target on first
 * create (INIT-14). On subsequent updates the existing prefix bytes are
 * preserved automatically by `replaceBlock`'s slice arithmetic — no
 * special-case branching required (RESEARCH Pitfall 5).
 */
const CURSOR_FRONTMATTER =
  `---\ndescription: ui-hierarchy-mcp usage guide — maps UI screenshots/descriptions to exact component file:line locations\nalwaysApply: true\nglobs:\n  - "**/*.tsx"\n  - "**/*.jsx"\n---`;

/** Per-target outcome word (matches D-12 action vocabulary). */
type Outcome = "create" | "update" | "noop" | "skip" | "error";

/**
 * Compose `body` into the wire-format marker block. The two literal `\n`
 * around `${body}` are the SAME newlines that Plan 02's `BLOCK_PATTERN`
 * consumes OUTSIDE its body capture group — this is what makes `body`
 * the fingerprint preimage on round-trip read.
 */
function assembleMarkerBlock(body: string, fingerprint: string): string {
  return (
    `${MARKER_START_PREFIX} version=${__INIT_MARKER_VERSION__} fingerprint=${fingerprint} -->\n${body}\n${MARKER_END}`
  );
}

/**
 * Compute the human-readable stderr label for a given outcome under the
 * current dry-run mode. D-12 vocabulary: `create | update | noop |
 * skip (hand-edit)`, prefixed with `would ` under `--dry-run`.
 */
function actionLabel(outcome: Outcome, dryRun: boolean): string {
  // Only prefix mutating outcomes with "would " under --dry-run.
  // `skip` and `noop` are decided identically with or without --dry-run,
  // so "would skip (hand-edit)" reads as if the tool is considering
  // skipping when in fact the skip is unconditional (WR-03).
  if (outcome === "error") return "error";
  if (outcome === "skip") return "skip (hand-edit)";
  if (outcome === "noop") return "noop";
  return dryRun ? `would ${outcome}` : outcome;
}

interface TargetResult {
  outcome: Outcome;
  errorMessage?: string;
}

/**
 * Execute the per-target pipeline. Pure with respect to disk side effects
 * iff `flags.dryRun` is true.
 */
async function runTarget(
  target: TargetSpec,
  flags: InitFlags,
  cwd: string,
): Promise<TargetResult> {
  const absPath = join(cwd, target.relativePath);

  // 1. Read existing content (ENOENT → no file).
  let existingBuf: Buffer | null = null;
  let existingText: string | null = null;
  try {
    existingBuf = await readFile(absPath);
    existingText = existingBuf.toString("utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        outcome: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
    // ENOENT: existingBuf/existingText stay null → create path.
  }

  // 2. Detect EOL + BOM (new files default to LF + no BOM).
  let eol: Eol = "LF";
  let hasBom = false;
  if (existingBuf !== null && existingText !== null) {
    hasBom = detectBom(existingBuf);
    eol = detectEol(existingText);
    // Node's Buffer.toString("utf8") does NOT strip a leading UTF-8 BOM —
    // it surfaces as U+FEFF at index 0. If we leave it in `existingText`,
    // `applyEolBom(..., hasBom=true)` later prepends ANOTHER BOM,
    // producing "EF BB BF EF BB BF ..." on disk (CR-01).
    if (hasBom && existingText.charCodeAt(0) === 0xfeff) {
      existingText = existingText.slice(1);
    }
  }

  // 3. Render the body (fingerprint preimage).
  const body = renderGuide({ cwd, version: __INIT_MARKER_VERSION__ });
  const fingerprint = computeFingerprint(body);
  const markerBlock = assembleMarkerBlock(body, fingerprint);

  // 4. Decide action.
  let outcome: Outcome;
  let newContent: string | null = null;

  if (existingText === null) {
    // File does not exist → create from scratch.
    outcome = "create";
    const raw = target.hasFrontmatter
      ? `${CURSOR_FRONTMATTER}\n\n${markerBlock}\n`
      : `${markerBlock}\n`;
    newContent = applyEolBom(raw, eol, hasBom);
  } else {
    // LF-normalize the existing content for marker scanning so the regex
    // matches independent of the file's actual EOL flavor.
    const lfText = existingText.replace(/\r\n/g, "\n");
    const scan = scanBlock(lfText);

    if (!scan.found) {
      // File exists, no marker block → append.
      outcome = "create";
      // Trailing "\n" matches the create-from-scratch branch above and the
      // POSIX text-file convention (avoids "No newline at end of file" in
      // git diffs). Without it, the file ends with the literal `-->` of
      // MARKER_END (WR-02).
      const appended = appendBlock(lfText, markerBlock) + "\n";
      newContent = applyEolBom(appended, eol, hasBom);
    } else if (
      scan.version === __INIT_MARKER_VERSION__ &&
      verifyFingerprint(scan.body, scan.fingerprint)
    ) {
      // Version match AND fingerprint intact → idempotent no-op.
      outcome = "noop";
      newContent = null;
    } else if (
      !verifyFingerprint(scan.body, scan.fingerprint) &&
      !flags.force
    ) {
      // Fingerprint mismatch (hand-edit) and no --force → skip.
      outcome = "skip";
      newContent = null;
    } else {
      // Version mismatch OR --force → update in place.
      outcome = "update";
      const replaced = replaceBlock(lfText, markerBlock, scan);
      newContent = applyEolBom(replaced, eol, hasBom);
    }
  }

  // 5. Write (or simulate in dry-run). Only create/update touch the disk.
  if (newContent !== null) {
    const writer = flags.dryRun ? writeAtomicDryRun : writeAtomic;
    try {
      await writer(absPath, newContent);
    } catch (err) {
      return {
        outcome: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { outcome };
}

/**
 * Run the init pipeline across every enabled target.
 *
 * Returns:
 *  - `0` iff every enabled target ended in `create | update | noop`
 *    (or the `would *` equivalent under `--dry-run`).
 *  - `1` if any target ended in `skip (hand-edit)` (without `--force`)
 *    OR any per-target operation threw.
 *
 * Does not terminate the process; the caller (Plan 05 / cli.ts) is
 * responsible for translating the returned code into a process status.
 */
export async function runInit(
  flags: InitFlags,
  { cwd = process.cwd() }: { cwd?: string } = {},
): Promise<number> {
  // Resolve enabled targets in canonical TARGETS order for deterministic
  // stderr output regardless of the order the user passed via --target.
  const enabled = TARGETS.filter((t) => flags.targets.includes(t.id));

  let exitCode = 0;
  for (const target of enabled) {
    const result = await runTarget(target, flags, cwd);
    const label = actionLabel(result.outcome, flags.dryRun);
    if (result.outcome === "error") {
      process.stderr.write(
        `[init] error ${target.relativePath}: ${result.errorMessage ?? "unknown error"}\n`,
      );
      exitCode = 1;
    } else {
      process.stderr.write(`[init] ${label} ${target.relativePath}\n`);
      if (result.outcome === "skip") {
        exitCode = 1;
      }
    }
  }

  return exitCode;
}
