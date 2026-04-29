/**
 * NextJsAdapter.discoverEntries — Phase 4, SPEC R6.
 *
 * Enumerates App Router special files under `app/` (or `src/app/`) using
 * a single one-shot tinyglobby pass. Forward-slash normalized (D-08),
 * lex-sorted by explicit code-point comparator (Pitfall 4), private
 * folders excluded by glob `ignore` (D-09 single-source-of-truth).
 *
 * Also exports `resolveAppRoot` for plan 03's route-map.ts to reuse —
 * keeps the "app or src/app" probe in one place.
 */

import { access } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "tinyglobby";
import { toForwardSlash } from "../../core/paths.js";

const SPECIAL = "{page,layout,template,loading,error,not-found,default}";
const EXTS = "{tsx,jsx,ts,js}";

/**
 * Locate the App Router root (`<absRoot>/app` or `<absRoot>/src/app`).
 * Returns null when neither directory exists. Reused by plan 03's route-map.
 */
export async function resolveAppRoot(absRoot: string): Promise<string | null> {
  for (const candidate of [join(absRoot, "app"), join(absRoot, "src", "app")]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* nope */
    }
  }
  return null;
}

export async function discoverEntries(absRoot: string): Promise<string[]> {
  const appRoot = await resolveAppRoot(absRoot);
  if (!appRoot) return [];

  const matches = await glob([`**/${SPECIAL}.${EXTS}`], {
    cwd: appRoot,
    absolute: true,
    ignore: ["**/_*/**", "**/node_modules/**"],
    dot: false,
  });

  return matches
    .map(toForwardSlash)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
