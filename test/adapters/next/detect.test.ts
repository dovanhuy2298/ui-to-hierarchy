import path from "node:path";
import { describe, expect, it } from "vitest";
import { detect } from "../../../src/adapters/next/detect.js";

const fx = (name: string) => path.resolve(`test/fixtures/${name}`);

describe("R5 NextJsAdapter.detect heuristic", () => {
  it("returns true for project with next.config.mjs + app/", async () => {
    expect(await detect(fx("next-detect-with-app"))).toBe(true);
  });

  it("returns true for project with next.config.js + src/app/", async () => {
    expect(await detect(fx("next-detect-with-src-app"))).toBe(true);
  });

  it("returns false for Pages-Router-only project (no app/ or src/app/)", async () => {
    expect(await detect(fx("next-detect-pages-only"))).toBe(false);
  });

  it("returns false when no next.config.* present (even with app/)", async () => {
    expect(await detect(fx("next-detect-no-config"))).toBe(false);
  });

  it("returns false on a non-existent root (D-12 no-throw)", async () => {
    expect(await detect(path.resolve("test/fixtures/__does_not_exist__"))).toBe(false);
  });

  it("does not throw on a non-existent root", async () => {
    await expect(detect(path.resolve("test/fixtures/__does_not_exist__"))).resolves.toBe(false);
  });
});
