/**
 * detectExpoRouter — two-signal probe for Expo Router projects.
 *
 * Signal 1: "expo-router" in package.json dependencies or devDependencies.
 * Signal 2: presence of app/_layout.tsx or src/app/_layout.tsx.
 *
 * Returns { detected: true, signals } only when BOTH signals are found.
 * D-12 (no-throw): malformed/missing files collapse to zero signals for
 * that check.
 */

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function detectExpoRouter(
  absRoot: string,
): Promise<{ detected: boolean; signals: string[] }> {
  const signals: string[] = [];

  // ── Signal 1: package.json#expo-router ──────────────────────────────────
  try {
    const raw = await readFile(join(absRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if ("expo-router" in allDeps) {
      signals.push("package.json#expo-router");
    }
  } catch {
    // Missing or malformed package.json — skip signal
  }

  // ── Signal 2: app/_layout.tsx or src/app/_layout.tsx ────────────────────
  const layoutCandidates = [
    { rel: "app/_layout.tsx", full: join(absRoot, "app", "_layout.tsx") },
    {
      rel: "src/app/_layout.tsx",
      full: join(absRoot, "src", "app", "_layout.tsx"),
    },
  ];

  for (const { rel, full } of layoutCandidates) {
    if (await exists(full)) {
      signals.push(rel);
      break;
    }
  }

  return { detected: signals.length === 2, signals };
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
