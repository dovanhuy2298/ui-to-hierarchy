import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/adapters/next/detect.js", () => ({ detectNextJs: vi.fn() }));
vi.mock("../../src/adapters/expo/detect.js", () => ({ detectExpoRouter: vi.fn() }));

import { selectAdapter, setFrameworkOverride } from "../../src/adapters/select.js";
import { NextJsAdapter } from "../../src/adapters/next/NextJsAdapter.js";
import { ExpoRouterAdapter } from "../../src/adapters/expo/ExpoRouterAdapter.js";
import { detectNextJs } from "../../src/adapters/next/detect.js";
import { detectExpoRouter } from "../../src/adapters/expo/detect.js";

const fx = (name: string) => path.resolve("test/fixtures", name);

// Real implementations for integration tests (loaded lazily to avoid hoisting issue)
const realDetectNextJs = async (root: string) => {
  const { detectNextJs: real } = await vi.importActual<typeof import("../../src/adapters/next/detect.js")>("../../src/adapters/next/detect.js");
  return real(root);
};
const realDetectExpoRouter = async (root: string) => {
  const { detectExpoRouter: real } = await vi.importActual<typeof import("../../src/adapters/expo/detect.js")>("../../src/adapters/expo/detect.js");
  return real(root);
};

describe("selectAdapter", () => {
  beforeEach(() => {
    setFrameworkOverride(undefined as any);
    vi.resetAllMocks();
  });

  it("returns NextJsAdapter for next-app-router", async () => {
    vi.mocked(detectNextJs).mockImplementation(realDetectNextJs);
    vi.mocked(detectExpoRouter).mockImplementation(realDetectExpoRouter);
    const result = await selectAdapter(fx("next-app-router"));
    expect(result).toBeInstanceOf(NextJsAdapter);
  });

  it("returns ExpoRouterAdapter instance for expo-basic", async () => {
    vi.mocked(detectNextJs).mockImplementation(realDetectNextJs);
    vi.mocked(detectExpoRouter).mockImplementation(realDetectExpoRouter);
    const result = await selectAdapter(fx("expo-basic"));
    expect(result).toBeInstanceOf(ExpoRouterAdapter);
  });

  it("returns isError:true for zero-match (monorepo root)", async () => {
    vi.mocked(detectNextJs).mockImplementation(realDetectNextJs);
    vi.mocked(detectExpoRouter).mockImplementation(realDetectExpoRouter);
    const result = await selectAdapter(fx("monorepo-mixed"));
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("--framework");
  });

  it("returns isError:true for conflict root (ADAPT-04)", async () => {
    vi.mocked(detectNextJs).mockResolvedValue({ detected: true, signals: ["package.json#next", "next.config.ts"] });
    vi.mocked(detectExpoRouter).mockResolvedValue({ detected: true, signals: ["package.json#expo-router", "app/_layout.tsx"] });
    const result = await selectAdapter(fx("next-app-router"));
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("--framework to disambiguate");
    expect((result as any).content[0].text).toContain("package.json#next");
  });

  it("override 'expo-router' returns ExpoRouterAdapter regardless of root", async () => {
    const result = await selectAdapter(fx("next-app-router"), "expo-router");
    expect(result).toBeInstanceOf(ExpoRouterAdapter);
  });

  it("override 'nextjs' returns NextJsAdapter regardless of root", async () => {
    const result = await selectAdapter(fx("expo-basic"), "nextjs");
    expect(result).toBeInstanceOf(NextJsAdapter);
  });

  it("INTEG-04: monorepo-mixed/apps/web returns NextJsAdapter", async () => {
    vi.mocked(detectNextJs).mockImplementation(realDetectNextJs);
    vi.mocked(detectExpoRouter).mockImplementation(realDetectExpoRouter);
    const result = await selectAdapter(fx("monorepo-mixed/apps/web"));
    expect(result).toBeInstanceOf(NextJsAdapter);
  });

  it("INTEG-04: monorepo-mixed/apps/mobile returns ExpoRouterAdapter", async () => {
    vi.mocked(detectNextJs).mockImplementation(realDetectNextJs);
    vi.mocked(detectExpoRouter).mockImplementation(realDetectExpoRouter);
    const result = await selectAdapter(fx("monorepo-mixed/apps/mobile"));
    expect(result).toBeInstanceOf(ExpoRouterAdapter);
  });
});
