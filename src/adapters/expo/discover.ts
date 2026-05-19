/**
 * Expo Router filesystem discovery (Phase 12, ROUTE-01).
 *
 * Mirrors src/adapters/next/discover.ts but with REVERSED root priority:
 * Expo checks `src/app` FIRST, then `app` (D-08).
 *
 * Warning channel: detectDualRoots() returns booleans — it NEVER emits
 * console.* or mutates global state. The adapter wrapper (Wave 2,
 * ExpoRouterAdapter) calls detectDualRoots() and pushes warnings into
 * its instance-level pendingWarnings[].
 *
 * Groups like (tabs)/ are NOT ignored — they are routing groups that
 * participate in the file system scan (only transparent in URL building).
 */

import { access } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "tinyglobby";
import { toForwardSlash } from "../../core/paths.js";

/**
 * Locate the Expo Router app root.
 * Priority: src/app FIRST, then app/ (D-08 — reversed from Next.js).
 * Returns null when neither directory exists.
 */
export async function resolveExpoRoot(absRoot: string): Promise<string | null> {
  // src/app takes priority over app/ (D-08 — reversed from Next.js order)
  for (const candidate of [join(absRoot, "src", "app"), join(absRoot, "app")]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* not found */
    }
  }
  return null;
}

/**
 * Probe both root candidates independently.
 * Used by ExpoRouterAdapter (Wave 2) to detect dual-root situations and
 * push warnings into pendingWarnings[]. NEVER calls console.*.
 */
export async function detectDualRoots(
  absRoot: string,
): Promise<{ hasSrcApp: boolean; hasApp: boolean }> {
  let hasSrcApp = false;
  let hasApp = false;

  try {
    await access(join(absRoot, "src", "app"));
    hasSrcApp = true;
  } catch {
    /* not present */
  }

  try {
    await access(join(absRoot, "app"));
    hasApp = true;
  } catch {
    /* not present */
  }

  return { hasSrcApp, hasApp };
}

/**
 * Enumerate all routing-relevant source files under the Expo app root.
 * Returns lex-sorted forward-slash absolute paths.
 * Returns [] when neither app root exists.
 *
 * Ignore list: components/, hooks/, utils/, node_modules/.
 * Group folders like (tabs)/ are NOT ignored.
 */
export async function discoverEntries(absRoot: string): Promise<string[]> {
  const appRoot = await resolveExpoRoot(absRoot);
  if (!appRoot) return [];

  const matches = await glob(["**/*.{tsx,jsx,ts,js}"], {
    cwd: appRoot,
    absolute: true,
    ignore: [
      "**/components/**",
      "**/hooks/**",
      "**/utils/**",
      "**/node_modules/**",
    ],
    dot: false,
  });

  return matches
    .map(toForwardSlash)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
