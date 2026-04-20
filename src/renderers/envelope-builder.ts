import { resolveRoot } from "../core/resolve-root.js";
import type { Envelope, TreeNode } from "../ir/index.js";

// Build-time define injected by tsup (see tsup.config.ts `define`).
// Under tsx / vitest the define is absent, so we guard with a typeof check and
// fall back to "0.0.0-dev". The ambient declaration keeps TS strict happy.
declare const __TOOL_VERSION__: string;

function getToolVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof __TOOL_VERSION__ !== "undefined") return __TOOL_VERSION__;
  } catch {
    // ReferenceError in dev (tsx/vitest) where the define hasn't replaced it.
  }
  return "0.0.0-dev";
}

/**
 * buildEnvelope — assembles an Envelope around a rendered tree (D-15, ARCH-03).
 *
 * Resolution order for resolvedRoot (D-21):
 *   1. opts.resolvedRootOverride
 *   2. resolveRoot() (which in turn checks explicit→env→cwd)
 *
 * toolVersion is the tsup-injected `__TOOL_VERSION__` in production bundles;
 * in dev/test (tsx, vitest without the define) it falls back to "0.0.0-dev".
 * `now` override allows deterministic test assertions on generatedAt.
 */
export function buildEnvelope(
  tree: TreeNode,
  opts?: { resolvedRootOverride?: string; now?: () => Date },
): Envelope {
  const now = opts?.now ?? (() => new Date());
  return {
    schemaVersion: "1",
    resolvedRoot: opts?.resolvedRootOverride ?? resolveRoot(),
    toolVersion: getToolVersion(),
    generatedAt: now().toISOString(),
    warnings: [],
    tree,
  };
}
