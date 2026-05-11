import { describe, expect, it } from "vitest";
import { parseInitArgs } from "../../src/init/argv.js";
import type { ParseArgsResult } from "../../src/init/argv.js";

/** Narrow helper: extract the message from a known-failed result. */
function failMessage(result: ParseArgsResult): string {
  if (result.ok) {
    throw new Error("expected ok:false result, got ok:true");
  }
  return result.message;
}

describe("parseInitArgs — defaults", () => {
  it("returns DEFAULT_TARGET_IDS when --target is omitted", () => {
    const result = parseInitArgs(["--init"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.flags.targets).toEqual(["claude"]);
      expect(result.flags.dryRun).toBe(false);
      expect(result.flags.force).toBe(false);
    }
  });

  it("returns DEFAULT_TARGET_IDS for empty argv", () => {
    const result = parseInitArgs([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.flags.targets).toEqual(["claude"]);
    }
  });
});

describe("parseInitArgs — target enum validation", () => {
  it("accepts a single valid target", () => {
    const result = parseInitArgs(["--init", "--target", "claude"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.flags.targets).toEqual(["claude"]);
  });

  it("accepts comma-separated valid targets in declared order", () => {
    const result = parseInitArgs(["--init", "--target", "claude,codex"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.flags.targets).toEqual(["claude", "codex"]);
  });

  it("rejects an unknown --target token", () => {
    const result = parseInitArgs(["--init", "--target", "foo"]);
    expect(result.ok).toBe(false);
    const msg = failMessage(result);
    expect(msg).toContain("foo");
    // Lists the valid set so users can self-correct
    expect(msg).toContain("claude");
    expect(msg).toContain("codex");
    expect(msg).toContain("cursor");
    expect(msg).toContain("copilot");
  });

  it("reports the invalid token from a mixed list", () => {
    const result = parseInitArgs([
      "--init",
      "--target",
      "claude,foo,codex",
    ]);
    expect(result.ok).toBe(false);
    expect(failMessage(result)).toContain("foo");
  });
});

describe("parseInitArgs — boolean flags", () => {
  it("sets dryRun and force when both are present", () => {
    const result = parseInitArgs(["--init", "--dry-run", "--force"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.flags.dryRun).toBe(true);
      expect(result.flags.force).toBe(true);
    }
  });
});

describe("parseInitArgs — strict-mode unknown-flag rejection", () => {
  it("returns ok:false for an unknown flag", () => {
    const result = parseInitArgs(["--init", "--unknown-flag"]);
    expect(result.ok).toBe(false);
    // Node parseArgs strict mode throws; we wrap the message in the envelope.
    expect(failMessage(result).length).toBeGreaterThan(0);
  });
});
