/**
 * writeAtomic — durably persist content via tmpfile + rename (INIT-08).
 *
 * Sequence:
 *   1. mkdir(dirname(targetPath), recursive) — covers INIT-05 at the writer layer.
 *   2. writeFile(tmpPath, content) into a sibling `.tmp-<pid>-<hex>` file.
 *   3. rename(tmpPath, targetPath) — atomic commit on POSIX/Windows.
 *      If rename throws EXDEV (cross-device link), fall back to
 *      copyFile(tmpPath, targetPath) + unlink(tmpPath).
 *
 * On any error before the rename succeeds the tmp file is unlinked
 * (best-effort) and the error is rethrown. The original target file is
 * never partially overwritten because writes go to a sibling tmp file.
 *
 * Concurrency: the tmp name embeds `randomBytes(4)` so concurrent writes
 * inside the same directory (within a single process, or across processes
 * with the same pid pool) do not collide.
 *
 * This module does NOT emit user-facing output; that responsibility lives
 * with the orchestrator (D-09). It never terminates the process either.
 */

import { copyFile, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Indirection table for the filesystem primitives the writer uses.
 *
 * ESM module namespace bindings are non-configurable, which means
 * `vi.spyOn(fsPromises, "rename")` throws "Cannot redefine property". We
 * therefore route every fs call through this mutable object so tests can
 * replace individual methods. Production callers do not interact with
 * this export — it is internal API marked with the `__` prefix.
 */
export const __fs = {
  writeFile,
  rename,
  copyFile,
  unlink,
  mkdir,
};

export async function writeAtomic(
  targetPath: string,
  content: string,
): Promise<void> {
  await __fs.mkdir(dirname(targetPath), { recursive: true });
  const tmpPath = join(
    dirname(targetPath),
    `.tmp-${process.pid}-${randomBytes(4).toString("hex")}`,
  );
  try {
    await __fs.writeFile(tmpPath, content, "utf8");
    try {
      await __fs.rename(tmpPath, targetPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EXDEV") {
        await __fs.copyFile(tmpPath, targetPath);
        await __fs.unlink(tmpPath);
      } else {
        await __fs.unlink(tmpPath).catch(() => {});
        throw err;
      }
    }
  } catch (err) {
    await __fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

/**
 * writeAtomicDryRun — signature parity with writeAtomic, but performs zero
 * filesystem operations (INIT-10). The orchestrator calls this when
 * `--dry-run` is set so per-target accounting can proceed without touching
 * disk.
 */
export async function writeAtomicDryRun(
  _targetPath: string,
  _content: string,
): Promise<void> {
  // Intentionally no-op.
}
