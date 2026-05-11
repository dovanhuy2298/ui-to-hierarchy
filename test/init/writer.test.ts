import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __fs, writeAtomic, writeAtomicDryRun } from "../../src/init/writer.js";

describe("writeAtomic — happy path", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "writer-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates a new file at targetPath with the provided content", async () => {
    const target = join(tmpDir, "out.txt");
    await writeAtomic(target, "hello");
    const got = await readFile(target, "utf8");
    expect(got).toBe("hello");
  });

  it("creates missing parent directories (recursive mkdir)", async () => {
    const target = join(tmpDir, "nested", "deep", "out.txt");
    await writeAtomic(target, "payload");
    const got = await readFile(target, "utf8");
    expect(got).toBe("payload");
  });

  it("overwrites an existing file durably", async () => {
    const target = join(tmpDir, "existing.txt");
    await writeFile(target, "old", "utf8");
    await writeAtomic(target, "new");
    const got = await readFile(target, "utf8");
    expect(got).toBe("new");
  });

  it("leaves no .tmp-* files in the target directory after success", async () => {
    const target = join(tmpDir, "out.txt");
    await writeAtomic(target, "x");
    const entries = await readdir(tmpDir);
    const leftovers = entries.filter((e) => e.startsWith(".tmp-"));
    expect(leftovers).toEqual([]);
  });
});

describe("writeAtomic — EXDEV fallback", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "writer-exdev-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("falls back to copyFile + unlink when rename throws EXDEV", async () => {
    const target = join(tmpDir, "out.txt");

    const renameSpy = vi.spyOn(__fs, "rename").mockImplementationOnce(
      async () => {
        const err = new Error("EXDEV: cross-device link not permitted") as NodeJS.ErrnoException;
        err.code = "EXDEV";
        throw err;
      },
    );
    const copyFileSpy = vi.spyOn(__fs, "copyFile");
    const unlinkSpy = vi.spyOn(__fs, "unlink");

    await writeAtomic(target, "exdev-payload");

    expect(renameSpy).toHaveBeenCalledTimes(1);
    expect(copyFileSpy).toHaveBeenCalledTimes(1);
    expect(unlinkSpy).toHaveBeenCalledTimes(1);

    const got = await readFile(target, "utf8");
    expect(got).toBe("exdev-payload");

    const leftovers = (await readdir(tmpDir)).filter((e) => e.startsWith(".tmp-"));
    expect(leftovers).toEqual([]);
  });
});

describe("writeAtomic — error cleanup", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "writer-err-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("removes the tmp file when writeFile throws and rethrows the error", async () => {
    const target = join(tmpDir, "out.txt");
    const writeSpy = vi.spyOn(__fs, "writeFile").mockImplementationOnce(
      async () => {
        throw new Error("boom-write");
      },
    );

    await expect(writeAtomic(target, "x")).rejects.toThrow("boom-write");
    expect(writeSpy).toHaveBeenCalledTimes(1);

    const leftovers = (await readdir(tmpDir)).filter((e) => e.startsWith(".tmp-"));
    expect(leftovers).toEqual([]);
  });

  it("leaves an existing target file unchanged when rename throws a non-EXDEV error", async () => {
    const target = join(tmpDir, "existing.txt");
    await writeFile(target, "original", "utf8");

    vi.spyOn(__fs, "rename").mockImplementationOnce(async () => {
      const err = new Error("EPERM") as NodeJS.ErrnoException;
      err.code = "EPERM";
      throw err;
    });

    await expect(writeAtomic(target, "should-not-apply")).rejects.toThrow("EPERM");

    const got = await readFile(target, "utf8");
    expect(got).toBe("original");

    const leftovers = (await readdir(tmpDir)).filter((e) => e.startsWith(".tmp-"));
    expect(leftovers).toEqual([]);
  });
});

describe("writeAtomicDryRun — no-op contract (INIT-10)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "writer-dryrun-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("performs zero filesystem operations", async () => {
    const writeSpy = vi.spyOn(__fs, "writeFile");
    const renameSpy = vi.spyOn(__fs, "rename");
    const copyFileSpy = vi.spyOn(__fs, "copyFile");
    const unlinkSpy = vi.spyOn(__fs, "unlink");
    const mkdirSpy = vi.spyOn(__fs, "mkdir");

    await writeAtomicDryRun(join(tmpDir, "out.txt"), "ignored");

    expect(writeSpy).toHaveBeenCalledTimes(0);
    expect(renameSpy).toHaveBeenCalledTimes(0);
    expect(copyFileSpy).toHaveBeenCalledTimes(0);
    expect(unlinkSpy).toHaveBeenCalledTimes(0);
    expect(mkdirSpy).toHaveBeenCalledTimes(0);

    const entries = await readdir(tmpDir);
    expect(entries).toEqual([]);
  });

  it("returns a promise that resolves successfully", async () => {
    await expect(writeAtomicDryRun("/anywhere/ignored.txt", "x")).resolves.toBeUndefined();
  });
});

describe("writeAtomic — tmp filename collision resistance", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "writer-conc-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("supports concurrent writes to distinct targets without tmp-name collision", async () => {
    const a = join(tmpDir, "a.txt");
    const b = join(tmpDir, "b.txt");
    const c = join(tmpDir, "c.txt");
    await Promise.all([
      writeAtomic(a, "AAA"),
      writeAtomic(b, "BBB"),
      writeAtomic(c, "CCC"),
    ]);
    expect(await readFile(a, "utf8")).toBe("AAA");
    expect(await readFile(b, "utf8")).toBe("BBB");
    expect(await readFile(c, "utf8")).toBe("CCC");
    const leftovers = (await readdir(tmpDir)).filter((e) => e.startsWith(".tmp-"));
    expect(leftovers).toEqual([]);
  });
});
