/**
 * node_modules boundary detection.
 *
 * Two complementary helpers:
 *
 *   1. `detectNodeModules(absForwardSlash)` — given a resolved absolute file
 *      path (forward-slash), returns the package name if the file lives
 *      under a `node_modules/` segment, or null otherwise. We use the LAST
 *      occurrence of `/node_modules/` so nested workspace deps still
 *      surface as their owning package (e.g.
 *      `/repo/packages/foo/node_modules/react/index.js` → "react").
 *
 *   2. `packageNameFromSpecifier(specifier)` — given an unresolved bare
 *      specifier like `"react"` or `"@radix-ui/react-dialog/foo"`, return
 *      the package name (`react`, `@radix-ui/react-dialog`). Returns null
 *      for relative (`./`, `../`), absolute (`/`), or alias (`@/`, `~/`,
 *      `#`) specifiers.
 *
 * Both honor scoped-package syntax: `@scope/name` (two segments).
 */

const NODE_MODULES_SEG = "/node_modules/";

/** Detect node_modules boundary on a forward-slash absolute path. */
export function detectNodeModules(absForwardSlash: string): string | null {
  const idx = absForwardSlash.lastIndexOf(NODE_MODULES_SEG);
  if (idx === -1) return null;
  const after = absForwardSlash.slice(idx + NODE_MODULES_SEG.length);
  const segs = after.split("/");
  const first = segs[0];
  if (!first) return null;
  if (first.startsWith("@") && segs.length >= 2) return `${first}/${segs[1]}`;
  return first;
}

/** Extract package name from an unresolved bare specifier. */
export function packageNameFromSpecifier(specifier: string): string | null {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("@/") ||
    specifier.startsWith("~/") ||
    specifier.startsWith("#")
  ) {
    return null;
  }
  const segs = specifier.split("/");
  const first = segs[0];
  if (!first) return null;
  if (first.startsWith("@") && segs.length >= 2) return `${first}/${segs[1]}`;
  return first;
}
