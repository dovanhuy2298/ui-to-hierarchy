import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET_IDS,
  TARGETS,
  VALID_TARGET_IDS,
} from "../../src/init/targets.js";
import type { TargetId, TargetSpec } from "../../src/init/targets.js";

describe("TARGETS registry", () => {
  it("contains exactly four entries in canonical order", () => {
    expect(TARGETS).toHaveLength(4);
    expect(TARGETS.map((t) => t.id)).toEqual([
      "claude",
      "codex",
      "cursor",
      "copilot",
    ]);
  });

  it("maps each target id to the spec'd relative path", () => {
    const byId: Record<TargetId, TargetSpec> = TARGETS.reduce(
      (acc, t) => {
        acc[t.id] = t;
        return acc;
      },
      {} as Record<TargetId, TargetSpec>,
    );

    expect(byId.claude?.relativePath).toBe("CLAUDE.md");
    expect(byId.codex?.relativePath).toBe("AGENTS.md");
    expect(byId.cursor?.relativePath).toBe(
      ".cursor/rules/ui-hierarchy-mcp.mdc",
    );
    expect(byId.copilot?.relativePath).toBe(
      ".github/copilot-instructions.md",
    );
  });

  it("flags only the cursor entry with hasFrontmatter: true", () => {
    const withFrontmatter = TARGETS.filter((t) => t.hasFrontmatter);
    expect(withFrontmatter).toHaveLength(1);
    expect(withFrontmatter[0]?.id).toBe("cursor");
  });

  it("DEFAULT_TARGET_IDS is ['claude']", () => {
    expect(DEFAULT_TARGET_IDS).toEqual(["claude"]);
  });

  it("VALID_TARGET_IDS matches TARGETS.map(id)", () => {
    expect(VALID_TARGET_IDS).toEqual(TARGETS.map((t) => t.id));
  });
});

describe("__INIT_MARKER_VERSION__ build-time constant", () => {
  it("is defined and resolves to the vitest stub value", () => {
    // vitest.config.ts `define` should inject "0.0-test" at test time.
    expect(typeof __INIT_MARKER_VERSION__).toBe("string");
    expect(__INIT_MARKER_VERSION__).toBe("0.0-test");
  });
});
