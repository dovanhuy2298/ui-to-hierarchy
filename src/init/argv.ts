/**
 * `--init` argv parser (Phase 7, plan 01).
 *
 * Pure function: no side effects of any kind. Returns a
 * discriminated-union result that the caller (`src/cli.ts`) dispatches
 * into an exit code + log message.
 *
 * Mitigates T-07-01 (Tampering, `--target` argv value): we run Node's
 * `parseArgs` in strict mode for unknown-flag rejection and apply a
 * secondary enum check against `VALID_TARGET_IDS` before downstream
 * file writes can run (INIT-03).
 *
 * INIT-13 compliance: `--init` is fully argv-driven — no interactive
 * input mechanisms are imported or referenced anywhere in this module.
 */

import { parseArgs } from "node:util";

import {
  DEFAULT_TARGET_IDS,
  VALID_TARGET_IDS,
  type TargetId,
} from "./targets.js";

/** Normalized flag bag returned to the orchestrator. */
export interface InitFlags {
  targets: TargetId[];
  dryRun: boolean;
  force: boolean;
}

/**
 * Discriminated-union return shape (copy of the pattern in
 * `src/mcp/errors.ts` — internal validation never throws).
 */
export type ParseArgsResult =
  | { ok: true; flags: InitFlags }
  | { ok: false; message: string };

/**
 * Parse and validate `--init` argv. Treats the input as the post-`slice(2)`
 * tail (the caller passes `process.argv.slice(2)` or a test fixture).
 *
 * Returns `{ok:false, message}` on any of:
 *  - unknown flag (strict-mode rejection from `node:util` parseArgs)
 *  - unknown `--target` token (secondary enum check)
 *  - any unexpected throw from parseArgs (coerced via Error/String fallback)
 */
export function parseInitArgs(argv: string[]): ParseArgsResult {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        init: { type: "boolean" },
        target: { type: "string" },
        "dry-run": { type: "boolean" },
        force: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      strict: true,
      allowPositionals: false,
    });

    // `--target` is a single comma-separated string; fall back to defaults
    // when absent. Preserve declared order so stderr logs and target loops
    // run deterministically (INIT-03).
    const rawTargets: string[] =
      typeof values.target === "string"
        ? values.target.split(",")
        : [...DEFAULT_TARGET_IDS];

    const invalid = rawTargets.filter(
      (t): t is string => !(VALID_TARGET_IDS as string[]).includes(t),
    );
    if (invalid.length > 0) {
      return {
        ok: false,
        message: `Unknown --target token(s): ${invalid.join(", ")}. Valid targets: ${VALID_TARGET_IDS.join(", ")}.`,
      };
    }

    return {
      ok: true,
      flags: {
        // Safe cast: every entry was just checked against VALID_TARGET_IDS.
        targets: rawTargets as TargetId[],
        dryRun: Boolean(values["dry-run"]),
        force: Boolean(values.force),
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
