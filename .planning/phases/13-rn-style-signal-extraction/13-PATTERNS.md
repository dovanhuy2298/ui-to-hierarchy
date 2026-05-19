# Phase 13: RN Style Signal Extraction — Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 8 (3 new core files, 3 new test files, 1 adapter modify, 1 fixture modify)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/styles/rn/stylesheet-create.ts` | utility | transform | `src/core/import-bindings.ts` | exact |
| `src/core/styles/rn/style-prop.ts` | utility | transform | `src/core/extractors/inline-style.ts` | exact |
| `src/core/styles/rn/index.ts` | utility / barrel | transform | `src/core/extractors/inline-style.ts` | role-match |
| `src/adapters/expo/ExpoRouterAdapter.ts` | adapter | request-response | self (existing) | exact |
| `test/core/styles/rn/stylesheet-create.test.ts` | test | — | `test/core/extractors/inline-style.test.ts` | exact |
| `test/core/styles/rn/style-prop.test.ts` | test | — | `test/core/extractors/inline-style.test.ts` | exact |
| `test/core/styles/rn/index.test.ts` | test | — | `test/core/extractors/inline-style.test.ts` | exact |
| `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx` | fixture | — | self (existing) | exact |

---

## Pattern Assignments

### `src/core/styles/rn/stylesheet-create.ts` (utility, transform)

**Analog:** `src/core/import-bindings.ts`

**Imports pattern** (`src/core/import-bindings.ts` lines 16–18):
```typescript
import * as t from "@babel/types";
import { traverse } from "./babel-shim.js";
```

**Island rule comment pattern** (`src/core/import-bindings.ts` lines 1–14):
```typescript
/**
 * Import-binding collection utility (D-04/D-05).
 * ...
 * Island rule: ZERO imports from src/adapters/ — this file is a core utility.
 * traverse must be imported from "./babel-shim.js" (never directly from @babel/traverse).
 */
```

**Core traverse pattern** (`src/core/import-bindings.ts` lines 24–44):
```typescript
export function collectImportBindings(ast: t.File): Map<string, ImportBinding> {
  const out = new Map<string, ImportBinding>();
  traverse(ast, {
    ImportDeclaration(path: { node: t.ImportDeclaration }) {
      const source = path.node.source.value;
      for (const spec of path.node.specifiers) {
        if (t.isImportSpecifier(spec)) {
          const localName = spec.local.name;
          const importedName = t.isIdentifier(spec.imported)
            ? spec.imported.name
            : spec.imported.value;
          out.set(localName, { source, importedName });
        } else if (t.isImportDefaultSpecifier(spec)) {
          out.set(spec.local.name, { source, importedName: "default" });
        }
      }
    },
  });
  return out;
}
```

**Visitor parentPath pattern** — from RESEARCH.md Pattern 1 (verified live):
```typescript
// In CallExpression visitor:
const parent = path.parentPath?.node;
if (!parent || !t.isVariableDeclarator(parent) || !t.isIdentifier(parent.id)) {
  return; // unsupported: not assigned to a variable
}
const varName = parent.id.name;
```

**Key extraction pattern** — from RESEARCH.md Pattern 1 (verified live):
```typescript
for (const prop of arg.properties) {
  if (!t.isObjectProperty(prop) || prop.computed) continue;
  const key = t.isIdentifier(prop.key)
    ? prop.key.name
    : t.isStringLiteral(prop.key)
    ? prop.key.value
    : null;
  if (key) keys.push(key);
}
out.set(varName, keys);
```

**`{ raw }` source-slice pattern** (`src/core/extractors/inline-style.ts` lines 52–56):
```typescript
function sliceSource(source: string, node: t.Node): string {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return source.slice(start, end);
}
```

**Path from new file to babel-shim:** `../../babel-shim.js` (mirrors `import-bindings.ts` → `./babel-shim.js`; from `src/core/styles/rn/` it is `../../babel-shim.js`)

---

### `src/core/styles/rn/style-prop.ts` (utility, transform)

**Analog:** `src/core/extractors/inline-style.ts`

**Imports pattern** (`src/core/extractors/inline-style.ts` lines 1):
```typescript
import * as t from "@babel/types";
```

**Note:** `style-prop.ts` delegates to `extractInlineStyle` — import it:
```typescript
import { extractInlineStyle } from "../../extractors/inline-style.js";
```
Do NOT re-implement. This is a SPEC constraint.

**JSX attribute find pattern** (`src/core/extractors/inline-style.ts` lines 17–21):
```typescript
const attr = jsxElement.openingElement.attributes.find(
  (a): a is t.JSXAttribute =>
    t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === "style",
);
if (!attr || !t.isJSXExpressionContainer(attr.value)) return {};
```

**Adapt for className** — same find pattern with `a.name.name === "className"`.

**Branch-on-value-type pattern** (`src/core/extractors/inline-style.ts` lines 22–25):
```typescript
const expr = attr.value.expression;
if (!t.isObjectExpression(expr)) {
  return { __raw__: { raw: sliceSource(source, expr as t.Node) } };
}
```

**NativeWind — branch on StringLiteral vs JSXExpressionContainer** (from RESEARCH.md Pattern 3):
```typescript
const val = attr.value;
if (t.isStringLiteral(val)) {
  const PLATFORM_VARIANT_RE = /(ios|android|web|native):/g;
  const stripped = val.value.replace(PLATFORM_VARIANT_RE, "");
  return stripped.trim().split(/\s+/).filter(Boolean);
}
if (t.isJSXExpressionContainer(val)) {
  const expr = val.expression;
  if (t.isTaggedTemplateExpression(expr)) {
    warnings.push(
      `NativeWind tw\` \` tagged template not supported — use className string at ${file}:${line}`,
    );
    return [];
  }
}
return [];
```

**Warning channel** — use `warnings: string[]` parameter (never `console.*`). Pattern from `src/adapters/expo/ExpoRouterAdapter.ts` line 236:
```typescript
ctx.warnings.push(`...message at ${fwdFile}:${line}`);
```
In core utilities (island rule), accept `warnings: string[]` as a parameter instead of `ctx`.

---

### `src/core/styles/rn/index.ts` (utility + barrel, transform)

**Analog:** `src/core/extractors/inline-style.ts` (barrel pattern is trivial re-export)

**flattenStyleArray function signature** (from RESEARCH.md Pattern 2):
```typescript
export function flattenStyleArray(
  node: t.JSXExpressionContainer,
  fileStyleIndex: Map<string, string[]>, // varName → keys for current file
  source: string,
  warnings: string[],
  file: string,
): string[] {
  const expr = node.expression;
  if (!t.isArrayExpression(expr)) return [];
  const keys: string[] = [];
  // ...
}
```

**Null element guard — must come FIRST** (RESEARCH.md Pitfall 4):
```typescript
for (const el of expr.elements) {
  if (el === null) continue; // sparse array hole — JS null, not t.NullLiteral
  if (t.isNullLiteral(el) || t.isBooleanLiteral(el)) continue;
  // ...
}
```

**MemberExpression resolution** (from RESEARCH.md Pattern 2):
```typescript
const memberEl =
  t.isMemberExpression(el) ? el :
  t.isLogicalExpression(el) && t.isMemberExpression(el.right) ? el.right :
  null;

if (memberEl && t.isIdentifier(memberEl.object) && t.isIdentifier(memberEl.property)) {
  const varName = memberEl.object.name;
  const indexKeys = fileStyleIndex.get(varName);
  if (indexKeys) {
    keys.push(...indexKeys);
  } else {
    warnings.push(`StyleSheet var '${varName}' not found in index at ${file}`);
  }
  continue;
}
```

**Source-slice for raw fallback** (`src/core/extractors/inline-style.ts` lines 52–56):
```typescript
function sliceSource(source: string, node: t.Node): string {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return source.slice(start, end);
}
```

**Barrel re-exports** — add after function definitions:
```typescript
export { parseStyleSheetCreate } from "./stylesheet-create.js";
export { extractRNInlineStyle, extractNativeWindClassNames } from "./style-prop.js";
```

---

### `src/adapters/expo/ExpoRouterAdapter.ts` (adapter, request-response — MODIFY)

**Analog:** self (existing file)

**Existing imports block** (`ExpoRouterAdapter.ts` lines 1–43):
```typescript
import * as t from "@babel/types";
import type { FrameworkAdapter } from "../FrameworkAdapter.js";
// ... (existing imports)
import { parseFile } from "../../core/parser/index.js";
import { toForwardSlash } from "../../core/paths.js";
import { resolveModule as coreResolveModule } from "../../core/resolver/index.js";
import { traverse } from "../../core/babel-shim.js";
import { collectImportBindings } from "../../core/import-bindings.js";
```

**Add new imports** after existing core imports:
```typescript
import { parseStyleSheetCreate } from "../../core/styles/rn/stylesheet-create.js";
import { extractRNInlineStyle, extractNativeWindClassNames } from "../../core/styles/rn/style-prop.js";
import { flattenStyleArray } from "../../core/styles/rn/index.js";
```

**pendingWarnings pattern** (`ExpoRouterAdapter.ts` lines 101, 193–195):
```typescript
private pendingWarnings: string[] = [];

// At start of extractComponents:
for (const w of this.pendingWarnings) ctx.warnings.push(w);
this.pendingWarnings = [];
```

**toForwardSlash path-key invariant** (`ExpoRouterAdapter.ts` line 199):
```typescript
const fwdFile = toForwardSlash(absPath);
```
Apply this to ALL Map keys in `globalStyleIndex` (RESEARCH.md Pitfall 6).

**parseFile + error handling pattern** (`ExpoRouterAdapter.ts` lines 198–224):
```typescript
const parsed = parseFile(ctx, absPath);
if (parsed.kind === "error") {
  // D-12 (no-throw): surface parse failures as synthetic ComponentDefinition
  out.push({ name: "<parse-error>", file: fwdFile, line: parsed.line, ... });
  continue;
}
```

**Style index build location** — inside the `for (const absPath of entryFiles)` loop, after `parseFile` succeeds:
```typescript
const fileStyleIndex = parseStyleSheetCreate(parsed.ast, parsed.source);
// fileStyleIndex: Map<varName, string[]> for this file
```

**One-hop resolution** — after building `fileStyleIndex`, iterate `bindings` for style-related vars not found in current file:
```typescript
for (const [localName, binding] of bindings) {
  if (fileStyleIndex.has(localName)) continue;
  if (!binding.source.startsWith(".")) continue;
  const resolved = coreResolveModule(ctx, fwdFile, binding.source, binding.importedName);
  if (!resolved.ok || resolved.kind !== "local") continue;
  const targetPath = toForwardSlash(resolved.absolutePath);
  // ... parse target file and call parseStyleSheetCreate
}
```

**buildComponentDefinition call site** (`ExpoRouterAdapter.ts` lines 301–308) — extend signature:
```typescript
const componentDef = this.buildComponentDefinition(
  comp,
  parsed.ast,
  parsed.source,
  fwdFile,
  bindings,
  fileStyleIndex,   // NEW — per-file Map<varName, string[]>
);
```

**buildComponentDefinition existing return structure** (`ExpoRouterAdapter.ts` lines 339–354):
```typescript
return {
  name: comp.name,
  file,
  line: comp.declarationLine,
  kind: comp.kind,
  wrappers: comp.wrappers,
  props,
  textContent,
  renderFlow: processedRenderFlow,
  classNames: [],     // ← fill from extractNativeWindClassNames
  inlineStyles: {},   // ← fill from extractRNInlineStyle
  cssModuleRefs: [],
  styledTemplates: [],
  runtime,
};
```

**Warning push pattern** (`ExpoRouterAdapter.ts` line 236):
```typescript
ctx.warnings.push(`...message at ${fwdFile}:${line}`);
```
For warnings from the core utility functions (which accept `warnings: string[]`), flush their array into `ctx.warnings` after calling them.

---

### `test/core/styles/rn/stylesheet-create.test.ts` (test)

**Analog:** `test/core/extractors/inline-style.test.ts`

**Test file structure** (`test/core/extractors/inline-style.test.ts` lines 1–17):
```typescript
import path from "node:path";
import type * as t from "@babel/types";
import { describe, expect, it } from "vitest";
import type { ParseContext } from "../../../src/adapters/types.js";
import { traverse } from "../../../src/core/babel-shim.js";
import { extractInlineStyle } from "../../../src/core/extractors/inline-style.js";
import { parseFile } from "../../../src/core/parser/index.js";

function ctx(): ParseContext {
  return {
    resolvedRoot: path.resolve("."),
    tsconfig: null,
    astCache: new Map(),
    resolverCache: new Map(),
    warnings: [],
  };
}
```

**Import adaptation for stylesheet-create tests:**
```typescript
import { parseStyleSheetCreate } from "../../../src/core/styles/rn/stylesheet-create.js";
import { parse } from "@babel/parser";
```

**Inline AST construction pattern** — for unit tests, build ASTs inline via `parse()` instead of fixture files when fixtures are small:
```typescript
import { parse } from "@babel/parser";

const ast = parse(`
  import { StyleSheet } from "react-native";
  const styles = StyleSheet.create({ card: { padding: 8 }, bold: { fontWeight: "bold" } });
`, { sourceType: "module", plugins: ["typescript", "jsx"] });

const result = parseStyleSheetCreate(ast, source);
expect(result.get("styles")).toEqual(["card", "bold"]);
```

**describe/it pattern** (`test/core/extractors/inline-style.test.ts` lines 19–41):
```typescript
describe("RN-04 stylesheet-create extractor", () => {
  it("extracts literal keys from StyleSheet.create", () => { ... });
  it("returns empty map for computed argument — RN-08 graceful degradation", () => { ... });
  it("handles one-hop import resolve (caller passes pre-parsed AST)", () => { ... });
});
```

---

### `test/core/styles/rn/style-prop.test.ts` (test)

**Analog:** `test/core/extractors/inline-style.test.ts`

**Import adaptation:**
```typescript
import { extractRNInlineStyle, extractNativeWindClassNames } from "../../../src/core/styles/rn/style-prop.js";
```

**JSXElement extraction helper** (`test/core/extractors/inline-style.test.ts` lines 27–35):
```typescript
let result: Record<string, unknown> = {};
traverse(r.ast, {
  JSXElement(p: { node: t.JSXElement }) {
    if (Object.keys(result).length === 0) {
      result = extractInlineStyle(p.node, r.source);
    }
  },
});
```

**NativeWind test cases:**
```typescript
it("strips platform variants from className string", () => {
  const warnings: string[] = [];
  // build a JSXElement AST node with className="ios:p-4 android:p-2 text-lg"
  // call extractNativeWindClassNames and assert ["p-4", "p-2", "text-lg"]
});

it("emits warning for tw tagged template, returns []", () => {
  const warnings: string[] = [];
  // build JSXElement with className={tw`text-lg`}
  // assert warnings.length === 1 && result.length === 0
});
```

---

### `test/core/styles/rn/index.test.ts` (test)

**Analog:** `test/core/extractors/inline-style.test.ts`

**Import adaptation:**
```typescript
import { flattenStyleArray } from "../../../src/core/styles/rn/index.js";
import * as t from "@babel/types";
import { parse } from "@babel/parser";
```

**flattenStyleArray test structure** — requires ≥ 8 cases (from RESEARCH.md):
```typescript
describe("RN-06 flattenStyleArray", () => {
  it("resolves MemberExpression styles.card → keys", () => { ... });
  it("resolves && conditional styles.bold → keys included", () => { ... });
  it("resolves || conditional styles.b → keys included", () => { ... });
  it("passes StringLiteral element through as-is", () => { ... });
  it("skips null and boolean elements", () => { ... });
  it("emits warning for CallExpression element, returns no key", () => { ... });
  it("warns on nested ArrayExpression element, skips it", () => { ... });
  it("warns when varName not found in fileStyleIndex", () => { ... });
});
```

---

### `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx` (fixture — MODIFY)

**Current content** (lines 1–9):
```tsx
import { View, Text, StyleSheet } from "react-native";
const styles = StyleSheet.create({ card: { padding: 8 }, bold: { fontWeight: "bold" } });
export default function HomeTab({ active }: { active?: boolean }) {
  return (
    <View style={[styles.card, active && styles.bold]}>
      <Text style={{ fontWeight: "bold" }}>Home</Text>
    </View>
  );
}
```

**Change required** — add `className="ios:p-4 android:p-2 text-lg"` on the `<Text>` element (line 6):
```tsx
<Text style={{ fontWeight: "bold" }} className="ios:p-4 android:p-2 text-lg">Home</Text>
```

---

## Shared Patterns

### Traverse import — babel-shim (mandatory)

**Source:** `src/core/babel-shim.ts` (lines 1–14)
**Apply to:** All new files that call `traverse()`

```typescript
// src/core/babel-shim.ts — the ONLY legal import point for @babel/traverse
import traverseImport from "@babel/traverse";
export const traverse = (traverseImport as any).default ?? traverseImport;
```

Import in new files:
```typescript
// From src/core/styles/rn/*.ts:
import { traverse } from "../../babel-shim.js";
```

### `{ raw }` sentinel + source slice

**Source:** `src/core/extractors/inline-style.ts` (lines 22–25, 52–56)
**Apply to:** `stylesheet-create.ts` (computed arg), `style-prop.ts` (unhandled expr), `index.ts` (call expr elements)

```typescript
function sliceSource(source: string, node: t.Node): string {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return source.slice(start, end);
}
// Usage: { raw: sliceSource(source, node) }
```

### Warning channel — `warnings: string[]` parameter

**Source:** `src/adapters/expo/ExpoRouterAdapter.ts` line 236 (ctx.warnings.push pattern)
**Apply to:** All new core utility functions that need to emit warnings

Core utilities (island rule: no adapter imports) accept `warnings: string[]` as a parameter. The adapter flushes them into `ctx.warnings` after each call:
```typescript
const warnings: string[] = [];
const result = someExtractor(jsxElement, source, warnings, fwdFile, line);
for (const w of warnings) ctx.warnings.push(w);
```

### `toForwardSlash` on all Map keys

**Source:** `src/core/paths.ts` (lines 15–17), `src/adapters/expo/ExpoRouterAdapter.ts` line 199
**Apply to:** All `absPath` values used as Map keys in `globalStyleIndex` and `fileStyleIndex`

```typescript
import { toForwardSlash } from "../../core/paths.js";
// ...
const fwdPath = toForwardSlash(absPath);
globalStyleIndex.set(fwdPath, subMap);
```

### Island rule enforcement

**Source:** `src/core/import-bindings.ts` lines 1–14 (comment block), `test/architecture/island.test.ts`
**Apply to:** All three new `src/core/styles/rn/*.ts` files

- Zero imports from `src/adapters/` in any file under `src/core/`
- Checked at runtime by `test/architecture/island.test.ts`

### `parseFile` + error handling

**Source:** `src/adapters/expo/ExpoRouterAdapter.ts` lines 198–224
**Apply to:** `ExpoRouterAdapter.ts` one-hop import resolution path

```typescript
const targetParsed = parseFile(ctx, targetAbsPath);
if (targetParsed.kind === "error") {
  ctx.warnings.push(`Failed to parse StyleSheet import at ${targetAbsPath}: ${targetParsed.message}`);
  continue;
}
const targetIndex = parseStyleSheetCreate(targetParsed.ast, targetParsed.source);
```

---

## No Analog Found

All files have close analogs in the codebase. No entries in this section.

---

## Metadata

**Analog search scope:** `src/core/extractors/`, `src/core/`, `src/adapters/expo/`, `test/core/extractors/`
**Files scanned:** 6 source files, 1 test file
**Pattern extraction date:** 2026-05-19
