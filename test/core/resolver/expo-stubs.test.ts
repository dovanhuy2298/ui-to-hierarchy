import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ParseContext } from "../../../src/adapters/types.js";
import { resolveModule } from "../../../src/core/resolver/index.js";

function ctxFor(rootRel: string): ParseContext {
  return {
    resolvedRoot: path.resolve(rootRel),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}

describe("INTEG-02 expo stub external classification", () => {
  it("classifies react-native as external from expo-basic", () => {
    const ctx = ctxFor("test/fixtures/expo-basic");
    const fromFile = path.resolve("test/fixtures/expo-basic/app/_layout.tsx");
    const r = resolveModule(ctx, fromFile, "react-native", "View");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("external");
      if (r.kind === "external") {
        expect(r.packageName).toBe("react-native");
      }
    }
  });

  it("classifies expo-router as external from expo-basic", () => {
    const ctx = ctxFor("test/fixtures/expo-basic");
    const fromFile = path.resolve("test/fixtures/expo-basic/app/_layout.tsx");
    const r = resolveModule(ctx, fromFile, "expo-router", "Slot");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("external");
      if (r.kind === "external") {
        expect(r.packageName).toBe("expo-router");
      }
    }
  });

  it("classifies react-native as external from expo-tabs-and-dynamic", () => {
    const ctx = ctxFor("test/fixtures/expo-tabs-and-dynamic");
    const fromFile = path.resolve(
      "test/fixtures/expo-tabs-and-dynamic/app/(tabs)/_layout.tsx",
    );
    const r = resolveModule(ctx, fromFile, "react-native", "View");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("external");
      if (r.kind === "external") {
        expect(r.packageName).toBe("react-native");
      }
    }
  });

  it("classifies expo-router as external from expo-tabs-and-dynamic", () => {
    const ctx = ctxFor("test/fixtures/expo-tabs-and-dynamic");
    const fromFile = path.resolve(
      "test/fixtures/expo-tabs-and-dynamic/app/(tabs)/_layout.tsx",
    );
    const r = resolveModule(ctx, fromFile, "expo-router", "Tabs");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("external");
      if (r.kind === "external") {
        expect(r.packageName).toBe("expo-router");
      }
    }
  });
});
