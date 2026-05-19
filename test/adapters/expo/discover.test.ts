import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  detectDualRoots,
  discoverEntries,
  resolveExpoRoot,
} from "../../../src/adapters/expo/discover.js";

const EXPO_BASIC = path.resolve("test/fixtures/expo-basic");
const EXPO_TABS = path.resolve("test/fixtures/expo-tabs-and-dynamic");

// Temporary directory for dual-root and edge case tests.
let tmpDir: string;
let dualRootDir: string;
let onlySrcAppDir: string;
let onlyAppDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "expo-discover-test-"));
  // dual-root: both app/ and src/app/ exist
  dualRootDir = path.join(tmpDir, "dual-root");
  await fs.mkdir(path.join(dualRootDir, "src", "app"), { recursive: true });
  await fs.mkdir(path.join(dualRootDir, "app"), { recursive: true });

  // only src/app/ exists
  onlySrcAppDir = path.join(tmpDir, "only-src-app");
  await fs.mkdir(path.join(onlySrcAppDir, "src", "app"), { recursive: true });

  // only app/ exists
  onlyAppDir = path.join(tmpDir, "only-app");
  await fs.mkdir(path.join(onlyAppDir, "app"), { recursive: true });
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("resolveExpoRoot", () => {
  it("returns src/app when both src/app and app/ exist (src/app wins — D-08 priority)", async () => {
    const result = await resolveExpoRoot(dualRootDir);
    expect(result).not.toBeNull();
    expect(result).toMatch(/[\\/]src[\\/]app$/);
  });

  it("returns src/app when only src/app exists", async () => {
    const result = await resolveExpoRoot(onlySrcAppDir);
    expect(result).not.toBeNull();
    expect(result).toMatch(/[\\/]src[\\/]app$/);
  });

  it("returns app/ when only app/ exists", async () => {
    const result = await resolveExpoRoot(onlyAppDir);
    expect(result).not.toBeNull();
    expect(result).toMatch(/[\\/]app$/);
  });

  it("returns null when neither src/app nor app/ exists", async () => {
    const result = await resolveExpoRoot(path.join(tmpDir, "no-roots-here"));
    expect(result).toBeNull();
  });

  it("returns null on a completely non-existent path (D-12 no-throw)", async () => {
    const result = await resolveExpoRoot(path.resolve("test/fixtures/__does_not_exist__"));
    expect(result).toBeNull();
  });
});

describe("detectDualRoots", () => {
  it("returns { hasSrcApp: true, hasApp: true } when both roots exist", async () => {
    const result = await detectDualRoots(dualRootDir);
    expect(result).toEqual({ hasSrcApp: true, hasApp: true });
  });

  it("returns { hasSrcApp: true, hasApp: false } when only src/app exists", async () => {
    const result = await detectDualRoots(onlySrcAppDir);
    expect(result).toEqual({ hasSrcApp: true, hasApp: false });
  });

  it("returns { hasSrcApp: false, hasApp: true } when only app/ exists", async () => {
    const result = await detectDualRoots(onlyAppDir);
    expect(result).toEqual({ hasSrcApp: false, hasApp: true });
  });

  it("returns { hasSrcApp: false, hasApp: false } when neither exists", async () => {
    const result = await detectDualRoots(path.join(tmpDir, "no-roots"));
    expect(result).toEqual({ hasSrcApp: false, hasApp: false });
  });
});

describe("discoverEntries", () => {
  it("returns [] when neither root exists", async () => {
    const result = await discoverEntries(path.resolve("test/fixtures/__does_not_exist__"));
    expect(result).toEqual([]);
  });

  it("returns forward-slash paths in lexicographic sort order (expo-basic)", async () => {
    const result = await discoverEntries(EXPO_BASIC);
    expect(result.length).toBeGreaterThan(0);
    // Forward slashes only — no backslashes
    expect(result.every((p) => !p.includes("\\"))).toBe(true);
    // Lex sorted
    const sorted = [...result].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(result).toEqual(sorted);
  });

  it("includes _layout.tsx and index.tsx for expo-basic fixture", async () => {
    const result = await discoverEntries(EXPO_BASIC);
    expect(result.some((p) => p.endsWith("/app/_layout.tsx"))).toBe(true);
    expect(result.some((p) => p.endsWith("/app/index.tsx"))).toBe(true);
    // Ensure no backslashes (forward-slash invariant)
    expect(result.every((p) => !p.includes("\\"))).toBe(true);
  });

  it("ignores files under components/ directory", async () => {
    const result = await discoverEntries(EXPO_BASIC);
    expect(result.some((p) => p.includes("/components/"))).toBe(false);
  });

  it("ignores files under node_modules/ directory", async () => {
    const result = await discoverEntries(EXPO_BASIC);
    expect(result.some((p) => p.includes("/node_modules/"))).toBe(false);
  });

  it("traverses group folders (tabs)/ — they are NOT ignored", async () => {
    const result = await discoverEntries(EXPO_TABS);
    // Group folders must be traversed
    expect(result.some((p) => p.includes("/(tabs)/"))).toBe(true);
    expect(result.some((p) => p.endsWith("/(tabs)/_layout.tsx"))).toBe(true);
    expect(result.some((p) => p.endsWith("/(tabs)/[id].tsx"))).toBe(true);
  });

  it("includes +not-found.tsx in expo-tabs-and-dynamic", async () => {
    const result = await discoverEntries(EXPO_TABS);
    expect(result.some((p) => p.endsWith("/+not-found.tsx"))).toBe(true);
  });

  it("ignores files under components/ in expo-tabs-and-dynamic", async () => {
    const result = await discoverEntries(EXPO_TABS);
    expect(result.some((p) => p.includes("/components/"))).toBe(false);
  });

  it("returns absolute paths", async () => {
    const result = await discoverEntries(EXPO_BASIC);
    expect(result.every((p) => path.isAbsolute(p))).toBe(true);
  });
});
