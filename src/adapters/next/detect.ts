/**
 * NextJsAdapter.detect — Phase 4, SPEC R5.
 *
 * Returns `true` only for projects that look like a Next.js App Router project:
 *   has any `next.config.{js,mjs,cjs,ts}` AND has `app/` (or `src/app/`).
 *
 * D-12 (no-throw): permission errors / ENOENT collapse to `false`. We never
 * `import()` config files — only `fs.access` them.
 */

import { access } from "node:fs/promises";
import { join } from "node:path";

const NEXT_CONFIGS = [
  "next.config.js",
  "next.config.mjs",
  "next.config.cjs",
  "next.config.ts",
] as const;

export async function detect(absRoot: string): Promise<boolean> {
  // 1) Any next.config.*?
  let hasConfig = false;
  for (const name of NEXT_CONFIGS) {
    if (await exists(join(absRoot, name))) {
      hasConfig = true;
      break;
    }
  }
  if (!hasConfig) return false;

  // 2) Any app/ or src/app/?
  if (await exists(join(absRoot, "app"))) return true;
  if (await exists(join(absRoot, "src", "app"))) return true;
  return false;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
