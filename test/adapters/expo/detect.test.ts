import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectExpoRouter } from "../../../src/adapters/expo/detect.js";

const fx = (name: string) => path.resolve("test/fixtures", name);

describe("detectExpoRouter", () => {
  it("returns detected:true with signals for expo-basic", async () => {
    const result = await detectExpoRouter(fx("expo-basic"));
    expect(result.detected).toBe(true);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it("returns detected:false for next-app-router", async () => {
    const result = await detectExpoRouter(fx("next-app-router"));
    expect(result.detected).toBe(false);
  });

  it("returns detected:false when only layout exists but no expo-router dep (monorepo root)", async () => {
    const result = await detectExpoRouter(fx("monorepo-mixed"));
    expect(result.detected).toBe(false);
  });

  it("signals always populated as array even when detected:false (D-06)", async () => {
    const result = await detectExpoRouter(fx("next-app-router"));
    expect(Array.isArray(result.signals)).toBe(true);
  });
});
