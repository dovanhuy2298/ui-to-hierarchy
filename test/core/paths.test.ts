import { describe, it, expect } from "vitest";
import { toForwardSlash, relFromRoot } from "../../src/core/paths.js";

describe("toForwardSlash", () => {
  it("converts backslashes to forward slashes", () => {
    // On POSIX, path.sep === "/", so `split(path.sep).join("/")` leaves `\\` intact.
    // The literal-backslash replace pass in the implementation handles this case.
    expect(toForwardSlash("app\\page.tsx")).toBe("app/page.tsx");
  });

  it("is idempotent on forward-slash-only input", () => {
    expect(toForwardSlash("app/page.tsx")).toBe("app/page.tsx");
  });

  it("handles empty string", () => {
    expect(toForwardSlash("")).toBe("");
  });
});

describe("relFromRoot", () => {
  it("returns a forward-slash relative path (POSIX shape)", () => {
    // Driven by POSIX-shaped absolute paths so the test is deterministic on any runner.
    const result = relFromRoot("/root/app/page.tsx", "/root");
    // On POSIX: path.relative → "app/page.tsx".
    // On Windows: path.relative on POSIX-shaped inputs still yields a forward-slashed
    // segment chain (no drive letter involved), so the forward-slash assertion holds.
    expect(result).not.toContain("\\");
    expect(result).toContain("app");
    expect(result).toContain("page.tsx");
  });
});
