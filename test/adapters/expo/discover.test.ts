import { describe, it } from "vitest";

describe("resolveExpoRoot", () => {
  it.todo("returns src/app when both src/app and app/ exist (src/app wins — D-08 priority)");
  it.todo("returns app/ when only app/ exists");
  it.todo("returns null when neither src/app nor app/ exists");
});

describe("discoverEntries", () => {
  it.todo("flushes dual-root warning via instance-level pendingWarnings when both roots exist");
  it.todo("ignores files under components/ directory");
  it.todo("ignores files under hooks/ directory");
  it.todo("ignores files under utils/ directory");
  it.todo("ignores files under node_modules/ directory");
  it.todo("returns forward-slash paths in lexicographic sort order");
});
