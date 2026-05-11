/**
 * Target registry for `--init` file writers (Phase 7).
 *
 * Pure-data module: no imports, no side effects. Downstream consumers
 * (`src/init/argv.ts`, `src/init/index.ts`, future plans 02–05) import
 * `TARGETS`, `DEFAULT_TARGET_IDS`, and `VALID_TARGET_IDS` from here.
 *
 * Island convention: this file must not import from `src/core/`,
 * `src/ir/`, `src/renderers/`, or any other internal subsystem — it is
 * a leaf module that other Phase 7 modules depend on.
 */

/**
 * Canonical target identifiers locked by SPEC INIT-03 / INIT-14.
 */
export type TargetId = "claude" | "codex" | "cursor" | "copilot";

/**
 * One entry in the target registry.
 *
 * - `relativePath` — path from the project root where the marker block
 *   is written (forward-slash, POSIX-style; consumers join with `cwd`).
 * - `hasFrontmatter` — when `true`, the writer prepends a YAML
 *   frontmatter envelope before the marker block (only `.mdc` targets).
 */
export interface TargetSpec {
  id: TargetId;
  relativePath: string;
  hasFrontmatter: boolean;
}

/**
 * The four canonical init targets, in SPEC-locked order. Order matters
 * for stderr log determinism and for downstream snapshot tests.
 */
export const TARGETS: TargetSpec[] = [
  { id: "claude", relativePath: "CLAUDE.md", hasFrontmatter: false },
  { id: "codex", relativePath: "AGENTS.md", hasFrontmatter: false },
  {
    id: "cursor",
    relativePath: ".cursor/rules/ui-hierarchy-mcp.mdc",
    hasFrontmatter: true,
  },
  {
    id: "copilot",
    relativePath: ".github/copilot-instructions.md",
    hasFrontmatter: false,
  },
];

/**
 * Targets applied when the user omits `--target` on the command line.
 * Locked to a single Claude file per D-01.
 */
export const DEFAULT_TARGET_IDS: TargetId[] = ["claude"];

/**
 * Whitelist used by `parseInitArgs` to reject unknown `--target` tokens
 * (mitigation for T-07-01; INIT-03 acceptance criterion).
 */
export const VALID_TARGET_IDS: TargetId[] = TARGETS.map((t) => t.id);
