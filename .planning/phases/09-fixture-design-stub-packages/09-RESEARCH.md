# Phase 9: Fixture Design & Stub Packages — Research

**Researched:** 2026-05-13
**Domain:** Test fixture authoring, TypeScript stub packages, resolver smoke testing
**Confidence:** HIGH

## Summary

Phase 9 là một phase hoàn toàn "fixtures + test only" — không có thay đổi nào trong `src/`. Nhiệm vụ là tạo hai fixture directory trees (`expo-basic` và `expo-tabs-and-dynamic`) với stubbed `node_modules`, tsconfigs, và một smoke test file.

Điều quan trọng nhất cần hiểu: **stubs không cần thiết để resolver trả về `kind: "external"`**. `packageNameFromSpecifier("react-native")` đã trả về `"react-native"` mà không cần bất kỳ stub nào — bởi vì hàm này chỉ kiểm tra cú pháp của specifier, không truy cập filesystem. Stubs chỉ cần thiết để TypeScript compile được fixture files mà không có lỗi.

Test count hiện tại: **356 tests green** (không phải 353 như SPEC.md ghi — đã tăng trong v1.1). Acceptance criterion nên được hiểu là "≥353" tức là không có regression.

**Primary recommendation:** Tạo fixture files và stubs theo đúng các pattern được document trong CONTEXT.md (D-01 đến D-04). Smoke test đặt tại `test/core/resolver/expo-stubs.test.ts` (matching existing resolver test pattern), sử dụng `ctxFor()` + `resolveModule()` như barrel.test.ts.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Smoke test tại `test/core/resolver/expo-stubs.test.ts` — matches existing resolver test pattern
- **D-02:** Extend `react-native` stub's `index.d.ts` với `className?: string` trên tất cả components có `style` prop; dùng shared `interface StyleProps { className?: string; style?: any }` — không cần `nativewind` stub riêng; không dùng `@ts-expect-error`
- **D-03:** Minimal tsconfig — chỉ `baseUrl: "."` và `paths: { "@/*": ["app/*"] }`. Cả hai fixtures dùng `./app/*` (không có `src/` subdir)
- **D-04:** Minimal file content — đủ imports + 1 return statement. Focus là TypeScript validity và import coverage

### Claude's Discretion

- Exact stub `package.json` fields — dùng: `{ "name": "...", "version": "0.0.0", "main": "index.js" }`
- File nào trong `expo-tabs-and-dynamic` carry NativeWind `className` usage và file nào carry style array syntax
- Component names — keep simple (e.g., `HomeScreen`, `TabsLayout`)

### Deferred Ideas (OUT OF SCOPE)

Không có deferred ideas từ discussion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INTEG-01 | Two Expo Router fixtures: `expo-basic` (Slot + screen + StyleSheet.create) và `expo-tabs-and-dynamic` (tabs + dynamic + not-found + NativeWind + style array) | Fixture file patterns verified từ existing next-app-router fixture; minimal content pattern confirmed |
| INTEG-02 | Both fixtures ship stubbed `react-native` + `expo-router` package.json + minimal index.d.ts; resolver returns `kind: "external"` | `packageNameFromSpecifier` logic verified — bare specifier path triggers external classification without filesystem access; stubs serve TypeScript validity only |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fixture file content | Filesystem (test/fixtures/) | — | Static files — no runtime, no src/ involvement |
| Stub packages (react-native, expo-router) | Filesystem (node_modules/ inside fixtures) | — | TypeScript type stubs only; no real package code |
| Resolver classification (`kind: "external"`) | API/Core (`src/core/resolver/node-modules.ts`) | — | Logic already exists; stubs do not change it |
| Smoke test | Test layer (`test/core/resolver/`) | — | Direct resolver invocation — no binary spawn |

## Standard Stack

### Core (already installed — no new deps needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | `^4.3.6` | Test runner | Already in project; `test/**/*.test.ts` glob includes new test file automatically |
| `@babel/parser` | `^7.29.2` | Không dùng trực tiếp trong phase này | Existing resolver uses it internally |
| TypeScript | `^5.20.1` | Validates fixture files compile | Already installed |

### No new dependencies required

Phase 9 không cần install thêm bất kỳ package nào. Tất cả fixtures là static files (`.tsx`, `.json`, `.d.ts`); smoke test dùng existing vitest + resolver APIs.

**Installation:** N/A — không cần chạy install command

## Architecture Patterns

### System Architecture Diagram

```
Smoke test (test/core/resolver/expo-stubs.test.ts)
  |
  |-- ctxFor("test/fixtures/expo-basic") --> ParseContext
  |-- resolveModule(ctx, fromFile, "react-native", "View")
  |                                              |
  |                              src/core/resolver/index.ts
  |                                              |
  |                              packageNameFromSpecifier("react-native")
  |                              --> returns "react-native" (bare specifier, no . or / or # prefix)
  |                                              |
  |                              return { ok: true, kind: "external", packageName: "react-native" }
  |
  |-- assert result.ok === true
  |-- assert result.kind === "external"
  |-- assert result.packageName === "react-native"
```

**Key insight:** The resolver classifies bare specifiers as external BEFORE doing any filesystem I/O. Stubs exist for TypeScript validity only — not for resolver behavior.

### Recommended Project Structure

```
test/fixtures/
├── expo-basic/
│   ├── tsconfig.json                    # { baseUrl: ".", paths: { "@/*": ["app/*"] } }
│   ├── node_modules/
│   │   ├── react-native/
│   │   │   ├── package.json             # { name, version: "0.0.0", main: "index.js" }
│   │   │   └── index.d.ts               # exports View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle, TouchableOpacity
│   │   └── expo-router/
│   │       ├── package.json             # { name, version: "0.0.0", main: "index.js" }
│   │       └── index.d.ts               # exports Slot, Tabs, Stack, Link
│   └── app/
│       ├── _layout.tsx                  # import { Slot } from "expo-router"
│       ├── index.tsx                    # screen component
│       └── components/
│           ├── HomeScreen.tsx           # StyleSheet.create usage
│           ├── Button.ios.tsx           # <View /> minimal
│           └── Button.android.tsx      # <View /> minimal
└── expo-tabs-and-dynamic/
    ├── tsconfig.json                    # same minimal shape
    ├── node_modules/
    │   ├── react-native/                # same stub
    │   └── expo-router/                 # same stub
    └── app/
        ├── _layout.tsx                  # root layout
        ├── +not-found.tsx               # special file
        ├── (tabs)/
        │   ├── _layout.tsx              # <Tabs> from expo-router; NativeWind className usage
        │   ├── index.tsx                # style array syntax
        │   └── [id].tsx                 # dynamic segment screen
        └── components/
            ├── Button.ios.tsx
            └── Button.android.tsx
```

### Pattern 1: ctxFor() helper — existing pattern to reuse

**What:** Builds a `ParseContext` từ relative root path, với tsconfig: null (resolver sẽ auto-load từ fixture's own tsconfig nếu cần — nhưng với bare specifiers, tsconfig không cần thiết)
**When to use:** Mọi resolver test

```typescript
// Source: test/core/resolver/barrel.test.ts (VERIFIED)
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

**Note:** `tsconfig: null` là đúng — resolver trong `getPathsMatcher()` sẽ tự load tsconfig từ `resolvedRoot` nếu cần. Nhưng với bare specifiers (`react-native`, `expo-router`), code không bao giờ đến step đó.

### Pattern 2: resolveModule() call cho bare specifier

**What:** Gọi resolver trực tiếp với bare specifier; expect external classification
**When to use:** Smoke test cho Expo stubs

```typescript
// Source: derived from barrel.test.ts + node-modules.ts code reading (VERIFIED)
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
      expect(r.packageName).toBe("react-native");
    }
  });

  it("classifies expo-router as external from expo-basic", () => {
    const ctx = ctxFor("test/fixtures/expo-basic");
    const fromFile = path.resolve("test/fixtures/expo-basic/app/_layout.tsx");
    const r = resolveModule(ctx, fromFile, "expo-router", "Slot");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("external");
      expect(r.packageName).toBe("expo-router");
    }
  });
  // Mirror tests for expo-tabs-and-dynamic...
});
```

### Pattern 3: Minimal tsconfig — canonical pattern

**What:** Chỉ `baseUrl` + `paths`, không có jsx/module/strict settings
**When to use:** Mọi fixture cần alias resolution

```json
// Source: test/fixtures/parser/resolver/shadcn-barrel/tsconfig.json (VERIFIED)
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["app/*"] }
  }
}
```

**Note từ D-03 (locked):** Cả hai fixtures không có `src/` subdir → alias target là `app/*` không phải `src/*`.

### Pattern 4: Stub package.json

```json
// Source: D-03 decision in CONTEXT.md (VERIFIED — locked decision)
{
  "name": "react-native",
  "version": "0.0.0",
  "main": "index.js"
}
```

### Pattern 5: Minimal stub index.d.ts với shared StyleProps

**What:** Shared interface cho NativeWind `className` support — D-02 locked decision

```typescript
// Source: D-02 decision (VERIFIED — locked)
interface StyleProps {
  className?: string;
  style?: any;
}

export declare const View: React.ComponentType<StyleProps & { children?: React.ReactNode }>;
export declare const Text: React.ComponentType<StyleProps & { children?: React.ReactNode }>;
export declare const ScrollView: React.ComponentType<StyleProps & { children?: React.ReactNode }>;
export declare const TouchableOpacity: React.ComponentType<StyleProps & { children?: React.ReactNode; onPress?: () => void }>;
export declare const Pressable: React.ComponentType<StyleProps & { children?: React.ReactNode; onPress?: () => void }>;

export declare const StyleSheet: {
  create<T extends Record<string, any>>(styles: T): T;
};

export declare type StyleProp<T> = T | T[] | null | undefined;
export declare type ViewStyle = { [key: string]: any };
export declare type TextStyle = { [key: string]: any };
```

### Pattern 6: expo-router stub index.d.ts

```typescript
// Source: SPEC.md REQ-4 + D-02 decision (VERIFIED)
import * as React from "react";

export declare const Slot: React.ComponentType<{}>;
export declare const Link: React.ComponentType<{ href: string; children?: React.ReactNode }>;

export declare namespace Tabs {
  const Screen: React.ComponentType<{ name: string; options?: Record<string, any> }>;
}
export declare const Tabs: React.ComponentType<{ children?: React.ReactNode }> & typeof Tabs;

export declare namespace Stack {
  const Screen: React.ComponentType<{ name: string; options?: Record<string, any> }>;
}
export declare const Stack: React.ComponentType<{ children?: React.ReactNode }> & typeof Stack;
```

### Pattern 7: Fixture file content — NativeWind className và style array

```typescript
// expo-tabs-and-dynamic/app/(tabs)/_layout.tsx — NativeWind className usage
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

```typescript
// expo-tabs-and-dynamic/app/(tabs)/index.tsx — style array syntax
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

### Anti-Patterns to Avoid

- **Quá rộng trong stub exports:** Chỉ export types thực sự được import trong fixture files — SPEC constraint (REQ-3). Không copy toàn bộ react-native type definitions.
- **`@ts-expect-error` comments:** D-02 locked — không dùng. Stub phải đủ để TypeScript happy mà không cần workarounds.
- **`tsconfig: null` trong ctxFor cho alias tests:** Nếu test muốn verify `@/` alias resolution (không phải bare specifiers), cần đảm bảo ctx có thể load tsconfig. Với bare specifiers, `tsconfig: null` hoàn toàn OK — xem `resolveSpecifierToFile` flow: tsconfig paths chỉ được check trước relative và bare specifier logic, nếu specifier không match bất kỳ alias nào thì fall through đến step 3.
- **Đặt smoke test ở `test/resolver/` (SPEC.md gốc):** D-01 locked — phải ở `test/core/resolver/expo-stubs.test.ts`, không phải `test/resolver/`.
- **Platform-suffix logic trong Phase 9:** Nằm trong Phase 14 — chỉ cần tạo file pairs, không implement resolver fallback.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript validation của fixture files | Manual type checking | TypeScript compiler với stub `index.d.ts` | Stubs là cơ chế chuẩn — TypeScript sẽ auto-pick-up local `node_modules` |
| Package name extraction logic | Custom string parsing | `packageNameFromSpecifier` từ `src/core/resolver/node-modules.ts` | Đã implemented và tested; smoke test chỉ cần verify behavior |
| Fixture discovery | Glob/find | Direct `path.resolve()` với hardcoded paths | Resolver tests luôn dùng absolute paths với `path.resolve()` — kiên định với pattern |

## Common Pitfalls

### Pitfall 1: TypeScript không pick up local node_modules stubs
**What goes wrong:** TypeScript compiler không resolve `react-native` từ fixture's local `node_modules/` — vẫn báo "Cannot find module 'react-native'"
**Why it happens:** TypeScript cần biết `moduleResolution` và `baseUrl`. Minimal tsconfig thiếu `"moduleResolution": "node"` — nhưng default của TypeScript là `"node"` khi không specify, nên thường OK. Vấn đề thực tế hơn: nếu fixture không có `tsconfig.json` ở root, tsc có thể không apply đúng context.
**How to avoid:** Đảm bảo mỗi fixture có `tsconfig.json` ở root (ngay cạnh `node_modules/`). TypeScript's module resolution algorithm tìm `node_modules` từ file location đi lên — stub tại `test/fixtures/expo-basic/node_modules/react-native/` sẽ được tìm thấy khi type-checking files trong `test/fixtures/expo-basic/`.
**Warning signs:** `tsc --noEmit` trên fixture files báo lỗi về `react-native`

### Pitfall 2: Smoke test cần fixture files tồn tại trên disk
**What goes wrong:** `resolveModule` với bare specifier (`react-native`) KHÔNG cần fixture files tồn tại — nó classify ngay từ specifier syntax. Nhưng nếu test dùng `fromFile` path trỏ đến file không tồn tại, có thể gây confusion về test validity.
**Why it happens:** `fromFile` trong resolver tests là chỉ context cho relative path resolution — với bare specifiers, fromFile không được đọc.
**How to avoid:** Trong smoke test, `fromFile` PHẢI trỏ đến một file thực sự tồn tại trong fixture (ví dụ `app/_layout.tsx`) để test phản ánh real-world usage. Nếu file không tồn tại, test vẫn pass (vì bare specifier logic không touch filesystem) nhưng test sẽ kém ý nghĩa.
**Warning signs:** Test pass với `fromFile = "/nonexistent/path"` — sign là test không cover đúng real case

### Pitfall 3: expo-router `Tabs` type conflict khi dùng namespace + named export
**What goes wrong:** `export declare const Tabs: ... & typeof Tabs` cần namespace `Tabs` khai báo trước. TypeScript có thể báo circular reference.
**Why it happens:** Kỹ thuật `declare namespace X { ... }` + `declare const X: ... & typeof X` là cách chuẩn cho React components với sub-components, nhưng order và declaration merging cần chính xác.
**How to avoid:** Khai báo namespace trước const; nếu vẫn có lỗi, dùng interface approach: `export interface TabsComponent extends React.ComponentType<...> { Screen: React.ComponentType<...> }; export declare const Tabs: TabsComponent;`
**Warning signs:** TypeScript error "Namespace 'Tabs' has no exported member" hoặc circular reference warning

### Pitfall 4: `vitest.config.ts` include glob và test location
**What goes wrong:** Smoke test không được pick up bởi vitest
**Why it happens:** `vitest.config.ts` có `include: ["test/**/*.test.ts"]` — bất kỳ file `.test.ts` nào trong `test/` sẽ được include. KHÔNG có exclusion glob nào cho `fixtures/`.
**How to avoid:** Đặt test tại `test/core/resolver/expo-stubs.test.ts` — đúng pattern (không phải trong `fixtures/`). Fixtures chỉ chứa `.tsx`, `.json`, `.d.ts` — không có `.test.ts`.
**Warning signs:** `vitest run` không list test file mới

### Pitfall 5: Windows forward-slash mandate
**What goes wrong:** `absolutePath.includes("\\")` assertion fails nếu fixture paths không được normalize
**Why it happens:** Project có strict forward-slash mandate — `toForwardSlash()` được apply ở mọi emission site trong resolver. Nhưng `path.resolve()` trên Windows trả về backslashes.
**How to avoid:** Smoke test chỉ assert `kind === "external"` và `packageName` — không assert `absolutePath` vì external results không có absolutePath. Với local results (nếu test any), dùng `r.absolutePath.includes("\\")` check như trong existing tests.
**Warning signs:** Test failures trên Windows với backslash-related assertions

## Code Examples

### Verified existing patterns

#### barrel.test.ts — canonical ctxFor + resolveModule pattern
```typescript
// Source: test/core/resolver/barrel.test.ts (VERIFIED — read directly)
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
```

#### node-modules.ts — how external classification works
```typescript
// Source: src/core/resolver/node-modules.ts (VERIFIED — read directly)
export function packageNameFromSpecifier(specifier: string): string | null {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("@/") ||
    specifier.startsWith("~/") ||
    specifier.startsWith("#")
  ) {
    return null;  // aliases and relatives are NOT bare specifiers
  }
  const segs = specifier.split("/");
  const first = segs[0];
  if (!first) return null;
  if (first.startsWith("@") && segs.length >= 2) return `${first}/${segs[1]}`;
  return first;
}
// "react-native" → "react-native" (no prefix match → not null → return "react-native")
// "expo-router" → "expo-router"
// "@expo/vector-icons" → "@expo/vector-icons" (scoped package)
```

#### resolver/index.ts — flow for bare specifiers
```typescript
// Source: src/core/resolver/index.ts lines 109-113 (VERIFIED — read directly)
// Step 3 in resolveSpecifierToFile():
// 3. Bare specifier — node_modules without resolution (D-12 external).
const pkg = packageNameFromSpecifier(specifier);
if (pkg) return { ok: true, kind: "external", packageName: pkg };
```

**Key insight:** `packageNameFromSpecifier` is called in step 3, AFTER tsconfig paths check (step 1) and relative path check (step 2). Since `react-native` does not start with `.`, `/`, `@/`, `~/`, or `#`, it always reaches step 3 and returns `{ ok: true, kind: "external", packageName: "react-native" }`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixtures không có node_modules stubs | Expo fixtures cần local stubs cho TS validity | Phase 9 (now) | First time project adds stub packages to fixtures |
| Next.js only fixtures | Multi-framework fixtures | Phase 9 (now) | Establishes pattern for Phases 10–15 |

**Note:** Existing `test/fixtures/next-app-router/` không có `node_modules/` stubs vì Next.js components không import từ external packages trong fixture files — chỉ có plain HTML elements.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | TypeScript sẽ auto-pick-up `node_modules/react-native/index.d.ts` từ fixture's local `node_modules/` khi type-checking files trong fixture | Pitfall 1, Code Examples | Nếu sai: TypeScript errors trong fixture files; workaround là add `"typeRoots"` vào tsconfig |
| A2 | `tsconfig: null` trong `ctxFor()` đủ cho smoke test với bare specifiers — resolver không cần load tsconfig để classify externals | Code Examples | Nếu sai: `getPathsMatcher(ctx)` với null tsconfig returns null matcher, falls through to bare specifier step; đây là safe assumption nhìn vào code |

**A2 là LOW risk** — đọc trực tiếp `getPathsMatcher` sẽ confirm, nhưng từ `resolver/index.ts` code flow đã rõ: nếu `matcher` là null thì step 1 skip, specifier đến step 3 ngay.

## Open Questions (RESOLVED)

1. **TypeScript strict mode cho fixture files**
   - What we know: Fixtures dùng minimal tsconfig (không có `"strict": true`)
   - What's unclear: TypeScript sẽ type-check fixture files như thế nào trong context của `tsc --noEmit` trên toàn project
   - Recommendation: Smoke test chỉ dùng `vitest run` (không có tsc type-check step trong acceptance criteria); fixtures chỉ cần đủ valid để không gây runtime errors trong resolver — TypeScript strict compliance là nice-to-have
   - RESOLVED: Smoke test dùng `vitest run` only; `tsc --noEmit` được đặt trong Manual-Only Verifications của VALIDATION.md. CONTEXT.md D-03 xác nhận minimal tsconfig không có strict. Fixtures chỉ cần TypeScript validity đủ để resolver không crash, không yêu cầu strict compliance.

2. **Namespace declaration merging cho Tabs/Stack**
   - What we know: `declare namespace Tabs { const Screen: ... }` + `declare const Tabs: ...` pattern cần careful ordering
   - What's unclear: Có thể có TypeScript declaration merging issues với complex intersection types
   - Recommendation: Dùng simpler interface approach nếu namespace approach gây issues; planner nên pick simplest working shape
   - RESOLVED: Dùng `interface TabsComponent extends React.ComponentType` approach (không dùng namespace/typeof pattern) per CONTEXT.md D-02 và PATTERNS.md. Interface approach tránh TypeScript circular reference issues từ namespace declaration merging. Planner và PATTERNS.md đã implement consistent interface approach.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | vitest, test execution | ✓ | (project requirement >=20) | — |
| vitest | Smoke test execution | ✓ | ^4.3.6 (in package.json) | — |
| TypeScript | Fixture type validity | ✓ | ^5.20.1 (in package.json) | — |

**No missing dependencies** — phase 9 is filesystem + test-only, no new installs needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.3.6 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `vitest run test/core/resolver/expo-stubs.test.ts` |
| Full suite command | `vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTEG-01 | expo-basic fixture files exist với đúng content | smoke (filesystem check) | `vitest run test/core/resolver/expo-stubs.test.ts` | ❌ Wave 0 |
| INTEG-02 | resolver classifies `react-native` và `expo-router` as `kind: "external"` from both fixtures | unit | `vitest run test/core/resolver/expo-stubs.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `vitest run test/core/resolver/expo-stubs.test.ts`
- **Per wave merge:** `vitest run`
- **Phase gate:** `vitest run` exits 0 với ≥356 tests green (hiện tại 356, không phải 353)

### Wave 0 Gaps
- [ ] `test/core/resolver/expo-stubs.test.ts` — covers INTEG-02 và verifies INTEG-01 files exist
- [ ] `test/fixtures/expo-basic/` — entire fixture tree (INTEG-01)
- [ ] `test/fixtures/expo-tabs-and-dynamic/` — entire fixture tree (INTEG-01)

*(No existing test infrastructure covers Expo fixtures — all Wave 0)*

## Security Domain

Phase này là test fixture files và stub packages. Không có:
- Authentication, session management, access control
- User input validation (no MCP tools modified)
- Cryptography
- Network calls

**Security domain: NOT APPLICABLE** — fixture-only phase, zero src/ changes.

## Sources

### Primary (HIGH confidence)
- `test/core/resolver/barrel.test.ts` — VERIFIED: `ctxFor()` helper + `resolveModule()` call pattern
- `test/core/resolver/tsconfig-paths.test.ts` — VERIFIED: same ctxFor pattern, tsconfig fixture testing
- `test/core/resolver/relative.test.ts` — VERIFIED: `probeFile()` usage
- `src/core/resolver/node-modules.ts` — VERIFIED: `packageNameFromSpecifier` và `detectNodeModules` full source
- `src/core/resolver/index.ts` — VERIFIED: `resolveModule()` → `resolveSpecifierToFile()` flow, step 3 bare specifier handling
- `src/adapters/types.ts` — VERIFIED: `ParseContext` shape (5 fields)
- `test/fixtures/parser/resolver/shadcn-barrel/tsconfig.json` — VERIFIED: canonical minimal tsconfig pattern
- `vitest.config.ts` — VERIFIED: `include: ["test/**/*.test.ts"]`, no exclusions for fixtures
- `vitest run` output — VERIFIED: 356 tests currently passing (not 353)
- `test/fixtures/next-app-router/` structure — VERIFIED: no node_modules stubs needed for Next.js fixture

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions D-01 to D-04 — locked by user in discuss-phase session
- SPEC.md requirements REQ-1 to REQ-7 — locked requirements with acceptance criteria

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps, all existing tools verified
- Architecture: HIGH — resolver code read directly, classification flow fully understood
- Pitfalls: HIGH (P1, P4, P5) / MEDIUM (P2, P3) — derived from direct code reading
- Fixture file content: HIGH — patterns from CONTEXT.md locked decisions

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (stable — internal test infrastructure, no external dependencies)
