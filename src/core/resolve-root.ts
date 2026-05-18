import path from "node:path";
import os from "node:os";
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
 *
 * Throws if the resolved path is a filesystem root or a known sensitive
 * directory (e.g., ~/.ssh) to prevent path-traversal attacks (CR-03).
 */
export function resolveRoot(explicit?: string): string {
  const candidate = explicit ?? process.env.UI_TO_HIERARCH_ROOT ?? process.cwd();
  const resolved = path.resolve(candidate);

  // Reject filesystem roots (path.dirname of a root equals itself)
  if (path.dirname(resolved) === resolved) {
    throw new Error(`projectRoot must not be a filesystem root: ${resolved}`);
  }

  // Reject known sensitive directories
  const sshDir = path.join(os.homedir(), ".ssh");
  if (resolved === sshDir || resolved.startsWith(sshDir + path.sep)) {
    throw new Error(`projectRoot resolves to a sensitive system path: ${resolved}`);
  }

  return toForwardSlash(resolved);
}
