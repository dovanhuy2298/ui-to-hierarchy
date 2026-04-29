import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverEntries, resolveAppRoot } from "../../../src/adapters/next/discover.js";

const ROOT = path.resolve("test/fixtures/next-app-router");

describe("R6 NextJsAdapter.discoverEntries", () => {
  it("returns forward-slash absolute paths only (no backslashes)", async () => {
    const out = await discoverEntries(ROOT);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((p) => !p.includes("\\"))).toBe(true);
    expect(out.every((p) => path.isAbsolute(p))).toBe(true);
  });

  it("results are lex-sorted by explicit code-point comparator", async () => {
    const out = await discoverEntries(ROOT);
    const expected = [...out].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(out).toEqual(expected);
  });

  it("excludes _private folder contents", async () => {
    const out = await discoverEntries(ROOT);
    expect(out.some((p) => p.includes("/_internal/"))).toBe(false);
    // The fixture HAS app/_internal/scratch.tsx — assert specifically it is excluded.
    expect(out.some((p) => p.endsWith("/_internal/scratch.tsx"))).toBe(false);
  });

  it("includes (group) folder contents (route groups participate)", async () => {
    const out = await discoverEntries(ROOT);
    expect(out.some((p) => /\/\(marketing\)\/layout\.tsx$/.test(p))).toBe(true);
    expect(out.some((p) => /\/\(marketing\)\/about\/page\.tsx$/.test(p))).toBe(true);
  });

  it("includes @slot folder contents (parallel routes participate)", async () => {
    const out = await discoverEntries(ROOT);
    expect(out.some((p) => /\/@modal\/login\/page\.tsx$/.test(p))).toBe(true);
  });

  it("includes only the special-file allow-list (page, layout, template, loading, error, not-found, default)", async () => {
    const out = await discoverEntries(ROOT);
    const allowed = /\/(page|layout|template|loading|error|not-found|default)\.(tsx|jsx|ts|js)$/;
    expect(out.every((p) => allowed.test(p))).toBe(true);
  });

  it("returns [] when neither app/ nor src/app/ exists", async () => {
    const out = await discoverEntries(path.resolve("test/fixtures/next-detect-pages-only"));
    expect(out).toEqual([]);
  });

  it("returns [] on a non-existent root (D-12 no-throw)", async () => {
    const out = await discoverEntries(path.resolve("test/fixtures/__does_not_exist__"));
    expect(out).toEqual([]);
  });

  it("includes dynamic-segment leaf pages ([slug], [...rest], [[...opt]])", async () => {
    const out = await discoverEntries(ROOT);
    expect(out.some((p) => /\/blog\/\[slug\]\/page\.tsx$/.test(p))).toBe(true);
    expect(out.some((p) => /\/files\/\[\.\.\.rest\]\/page\.tsx$/.test(p))).toBe(true);
    expect(out.some((p) => /\/maybe\/\[\[\.\.\.opt\]\]\/page\.tsx$/.test(p))).toBe(true);
  });
});

describe("resolveAppRoot helper (reused by route-map.ts)", () => {
  it("returns <root>/app when app/ exists", async () => {
    const result = await resolveAppRoot(path.resolve("test/fixtures/next-detect-with-app"));
    expect(result).not.toBeNull();
    expect(result).toMatch(/[\\/]app$/);
  });

  it("returns <root>/src/app when only src/app/ exists", async () => {
    const result = await resolveAppRoot(path.resolve("test/fixtures/next-detect-with-src-app"));
    expect(result).not.toBeNull();
    expect(result).toMatch(/[\\/]src[\\/]app$/);
  });

  it("returns null when neither exists", async () => {
    const result = await resolveAppRoot(path.resolve("test/fixtures/next-detect-pages-only"));
    expect(result).toBeNull();
  });
});
