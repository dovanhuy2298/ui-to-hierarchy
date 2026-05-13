# Phase 9: Fixture Design & Stub Packages - Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 19 new files across two fixture trees + 1 test file
**Analogs found:** 19 / 20 (one category — local node_modules stubs — has no prior analog; pattern derived from locked decisions)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `test/core/resolver/expo-stubs.test.ts` | test | request-response | `test/core/resolver/barrel.test.ts` | exact |
| `test/fixtures/expo-basic/tsconfig.json` | config | — | `test/fixtures/parser/resolver/shadcn-barrel/tsconfig.json` | exact |
| `test/fixtures/expo-basic/app/_layout.tsx` | fixture | — | `test/fixtures/next-app-router/app/layout.tsx` | role-match |
| `test/fixtures/expo-basic/app/index.tsx` | fixture | — | `test/fixtures/next-app-router/app/page.tsx` | role-match |
| `test/fixtures/expo-basic/app/components/HomeScreen.tsx` | fixture | — | `test/fixtures/parser/resolver/shadcn-barrel/src/components/ui/button.tsx` | role-match |
| `test/fixtures/expo-basic/app/components/Button.ios.tsx` | fixture | — | `test/fixtures/parser/resolver/shadcn-barrel/src/components/ui/button.tsx` | role-match |
| `test/fixtures/expo-basic/app/components/Button.android.tsx` | fixture | — | `test/fixtures/parser/resolver/shadcn-barrel/src/components/ui/button.tsx` | role-match |
| `test/fixtures/expo-basic/node_modules/react-native/package.json` | config | — | none (first stub in project) | no-analog |
| `test/fixtures/expo-basic/node_modules/react-native/index.d.ts` | config | — | none (first stub in project) | no-analog |
| `test/fixtures/expo-basic/node_modules/expo-router/package.json` | config | — | none (first stub in project) | no-analog |
| `test/fixtures/expo-basic/node_modules/expo-router/index.d.ts` | config | — | none (first stub in project) | no-analog |
| `test/fixtures/expo-tabs-and-dynamic/tsconfig.json` | config | — | `test/fixtures/parser/resolver/shadcn-barrel/tsconfig.json` | exact |
| `test/fixtures/expo-tabs-and-dynamic/app/_layout.tsx` | fixture | — | `test/fixtures/next-app-router/app/layout.tsx` | role-match |
| `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/_layout.tsx` | fixture | — | `test/fixtures/next-app-router/app/dashboard/layout.tsx` | role-match |
| `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx` | fixture | — | `test/fixtures/next-app-router/app/page.tsx` | role-match |
| `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/[id].tsx` | fixture | — | `test/fixtures/next-app-router/app/blog/[slug]/page.tsx` | role-match |
| `test/fixtures/expo-tabs-and-dynamic/app/+not-found.tsx` | fixture | — | `test/fixtures/next-app-router/app/page.tsx` | partial-match |
| `test/fixtures/expo-tabs-and-dynamic/app/components/Button.ios.tsx` | fixture | — | `test/fixtures/parser/resolver/shadcn-barrel/src/components/ui/button.tsx` | role-match |
| `test/fixtures/expo-tabs-and-dynamic/app/components/Button.android.tsx` | fixture | — | `test/fixtures/parser/resolver/shadcn-barrel/src/components/ui/button.tsx` | role-match |
| `test/fixtures/expo-tabs-and-dynamic/node_modules/react-native/` + `expo-router/` stubs | config | — | expo-basic stubs (created in same wave) | exact |

---

## Pattern Assignments

### `test/core/resolver/expo-stubs.test.ts` (test, request-response)

**Analog:** `test/core/resolver/barrel.test.ts` (lines 1–49)

**Imports pattern** (analog lines 1–4):
```typescript
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ParseContext } from "../../../src/adapters/types.js";
import { resolveModule } from "../../../src/core/resolver/index.js";
```

**ctxFor helper pattern** (analog lines 6–14):
```typescript
function ctxFor(rootRel: string): ParseContext {
  return {
    resolvedRoot: path.resolve(rootRel),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}
```

**Core test pattern — bare specifier external assertion** (analog lines 16–49, adapted for Expo):
```typescript
describe("INTEG-02 expo stub external classification", () => {
  it("classifies react-native as external from expo-basic", () => {
    const ctx = ctxFor("test/fixtures/expo-basic");
    const fromFile = path.resolve("test/fixtures/expo-basic/app/_layout.tsx");
    const r = resolveModule(ctx, fromFile, "react-native", "View");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("external");
      expect(r.packageName).toBe("react-native");
    }
  });
});
```

**Key constraints from analogs:**
- `tsconfig: null` is correct — bare specifiers never reach tsconfig path step
- `fromFile` must point to a real fixture file (barrel.test.ts line 19 uses real path)
- Do NOT assert `r.absolutePath` — external results have no `absolutePath` field
- Do NOT assert `r.absolutePath.includes("\\")` — that check is only for `kind: "local"` results (barrel.test.ts line 24)

**describe label convention** (barrel.test.ts line 16): Use the SPEC requirement ID as the describe string prefix: `"INTEG-02 ..."`.

**Test structure for both fixtures:** Mirror each test pair (react-native, expo-router) for both `expo-basic` and `expo-tabs-and-dynamic`. Four `it()` blocks total in the core `describe`, plus optional filesystem existence checks for INTEG-01.

---

### `test/fixtures/expo-basic/tsconfig.json` + `test/fixtures/expo-tabs-and-dynamic/tsconfig.json` (config)

**Analog:** `test/fixtures/parser/resolver/shadcn-barrel/tsconfig.json` (lines 1–6)

**Exact pattern to copy, with alias target changed** (D-03 locked decision: `app/*` not `src/*`):
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["app/*"] }
  }
}
```

The analog uses `"src/*"` because the shadcn-barrel fixture has a `src/` directory. The Expo fixtures have no `src/` — only `app/` — so the target is `"app/*"`. No other fields (`jsx`, `module`, `strict`) are added.

---

### `test/fixtures/expo-basic/app/_layout.tsx` (fixture, root layout)

**Analog:** `test/fixtures/next-app-router/app/layout.tsx` (lines 1–3)

**Analog content:**
```typescript
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}
```

**Adapted pattern** — same minimal shape but use `Slot` from expo-router instead of children passthrough (REQ-1 acceptance criterion):
```typescript
import { Slot } from "expo-router";
export default function RootLayout() {
  return <Slot />;
}
```

**Fixture file conventions observed in analogs:**
- No `"use client"` directive (Next.js fixtures don't use it either — not needed here)
- Single named default export function
- No import of React explicitly (JSX transform assumed)
- Minimal: 1 import + 1 return statement (D-04 locked decision)

---

### `test/fixtures/expo-basic/app/index.tsx` (fixture, screen)

**Analog:** `test/fixtures/next-app-router/app/page.tsx` (line 1)

**Analog content:**
```typescript
export default function Home() { return <div>home</div>; }
```

**Adapted pattern** — replace HTML element with react-native primitive:
```typescript
import { View, Text } from "react-native";
export default function HomeIndex() {
  return <View><Text>Home</Text></View>;
}
```

---

### `test/fixtures/expo-basic/app/components/HomeScreen.tsx` (fixture, component with StyleSheet)

**Analog:** `test/fixtures/parser/resolver/shadcn-barrel/src/components/ui/button.tsx` (lines 1–3)

**Analog content:**
```typescript
export function Button() {
  return <button>x</button>;
}
```

**Adapted pattern** — add StyleSheet.create import and usage (REQ-1: "uses `StyleSheet.create` from `react-native`"):
```typescript
import { View, Text, StyleSheet } from "react-native";
const styles = StyleSheet.create({ container: { padding: 16 } });
export default function HomeScreen() {
  return <View style={styles.container}><Text>HomeScreen</Text></View>;
}
```

---

### `test/fixtures/expo-basic/app/components/Button.ios.tsx` + `Button.android.tsx` (fixture, platform-suffix pair)

**Analog:** `test/fixtures/parser/resolver/shadcn-barrel/src/components/ui/button.tsx` (lines 1–3)

**Pattern — minimal named export returning `<View />`** (REQ-6: "valid TypeScript React Native components ... minimal: a single named export returning `<View />`"):
```typescript
import { View } from "react-native";
export default function Button() {
  return <View />;
}
```

Both `Button.ios.tsx` and `Button.android.tsx` use this identical pattern. Platform suffix is in the filename only — no conditional logic inside the file.

---

### `test/fixtures/expo-basic/node_modules/react-native/package.json` (stub config)

**No analog** — first stub `package.json` in the project. Pattern derived from D-03 locked decision (CONTEXT.md):

```json
{
  "name": "react-native",
  "version": "0.0.0",
  "main": "index.js"
}
```

The `expo-router` variant changes only the `"name"` field.

---

### `test/fixtures/expo-basic/node_modules/react-native/index.d.ts` (stub type declaration)

**No analog** — first stub `index.d.ts` in the project. Pattern derived from D-02 locked decision (shared `StyleProps` interface):

```typescript
import * as React from "react";

interface StyleProps {
  className?: string;
  style?: any;
}

export declare const View: React.ComponentType<StyleProps & { children?: React.ReactNode }>;
export declare const Text: React.ComponentType<StyleProps & { children?: React.ReactNode }>;
export declare const ScrollView: React.ComponentType<StyleProps & { children?: React.ReactNode }>;
export declare const TouchableOpacity: React.ComponentType<
  StyleProps & { children?: React.ReactNode; onPress?: () => void }
>;
export declare const Pressable: React.ComponentType<
  StyleProps & { children?: React.ReactNode; onPress?: () => void }
>;

export declare const StyleSheet: {
  create<T extends Record<string, any>>(styles: T): T;
};

export declare type StyleProp<T> = T | T[] | null | undefined;
export declare type ViewStyle = { [key: string]: any };
export declare type TextStyle = { [key: string]: any };
```

**Constraint (REQ-3):** Export only types actually imported in that fixture's files. Both fixtures import the same set (View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle, TextStyle), so both stubs can share this shape.

---

### `test/fixtures/expo-basic/node_modules/expo-router/index.d.ts` (stub type declaration)

**No analog.** Pattern derived from D-02 + SPEC REQ-4:

```typescript
import * as React from "react";

export declare const Slot: React.ComponentType<{ children?: React.ReactNode }>;
export declare const Link: React.ComponentType<{ href: string; children?: React.ReactNode }>;

export interface TabsComponent extends React.ComponentType<{ children?: React.ReactNode }> {
  Screen: React.ComponentType<{ name: string; options?: Record<string, any> }>;
}
export declare const Tabs: TabsComponent;

export interface StackComponent extends React.ComponentType<{ children?: React.ReactNode }> {
  Screen: React.ComponentType<{ name: string; options?: Record<string, any> }>;
}
export declare const Stack: StackComponent;
```

**Why `interface` approach instead of `namespace`:** RESEARCH.md Pitfall 3 warns that `declare namespace Tabs { ... }` + `declare const Tabs: ... & typeof Tabs` can trigger TypeScript circular reference errors. The `interface extends ComponentType` pattern is simpler and avoids declaration merging issues.

---

### `test/fixtures/expo-tabs-and-dynamic/app/_layout.tsx` (fixture, root layout)

Same pattern as `expo-basic/app/_layout.tsx` — root layout with `<Slot />`.

---

### `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/_layout.tsx` (fixture, tab group layout — NativeWind className)

**Analog:** `test/fixtures/next-app-router/app/dashboard/layout.tsx` (lines 1–3) — nested layout pattern.

**Analog content:**
```typescript
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
```

**Adapted pattern** — uses `<Tabs>` from expo-router (REQ-2: "tab group using `<Tabs>` from `expo-router`"). This is the file that carries NativeWind `className` usage (planner discretion from CONTEXT.md):
```typescript
import { Tabs } from "expo-router";
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="[id]" options={{ title: "Detail" }} />
    </Tabs>
  );
}
```

---

### `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx` (fixture, tab screen — style array)

**Analog:** `test/fixtures/next-app-router/app/page.tsx`.

**Adapted pattern** — this file carries the style array syntax (REQ-2 + planner discretion from CONTEXT.md):
```typescript
import { View, Text, StyleSheet } from "react-native";
const styles = StyleSheet.create({ card: { padding: 8 }, bold: { fontWeight: "bold" } });
export default function HomeTab({ active }: { active?: boolean }) {
  return (
    <View style={[styles.card, active && styles.bold]}>
      <Text className="text-lg font-bold">Home</Text>
    </View>
  );
}
```

Note: `className` on `<Text>` here also covers the NativeWind usage (REQ-2 acceptance criterion: "at least one file uses NativeWind `className` prop"). This concentrates both syntax patterns in one file.

---

### `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/[id].tsx` (fixture, dynamic segment)

**Analog:** `test/fixtures/next-app-router/app/blog/[slug]/page.tsx` — dynamic segment screen.

**Adapted pattern** — minimal dynamic screen:
```typescript
import { View, Text } from "react-native";
export default function DetailScreen() {
  return <View><Text>Detail</Text></View>;
}
```

---

### `test/fixtures/expo-tabs-and-dynamic/app/+not-found.tsx` (fixture, special file)

**Analog:** `test/fixtures/next-app-router/app/page.tsx` (partial match — special files have no direct analog).

**Adapted pattern** — minimal special file, valid TSX:
```typescript
import { View, Text } from "react-native";
export default function NotFound() {
  return <View><Text>Not Found</Text></View>;
}
```

---

## Shared Patterns

### ctxFor() Helper
**Source:** `test/core/resolver/barrel.test.ts` lines 6–14
**Apply to:** `test/core/resolver/expo-stubs.test.ts`
```typescript
function ctxFor(rootRel: string): ParseContext {
  return {
    resolvedRoot: path.resolve(rootRel),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}
```
Do not inline this — define once at top of test file, call with relative path string.

### Minimal Fixture File Shape
**Source:** `test/fixtures/next-app-router/app/page.tsx` (line 1) + `test/fixtures/parser/resolver/shadcn-barrel/src/page.tsx` (lines 1–4)
**Apply to:** All fixture `.tsx` files
- 1 import statement (or as few as needed)
- 1 default export function
- 1 return statement
- No comments, no extra whitespace
- No explicit `React` import (JSX transform assumed)

### Stub package.json Shape
**Source:** D-03 locked decision (CONTEXT.md)
**Apply to:** All four stub `package.json` files
```json
{ "name": "<package-name>", "version": "0.0.0", "main": "index.js" }
```

### tsconfig Alias Pattern
**Source:** `test/fixtures/parser/resolver/shadcn-barrel/tsconfig.json` lines 1–6
**Apply to:** Both fixture `tsconfig.json` files, with `app/*` instead of `src/*`
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["app/*"] }
  }
}
```

### Test Assertion Safety (no backslash checks on external results)
**Source:** `test/core/resolver/barrel.test.ts` line 24 (backslash check is inside `kind === "local"` branch)
**Apply to:** `test/core/resolver/expo-stubs.test.ts`

External results (`kind: "external"`) have no `absolutePath` field. Only assert:
- `r.ok === true`
- `r.kind === "external"`
- `r.packageName === "react-native"` / `"expo-router"`

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `node_modules/react-native/package.json` (both fixtures) | config | — | No existing fixture in project has local stub node_modules; this is the first |
| `node_modules/react-native/index.d.ts` (both fixtures) | config | — | No TypeScript stub declaration files exist anywhere in test fixtures |
| `node_modules/expo-router/package.json` (both fixtures) | config | — | Same as react-native — first stub packages in project |
| `node_modules/expo-router/index.d.ts` (both fixtures) | config | — | Same as react-native — first stub declaration files in project |

For these files, the planner should use the concrete patterns specified in the **Pattern Assignments** sections above (derived from locked decisions D-02, D-03 in CONTEXT.md and verified against SPEC REQ-3, REQ-4).

---

## Metadata

**Analog search scope:** `test/core/resolver/`, `test/fixtures/`
**Files scanned:** 10 existing files read directly
**Pattern extraction date:** 2026-05-13
