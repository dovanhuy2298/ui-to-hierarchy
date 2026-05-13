import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ParseContext } from "../../../src/adapters/types.js";
import { resolveModule } from "../../../src/core/resolver/index.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures", import.meta.url));

function ctxFor(fixtureName: string): ParseContext {
  return {
    resolvedRoot: path.join(FIXTURES, fixtureName),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}

describe("INTEG-02 expo stub external classification", () => {
  it("classifies react-native as external from expo-basic", () => {
    const ctx = ctxFor("expo-basic");
    const fromFile = path.join(FIXTURES, "expo-basic/app/_layout.tsx");
    const r = resolveModule(ctx, fromFile, "react-native", "View");
    expect(r.ok, `resolveModule failed: ${JSON.stringify(r)}`).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("external");
      if (r.kind === "external") {
        expect(r.packageName).toBe("react-native");
      }
    }
  });

  it("classifies expo-router as external from expo-basic", () => {
    const ctx = ctxFor("expo-basic");
    const fromFile = path.join(FIXTURES, "expo-basic/app/_layout.tsx");
    const r = resolveModule(ctx, fromFile, "expo-router", "Slot");
    expect(r.ok, `resolveModule failed: ${JSON.stringify(r)}`).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("external");
      if (r.kind === "external") {
        expect(r.packageName).toBe("expo-router");
      }
    }
  });

  it("classifies react-native as external from expo-tabs-and-dynamic", () => {
    const ctx = ctxFor("expo-tabs-and-dynamic");
    const fromFile = path.join(
      FIXTURES,
      "expo-tabs-and-dynamic/app/(tabs)/_layout.tsx",
    );
    const r = resolveModule(ctx, fromFile, "react-native", "View");
    expect(r.ok, `resolveModule failed: ${JSON.stringify(r)}`).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("external");
      if (r.kind === "external") {
        expect(r.packageName).toBe("react-native");
      }
    }
  });

  it("classifies expo-router as external from expo-tabs-and-dynamic", () => {
    const ctx = ctxFor("expo-tabs-and-dynamic");
    const fromFile = path.join(
      FIXTURES,
      "expo-tabs-and-dynamic/app/(tabs)/_layout.tsx",
    );
    const r = resolveModule(ctx, fromFile, "expo-router", "Tabs");
    expect(r.ok, `resolveModule failed: ${JSON.stringify(r)}`).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("external");
      if (r.kind === "external") {
        expect(r.packageName).toBe("expo-router");
      }
    }
  });
});
