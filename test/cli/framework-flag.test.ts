import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Integration-level CLI tests — spawn a real node process with tsx
// Requires tsx devDep (already in devDependencies)

describe("--framework CLI flag (ADAPT-05)", () => {
  it("exits with code 1 for invalid --framework value", () => {
    const result = spawnSync(
      "node",
      ["--import=tsx/esm", "src/cli.ts", "--framework", "badvalue"],
      { encoding: "utf8", timeout: 5000, cwd: path.resolve(import.meta.dirname, "../..") },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown value");
    expect(result.stderr).toContain("Valid values: nextjs, expo-router");
  });

  it("does not exit with framework error for valid --framework nextjs", () => {
    // The server will hang waiting for MCP stdio — timeout kills it.
    // null status = killed by timeout (server started and was waiting for MCP input).
    // 0 = clean exit (unexpected but acceptable).
    // 1+ = error exit (framework validation or startup failure).
    const result = spawnSync(
      "node",
      ["--import=tsx/esm", "src/cli.ts", "--framework", "nextjs"],
      { encoding: "utf8", timeout: 3000, cwd: path.resolve(import.meta.dirname, "../..") },
    );
    expect(result.status).toBeOneOf([null, 0]);
    expect(result.stderr).not.toContain("[framework] error");
  });
});
