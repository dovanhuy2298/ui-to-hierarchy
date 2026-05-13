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

  it("contains the version value passed in", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    expect(out).toContain("0.1");
  });

  it("is pure — identical inputs yield byte-identical outputs", () => {
    const a = renderGuide({ cwd: "/test/project", version: "0.1" });
    const b = renderGuide({ cwd: "/test/project", version: "0.1" });
    expect(a).toBe(b);
  });

  it("does not embed cwd or project-specific paths", () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    expect(out).not.toContain("/test/project");
  });

  it("global and local modes produce identical output", () => {
    const local = renderGuide({ cwd: "/test/project", version: "0.1" });
    const global = renderGuide({ cwd: "/test/project", version: "0.1", global: true });
    expect(local).toBe(global);
  });

  it("matches snapshot for rendered guide", async () => {
    const out = renderGuide({ cwd: "/test/project", version: "0.1" });
    await expect(out).toMatchFileSnapshot("./__snapshots__/template-guide.md");
  });
});
