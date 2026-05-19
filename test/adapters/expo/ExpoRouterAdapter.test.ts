import { describe, it } from "vitest";

describe("classifyEntry", () => {
  it.todo("_layout.tsx classified as 'layout'");
  it.todo("+not-found.tsx classified as 'special'");
  it.todo("+html.tsx classified as 'other'");
  it.todo("+api.ts classified as 'other'");
  it.todo("index.tsx classified as 'page'");
  it.todo("settings.tsx (leaf file) classified as 'page'");
});

describe("Slot injection", () => {
  it.todo("expo-basic snapshot contains app/_layout.tsx and app/index.tsx injected at Slot position");
});

describe("Tabs.Screen / Stack.Screen walker", () => {
  it.todo("expo-tabs-and-dynamic snapshot enumerates <Tabs.Screen> with name + options attributes (D-01/D-02/D-03)");
  it.todo("non-literal name prop on <Tabs.Screen> emits warning containing 'Non-literal name prop' without crash");
  it.todo("<Stack.Screen> enumerated analogously to Tabs.Screen");
});

describe("namespace import warning", () => {
  it.todo("import * as RN from 'react-native' produces warning containing literal substring 'Namespace import'");
});

describe("Text content extraction", () => {
  it.todo("<Text>Hello world</Text> from react-native yields text: 'Hello world'");
  it.todo("<Text>{dynamic}</Text> from react-native yields no text field");
  it.todo("<Text> from @/components/Text stays kind: 'component'");
});

describe("snapshots", () => {
  it.todo("expo-basic fixture snapshot matches expected hierarchy");
  it.todo("expo-tabs-and-dynamic fixture snapshot matches expected hierarchy");
});
