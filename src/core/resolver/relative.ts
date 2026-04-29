import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { toForwardSlash } from "../paths.js";

/**
 * Relative-path probe (D-13).
 *
 * Given an absolute base path (with or without an extension), probe disk in
 * the documented order and return the first existing forward-slash absolute
 * file path, or null. Used by the resolver for both relative specifiers
 * (`./foo`, `../bar`) and tsconfig-paths candidates after the matcher
 * produces an absolute base (`<absRoot>/components/Button`).
 *
 * The order is:
 *   1. exact   — if the base path itself is a file (e.g. `./styles.css`)
 *   2. <base>.ts, <base>.tsx, <base>.js, <base>.jsx
 *   3. <base>/index.ts, /index.tsx, /index.js, /index.jsx
 *
 * D-13 (multi-target first-wins) is enforced one level up in
 * `resolveModule` — this file probes a single base. Callers iterate over
 * tsconfig-paths candidates and stop at the first hit.
 */

const EXT_ORDER = [".ts", ".tsx", ".js", ".jsx"] as const;
const INDEX_ORDER = ["/index.ts", "/index.tsx", "/index.js", "/index.jsx"] as const;

/** Probe a base path with D-13 extension order. */
export function probeFile(basePath: string): string | null {
  // 1. Exact path
  if (existsSync(basePath) && safeStatIsFile(basePath)) {
    return toForwardSlash(path.resolve(basePath));
  }
  // 2. <base>.<ext>
  for (const ext of EXT_ORDER) {
    const candidate = basePath + ext;
    if (existsSync(candidate) && safeStatIsFile(candidate)) {
      return toForwardSlash(path.resolve(candidate));
    }
  }
  // 3. <base>/index.<ext>
  for (const idx of INDEX_ORDER) {
    const candidate = basePath + idx;
    if (existsSync(candidate) && safeStatIsFile(candidate)) {
      return toForwardSlash(path.resolve(candidate));
    }
  }
  return null;
}

function safeStatIsFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve `./foo` or `../bar` from a fromFile to an absolute base path
 * (no extension probe). The returned value is fed to `probeFile`.
 */
export function joinRelative(fromFile: string, specifier: string): string {
  return path.resolve(path.dirname(fromFile), specifier);
}
