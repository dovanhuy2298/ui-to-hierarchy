import path from "node:path";
import { toForwardSlash } from "./paths.js";

/**
 * Resolve the project root directory for a parse operation.
 *
 * Precedence (D-21 / ARCH-03):
 *   1. explicit argument (from MCP tool input)
 *   2. UI_TO_HIERARCH_ROOT environment variable
 *   3. process.cwd()
 *
 * The result is always an absolute path normalized to forward slashes
 * (so `C:\foo\bar` becomes `C:/foo/bar`).
 */
export function resolveRoot(explicit?: string): string {
  const candidate = explicit ?? process.env.UI_TO_HIERARCH_ROOT ?? process.cwd();
  return toForwardSlash(path.resolve(candidate));
}
