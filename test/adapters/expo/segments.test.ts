import { describe, it } from "vitest";

describe("parseSegment", () => {
  it.todo("classifies static segment correctly");
  it.todo("classifies index file (index.tsx) as kind: index");
  it.todo("classifies [id] as dynamic — returns name field not param");
  it.todo("classifies [...rest] as catch-all");
  it.todo("classifies [[...opt]] as optional-catch-all");
  it.todo("classifies (tabs) group — kind: group, name: tabs");
  it.todo("classifies +not-found as special");
  it.todo("strips extension before classifying (index.tsx → index kind)");
});
