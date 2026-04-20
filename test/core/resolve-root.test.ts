import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveRoot } from "../../src/core/resolve-root.js";

describe("resolveRoot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("arg wins over env and cwd", () => {
    vi.stubEnv("UI_TO_HIERARCH_ROOT", "/from-env");
    const result = resolveRoot("/explicit");
    expect(result).not.toContain("\\");
    expect(result).toContain("explicit");
    expect(result).not.toContain("from-env");
  });

  it("env wins over cwd when no arg is passed", () => {
    vi.stubEnv("UI_TO_HIERARCH_ROOT", "/env-val");
    const result = resolveRoot();
    expect(result).not.toContain("\\");
    expect(result).toContain("env-val");
  });

  it("falls back to process.cwd() when neither arg nor env is set", () => {
    vi.stubEnv("UI_TO_HIERARCH_ROOT", "");
    // stubEnv with "" leaves it falsy; process.env.UI_TO_HIERARCH_ROOT === "" → `?? ""` would
    // keep empty string, so explicitly delete-equivalent via stubbing to undefined:
    vi.unstubAllEnvs();
    delete process.env.UI_TO_HIERARCH_ROOT;

    const result = resolveRoot();
    const expected = resolveRoot(process.cwd());
    expect(result).toBe(expected);
    expect(result).not.toContain("\\");
  });

  it("normalizes a Windows-shaped absolute input to forward slashes", () => {
    // NOTE: path.resolve on POSIX treats "C:\\foo\\bar" as a single relative segment (it does
    // not recognize drive letters). After toForwardSlash, the output will still contain no
    // backslashes, and on Windows the drive-letter absolute path "C:/foo/bar" will emerge.
    // We assert the OS-portable invariants: no backslashes, and the "foo/bar" tail survives.
    const result = resolveRoot("C:\\foo\\bar");
    expect(result).not.toContain("\\");
    expect(result.includes("foo/bar") || result.endsWith("bar")).toBe(true);
  });
});
