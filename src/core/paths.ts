import path from "node:path";

/**
 * Normalize a path to use forward slashes only.
 *
 * D-07 (forward-slash mandate): all paths in IR output must use `/` regardless of OS.
 *
 * We do two passes:
 *   1. `split(path.sep).join("/")` — handles the OS-native separator (backslashes on Windows).
 *   2. `.replaceAll("\\", "/")` — handles literal backslashes that may appear in input strings
 *      even on POSIX runners (where `path.sep === "/"` so step 1 leaves `\\` intact).
 *
 * This double-normalization makes the function behave identically on Windows and POSIX.
 */
export function toForwardSlash(p: string): string {
  return p.split(path.sep).join("/").replaceAll("\\", "/");
}

/**
 * Compute a forward-slash relative path from an absolute root to an absolute file.
 * Output is guaranteed to contain no backslashes.
 */
export function relFromRoot(absFile: string, absRoot: string): string {
  return toForwardSlash(path.relative(absRoot, absFile));
}
