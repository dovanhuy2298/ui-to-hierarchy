import { describe, expect, it } from "vitest";
import { renderGuide } from "../../src/init/template.js";

describe("renderGuide — payload contract (INIT-12)", () => {
  it("returns a non-empty string", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("contains all four tool names verbatim", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    for (const name of [
      "get_full_hierarchy",
      "focus_on",
      "find_by_text",
      "find_by_style",
    ]) {
      expect(out, `missing tool: ${name}`).toContain(name);
    }
  });

  it("contains the literal MCP registration JSON tokens", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    expect(out).toContain('"npx", "-y", "ui-hierarchy-mcp"');
  });

  it("contains exactly 5 fenced code blocks (1 registration + 4 example invocations)", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    const fenceMatches = out.match(/```/g);
    const totalFences = fenceMatches?.length ?? 0;
    // Each fenced block has an opening and a closing fence => fences must be even.
    expect(totalFences % 2).toBe(0);
    const blocks = totalFences / 2;
    // 4 example invocations + 1 MCP registration JSON block = 5 fenced blocks.
    expect(blocks).toBe(5);
  });

  it("contains the literal cwd value passed in", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    expect(out).toContain("/test/project");
  });

  it("contains the version value passed in", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    expect(out).toContain("0.1");
  });

  it("is pure — identical inputs yield byte-identical outputs", () => {
    const a = renderGuide({ cwd: "/test/project", version: "0.1" });
    const b = renderGuide({ cwd: "/test/project", version: "0.1" });
    expect(a).toBe(b);
  });

  it("substitutes the cwd argument (different cwd => different output)", () => {
    const a = renderGuide({ cwd: "/test/project", version: "0.1" });
    const b = renderGuide({ cwd: "/another/root", version: "0.1" });
    expect(a).not.toBe(b);
    expect(b).toContain("/another/root");
    expect(b).not.toContain("/test/project");
  });

  it("matches snapshot for rendered guide", async () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    await expect(out).toMatchFileSnapshot("./__snapshots__/template-guide.md");
  });
});
