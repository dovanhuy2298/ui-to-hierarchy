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

  it("contains the Golden Rule heading", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    expect(out).toContain("## Golden Rule");
  });

  it("contains Always and Never rule sections", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    expect(out).toContain("**Always:**");
    expect(out).toContain("**Never:**");
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

  it("local mode embeds cwd in tool example", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    expect(out).toContain('projectRoot: "/test/project"');
    expect(out).toContain("**projectRoot for this checkout:**");
  });

  it("global mode uses placeholder instead of cwd", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1", global: true });
    expect(out).toContain("<absolute-path-to-repo>");
    expect(out).not.toContain("/test/project");
    expect(out).not.toContain("**projectRoot for this checkout:**");
  });

  it("matches snapshot for rendered guide", async () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    await expect(out).toMatchFileSnapshot("./__snapshots__/template-guide.md");
  });
});
