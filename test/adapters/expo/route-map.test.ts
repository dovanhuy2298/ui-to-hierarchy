import { describe, it } from "vitest";

describe("enumerateRoutes", () => {
  it.todo("groups are transparent in URL — (tabs)/index.tsx produces route /");
  it.todo("index collapsing — settings/index.tsx produces route /settings");
  it.todo("[id] rendered as dynamic segment in route string");
  it.todo("+not-found is excluded from enumerated routes");
});

describe("mapRouteToEntry", () => {
  it.todo("returns root _layout, nested _layout, and page entries for a matched route (D-09)");
  it.todo("invalid input (non-string or missing leading /) returns { matched: false } without throwing");
  it.todo("unmatched valid route returns { matched: false } without throwing");
});
