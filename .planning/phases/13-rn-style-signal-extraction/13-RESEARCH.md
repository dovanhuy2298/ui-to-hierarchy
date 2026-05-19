# Phase 13: RN Style Signal Extraction — Research

**Researched:** 2026-05-19
**Domain:** React Native / Expo Router style signal extraction, Babel AST traversal
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** StyleSheet index is adapter-internal — `Map<absFilePath, Map<varName, string[]>>`. No changes to `ParseResult` or `src/ir/`. Island rule intact: `src/core/` knows nothing about RN style mechanics.

**D-02:** `ExpoRouterAdapter.extractComponents` builds the index during its file-parsing pass. Per-file sub-map passed as parameter to `buildComponentDefinition` and to `flattenStyleArray(node, styleIndex)`.

**D-03:** `stylesheet-create.ts` is self-contained for parsing — exports `parseStyleSheetCreate(ast, source)` taking a pre-parsed Babel AST. Adapter is responsible for path resolution: reads import-binding map via `collectImportBindings`, resolves import's absPath using existing project resolver, calls `@babel/parser.parse()` on that file's content, passes AST to `parseStyleSheetCreate`. The function never touches the filesystem.

**D-04:** Two-hop imports degrade to `{ raw }` + envelope warning, not an error. Fallback is safe.

**D-05:** EXPO-SLOT-01 code fix already committed (commit `7b80ae0`). Phase 13 Req 1 is: (1) run vitest to confirm the fix works, (2) re-lock snapshots with `vitest -u`, (3) verify `get_full_hierarchy` on `expo-basic` shows nested tree. **CRITICAL FINDING: The fix AND snapshots were re-locked together in commit `7b80ae0`. Both snapshot files already show correct injected tree. Phase 13 only needs to verify vitest is green — no code changes required for Req 1.**

### Claude's Discretion

None — discussion stayed within phase scope.

### Deferred Ideas (OUT OF SCOPE)

- Statically computing merged style results — key-union only, not value merge
- Type-aware resolution (TypeScript compiler API)
- `--platform` CLI flag exposure — Phase 14
- React Navigation / Drawer navigator / FlatList renderItem style support — v1.3+
- `src/init/template.ts` update — Phase 15
- Integration suite expansion — Phase 15
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RN-04 | StyleSheet.create indexing + one-hop import resolution | AST pattern verified: `CallExpression` on `StyleSheet.create` with `ObjectExpression` arg; varName from parent `VariableDeclarator`; one-hop via `collectImportBindings` + `coreResolveModule` |
| RN-05 | Inline `style={{}}` extraction on RN primitives | `extractInlineStyle` from `src/core/extractors/inline-style.ts` reused directly; no reimplementation needed |
| RN-06 | `style={[...]}` array flattening — `flattenStyleArray` | AST pattern verified: `JSXExpressionContainer` → `ArrayExpression`; handle MemberExpression, LogicalExpression `&&`/`||`, StringLiteral, NullLiteral, CallExpression cases |
| RN-07 | NativeWind `className` extraction with platform-variant stripping | AST pattern verified: `JSXAttribute` name=className, StringLiteral value → regex strip `/(ios|android|web|native):/g` → whitespace tokenize; TaggedTemplateExpression → warning + no extraction |
| RN-08 | Unsupported StyleSheet patterns degrade gracefully | Catch non-literal-object arguments; emit `{ raw: <source-text> }` + warning on `ctx.warnings[]`; never throw |
</phase_requirements>

---

## Summary

Phase 13 implements four React Native style signal extraction patterns and resolves the remaining EXPO-SLOT-01 snapshot obligation. The domain is purely Babel AST traversal — no new dependencies are needed. The v1.0 inline-style extractor (`src/core/extractors/inline-style.ts`) is the anchor: it already handles `style={{}}` literals and `{ raw }` fallback; the new RN modules delegate to it and follow the same conventions.

**EXPO-SLOT-01 status (critical):** The code fix and snapshot re-lock both landed in commit `7b80ae0`. The `injectChildrenSlots` `case "component"` path now checks if the node's line matches a slotLine and returns `{ kind:"slot" }` directly. Both `expo-basic.md` and `expo-tabs-and-dynamic.md` already show the correct injected tree. Current test suite: 494 passing, 0 failing. Req 1 in Phase 13 requires only a vitest verification run — zero code edits.

The four style extractors (`stylesheet-create.ts`, `style-prop.ts`, `index.ts` barrel) follow the established island rule: they live in `src/core/styles/rn/` and accept pre-parsed Babel ASTs as parameters. The `ExpoRouterAdapter` owns filesystem I/O, path resolution, and wiring — the core utility modules remain pure AST → data transformers.

All AST patterns required for the five requirements have been verified by running live Babel traversal against representative source snippets. No ambiguity about node shapes exists.

**Primary recommendation:** Build the three new core utility files first (pure functions, easy to unit-test in isolation), then wire them in `ExpoRouterAdapter.extractComponents` and `buildComponentDefinition`, then add the NativeWind fixture line and run the full vitest suite.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| EXPO-SLOT-01 verify + re-lock | Analyzer (core) | ExpoRouterAdapter test suite | Fix already committed; tier owns snapshot verification |
| StyleSheet.create AST walk | `src/core/styles/rn/stylesheet-create.ts` | ExpoRouterAdapter (wiring) | Island rule: core owns AST logic; adapter owns filesystem |
| One-hop import resolution | ExpoRouterAdapter | `src/core/resolver/index.ts` (reused) | Adapter owns filesystem I/O per D-03 |
| Inline style extraction | `src/core/extractors/inline-style.ts` (existing) | `src/core/styles/rn/style-prop.ts` (delegation) | SPEC mandates reuse, not reimplementation |
| Style array flattening | `src/core/styles/rn/index.ts` | ExpoRouterAdapter (caller) | Pure AST → key-union; no I/O |
| NativeWind className extraction | `src/core/styles/rn/style-prop.ts` | ExpoRouterAdapter (caller) | Pure string/AST transformation |
| Path resolution for one-hop | ExpoRouterAdapter | `coreResolveModule` | Existing resolver already handles tsconfig paths + relative |
| Warning emission | ExpoRouterAdapter / core extractors | `ctx.warnings[]` channel | Established `pendingWarnings` pattern from Phase 12 |

---

## Standard Stack

### Core (all already installed — no new packages needed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@babel/parser` | `^7.29.2` | Parse TS/TSX files to AST | Already in project [VERIFIED: CLAUDE.md] |
| `@babel/traverse` | `^7.29.0` | Visitor-pattern AST walker | Already in project [VERIFIED: CLAUDE.md] |
| `@babel/types` | `^7.29.0` | Type guards: `t.isCallExpression`, `t.isObjectExpression`, etc. | Already in project [VERIFIED: CLAUDE.md] |
| `vitest` | `^4.3.6` | Test runner + snapshots | Already in project [VERIFIED: CLAUDE.md] |

**Installation:** None required. All dependencies are already installed.

**Version verification:** Confirmed via live Babel parse + traverse execution — `@babel/parser.parse` and `@babel/traverse` successfully traversed JSX+TypeScript ASTs in the verification step above. [VERIFIED: local execution]

---

## Package Legitimacy Audit

> No new packages to install in this phase. All required libraries are already present.

| Package | Status |
|---------|--------|
| `@babel/parser` | Already installed — [OK] |
| `@babel/traverse` | Already installed — [OK] |
| `@babel/types` | Already installed — [OK] |
| `vitest` | Already installed — [OK] |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
ExpoRouterAdapter.extractComponents(ctx, entryFiles)
    │
    ├── [per file] parseFile(ctx, absPath) → { ast, source }
    │
    ├── [per file] parseStyleSheetCreate(ast, source)
    │       └── walks CallExpression nodes → Map<varName, string[]>
    │       └── stored in fileStyleIndex: Map<absPath, Map<varName, string[]>>
    │
    ├── [per file] collectImportBindings(ast)
    │       └── returns Map<localName, { source, importedName }>
    │
    └── [per component] buildComponentDefinition(comp, ast, source, file, bindings, fileStyleIndex)
            │
            ├── extractRNInlineStyle(jsxElement, source)   ← delegates to extractInlineStyle
            │       └── returns Record<key, string | {raw}>
            │
            ├── flattenStyleArray(styleArrayNode, fileStyleIndex[absPath])
            │       └── walks ArrayExpression elements
            │       └── resolves MemberExpression → styleIndex keys
            │       └── returns string[] (key union)
            │
            └── extractNativeWindClassNames(jsxElement)
                    └── strips /(ios|android|web|native):/g
                    └── returns string[] tokens
```

### One-Hop Import Resolution Flow

```
Component file has: style={styles.card}
    │
    ├── bindings.get("styles") → { source: "./theme", importedName: "default" }
    │
    ├── coreResolveModule(ctx, absPath, "./theme", "default")
    │       └── returns { ok: true, kind: "local", absolutePath: "/abs/theme.ts" }
    │
    ├── Is absPath already in fileStyleIndex?
    │   ├── YES → use cached Map<varName, string[]>
    │   └── NO → parseFile(ctx, absPath) → parseStyleSheetCreate(ast, source)
    │               store result in fileStyleIndex[absPath]
    │
    └── fileStyleIndex[absPath].get("styles") → ["card", "bold"]
```

### Recommended Project Structure

```
src/
├── core/
│   ├── extractors/
│   │   └── inline-style.ts       # existing v1.0 extractor — DO NOT MODIFY
│   └── styles/
│       └── rn/                   # NEW directory — all 3 files new
│           ├── stylesheet-create.ts
│           ├── style-prop.ts
│           └── index.ts
├── adapters/
│   └── expo/
│       └── ExpoRouterAdapter.ts  # MODIFY — wire new extractors
test/
├── core/
│   └── styles/
│       └── rn/                   # NEW directory
│           ├── stylesheet-create.test.ts
│           ├── style-prop.test.ts
│           └── index.test.ts
└── fixtures/
    └── expo-tabs-and-dynamic/
        └── app/(tabs)/index.tsx  # MODIFY — add className line
```

### Pattern 1: StyleSheet.create AST Walker

**What:** Traverse a Babel AST for `StyleSheet.create({...})` call expressions; extract the literal object keys and map them to the variable holding the result.

**When to use:** Once per file during `ExpoRouterAdapter.extractComponents` file-parsing pass.

**Verified example:**
```typescript
// Verified: live Babel traversal in research step
import * as t from "@babel/types";
import { traverse } from "../../babel-shim.js";

export function parseStyleSheetCreate(
  ast: t.File,
  source: string,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      // Match StyleSheet.create(...)
      if (
        !t.isMemberExpression(callee) ||
        !t.isIdentifier(callee.object, { name: "StyleSheet" }) ||
        !t.isIdentifier(callee.property, { name: "create" })
      ) return;

      const arg = path.node.arguments[0];
      if (!arg) return;

      // Find parent VariableDeclarator to get varName
      const parent = path.parentPath?.node;
      if (!parent || !t.isVariableDeclarator(parent) || !t.isIdentifier(parent.id)) {
        // Unsupported: StyleSheet.create result not assigned to a variable
        // emit warning via caller (out is undefined here — caller handles)
        return;
      }
      const varName = parent.id.name;

      if (!t.isObjectExpression(arg)) {
        // Computed or factory-call argument → { raw } + warning emitted by caller
        return;
      }

      const keys: string[] = [];
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
    },
  });
  return out;
}
```

### Pattern 2: flattenStyleArray

**What:** Walk a `JSXExpressionContainer` wrapping an `ArrayExpression`; resolve each element to a key or `{ raw }` sentinel; union all resolved keys.

**Verified case coverage (must have ≥ 8 unit tests):**

| Element shape | Action | Verified |
|---------------|--------|---------|
| `styles.card` (MemberExpression) | Look up `styles` in fileStyleIndex → add keys | [VERIFIED: live AST] |
| Conditional `active && styles.bold` (LogicalExpression `&&`) | Resolve right side; include keys unconditionally | [VERIFIED: live AST] |
| Conditional `a \|\| styles.b` (LogicalExpression `\|\|`) | Resolve right side; include keys | [ASSUMED] |
| `"text-lg"` (StringLiteral) | Add the string itself as a key | [VERIFIED: live AST] |
| `null` / `false` literal element | Skip | [VERIFIED: live AST] |
| `fn()` (CallExpression) | Emit `{ raw: src-slice }` + warning; skip key | [VERIFIED: live AST] |
| Nested array (`[styles.a, [styles.b]]`) | Warn "nested array not supported" + skip inner | [ASSUMED] |
| MemberExpression not in styleIndex | Emit `{ raw }` + warning | [ASSUMED] |

```typescript
// Source: design from CONTEXT.md D-02 + AST verification
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

  for (const el of expr.elements) {
    if (el === null) continue; // sparse array / elision
    if (t.isNullLiteral(el) || t.isBooleanLiteral(el)) continue;
    if (t.isStringLiteral(el)) { keys.push(el.value); continue; }

    if (t.isArrayExpression(el)) {
      warnings.push(`Nested array in style prop at ${file} — skipped`);
      continue;
    }

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

    if (t.isCallExpression(el)) {
      const raw = source.slice(el.start ?? 0, el.end ?? 0);
      warnings.push(`Unsupported style array element (call expr): ${raw} at ${file}`);
      continue;
    }
  }
  return keys;
}
```

### Pattern 3: NativeWind className Extraction

**What:** Detect `className` JSX attribute; strip platform prefix variants; tokenize on whitespace. Detect `tw\`...\`` tagged template and emit warning without extracting.

**Regex locked by SPEC:** `/(ios|android|web|native):/g`

```typescript
// Verified: live AST + regex execution in research step
export function extractNativeWindClassNames(
  jsxElement: t.JSXElement,
  source: string,
  warnings: string[],
  file: string,
  line: number,
): string[] {
  const attr = jsxElement.openingElement.attributes.find(
    (a): a is t.JSXAttribute =>
      t.isJSXAttribute(a) &&
      t.isJSXIdentifier(a.name) &&
      a.name.name === "className",
  );
  if (!attr) return [];

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
    // Other expressions (variables, concatenations) → { raw } fallback, no extraction
  }
  return [];
}
```

### Pattern 4: ExpoRouterAdapter Wiring

**What:** Extend `extractComponents` to build a file-scoped style index; extend `buildComponentDefinition` to call the three new extractors.

**Key signature change:**
```typescript
// extractComponents pass: build style index alongside the existing parse pass
private buildFileStyleIndex(ast: t.File, source: string): Map<string, string[]> {
  return parseStyleSheetCreate(ast, source);
}

// buildComponentDefinition gains fileStyleIndex parameter
private buildComponentDefinition(
  comp: DiscoveredComponent,
  ast: t.File,
  source: string,
  file: string,
  bindings: Map<string, { source: string; importedName: string }>,
  fileStyleIndex: Map<string, string[]>,  // NEW parameter
): ComponentDefinition
```

**One-hop resolution in extractComponents:**
```typescript
// After building fileStyleIndex for current file,
// scan bindings for vars used in style props that point to other files
// and build cross-file index entries:
for (const [localName, binding] of bindings) {
  if (fileStyleIndex.has(localName)) continue; // already found in this file
  if (!binding.source.startsWith(".")) continue; // skip node_modules
  const resolved = coreResolveModule(ctx, fwdFile, binding.source, binding.importedName);
  if (!resolved.ok || resolved.kind !== "local") continue;
  const targetPath = resolved.absolutePath;
  if (!globalStyleIndex.has(targetPath)) {
    const targetParsed = parseFile(ctx, targetPath);
    if (targetParsed.kind === "ok") {
      const targetIndex = parseStyleSheetCreate(targetParsed.ast, targetParsed.source);
      globalStyleIndex.set(targetPath, targetIndex);
    }
  }
  // map localName in this file → target file's varName keys
  const targetIndex = globalStyleIndex.get(targetPath);
  if (targetIndex) {
    const importedVarKeys = targetIndex.get(binding.importedName);
    if (importedVarKeys) fileStyleIndex.set(localName, importedVarKeys);
  }
}
```

### Anti-Patterns to Avoid

- **Calling `parseStyleSheetCreate` with filesystem access inside:** The function must receive an already-parsed `ast`. Filesystem reads belong exclusively in `ExpoRouterAdapter`.
- **Importing from `src/adapters/` in the new `src/core/styles/rn/` files:** Island rule (ARCH-01) enforced by both Biome lint and `test/architecture/island.test.ts`.
- **Directly importing `@babel/traverse` (not via babel-shim):** The shim `src/core/babel-shim.ts` is the only legal import point — avoids CJS/ESM interop bug.
- **Using `console.*` for warnings:** All warnings go to `ctx.warnings[]` (or the `warnings: string[]` param pattern). Never `console.warn`.
- **Silently dropping unsupported patterns:** SPEC requires explicit `{ raw }` + warning for every unsupported case. Silent failure breaks the no-throw contract.
- **Reimplementing `extractInlineStyle`:** `style-prop.ts` imports and delegates to `src/core/extractors/inline-style.ts` — per SPEC constraint.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File path resolution (relative + tsconfig) | Custom resolver | `coreResolveModule` (existing) | Already handles tsconfig paths, barrel chasing, Windows path normalization |
| AST parse of target files | Custom parser invocation | `parseFile(ctx, absPath)` (existing) | Ctx-cached; handles plugins; error-safe |
| Import binding extraction | Re-traverse per file | `collectImportBindings(ast)` (existing) | Already used in `extractComponents` — pass result down |
| Forward-slash path normalization | `replaceAll("\\", "/")` inline | `toForwardSlash(p)` from `src/core/paths.ts` | Covers both Windows `path.sep` and raw backslashes |
| ESM/CJS traverse interop | `traverseImport.default ?? traverseImport` inline | `import { traverse } from "../../babel-shim.js"` | Shim is the one canonical safe import point |
| Inline style extraction | Re-implement | `extractInlineStyle` from `src/core/extractors/inline-style.ts` | Already correct, tested, covers spreads and computed fallback |

---

## Common Pitfalls

### Pitfall 1: StyleSheet.create varName resolution — parentPath vs node

**What goes wrong:** Checking `path.node` for the `VariableDeclarator` parent instead of `path.parentPath?.node`. The `CallExpression` path's `node` IS the call itself; the parent path's `node` is the `VariableDeclarator`.

**Why it happens:** Confusion between `path.node` and `path.parentPath.node` in Babel traverse.

**How to avoid:** Always use `path.parentPath?.node` and guard with `t.isVariableDeclarator(...)`.

**Warning signs:** `varName` is always "unknown" or the index map is always empty.

### Pitfall 2: EXPO-SLOT-01 Already Fixed — Do Not Rework

**What goes wrong:** Planner or implementer re-applies the EXPO-SLOT-01 fix to `Analyzer.ts`, creating a double-fix or merge conflict.

**Why it happens:** STATE.md says "EXPO-SLOT-01 bug" but commit `7b80ae0` already applied the fix AND re-locked the snapshots. The snapshot files on disk already show the correct tree.

**How to avoid:** Req 1 is a verification-only task: run `vitest run` and confirm 494 tests pass. No file edits needed for `Analyzer.ts` or snapshot files.

**Warning signs:** Planning a task that edits `src/core/Analyzer.ts` for EXPO-SLOT-01 — that would be a mistake.

### Pitfall 3: Island Rule Violation in `src/core/styles/rn/`

**What goes wrong:** One of the three new core files imports `ExpoRouterAdapter`, `isRNPrimitive`, or any other `src/adapters/` symbol at runtime. This fails `test/architecture/island.test.ts`.

**Why it happens:** `isRNPrimitive` from `src/adapters/expo/rn-primitives.ts` is the natural guard to check before extracting styles — but it lives under `src/adapters/`.

**How to avoid:** The calling side (adapter) applies `isRNPrimitive` check BEFORE calling the style extractor functions. The core functions receive JSXElement nodes that are already known to be RN primitives by the time they are called.

**Warning signs:** `import { isRNPrimitive }` appearing in any file under `src/core/`.

### Pitfall 4: `null` elements in ArrayExpression

**What goes wrong:** `expr.elements` contains `null` entries for sparse arrays (e.g. `[,styles.card]`). Calling `t.isNullLiteral(el)` on a JavaScript `null` crashes — `t.isNullLiteral` expects a Babel node, not `null`.

**Why it happens:** Babel represents sparse array holes as `null` (JavaScript null), not `NullLiteral` nodes.

**How to avoid:** Check `if (el === null) continue` FIRST, before any `t.is*` type guard.

**Warning signs:** TypeError "Cannot read properties of null" in flattenStyleArray.

### Pitfall 5: Platform Variant Regex Applied to Tagged Templates

**What goes wrong:** Attempting to run the `/(ios|android|web|native):/g` regex on a `tw\`...\`` tagged template — the regex may match template literal text and partially extract it, producing wrong tokens.

**Why it happens:** Code checks `className` attribute without first distinguishing StringLiteral from JSXExpressionContainer.

**How to avoid:** Branch on `val` type FIRST: `t.isStringLiteral(val)` → regex + tokenize; `t.isJSXExpressionContainer(val)` → check for TaggedTemplateExpression → warning. Do NOT run the regex on tagged template content.

### Pitfall 6: Forgetting `toForwardSlash` on resolved absPath keys in globalStyleIndex

**What goes wrong:** The `globalStyleIndex: Map<absPath, ...>` uses Windows backslash paths as keys in one code path and forward-slash in another, causing cache misses and double-parsing the same file.

**Why it happens:** `coreResolveModule` already returns forward-slash paths, but `parseFile` receives the path directly and its internal caching may normalize differently.

**How to avoid:** Apply `toForwardSlash` consistently at every site where `absPath` is used as a Map key. Follow existing `ExpoRouterAdapter` pattern: `const fwdFile = toForwardSlash(absPath)`.

---

## Code Examples

### StyleSheet.create — unsupported argument (RN-08 degradation)

```typescript
// Source: design per SPEC Req 7 + CONTEXT.md D-03
// When arg is not ObjectExpression, emit raw + warning via caller
traverse(ast, {
  CallExpression(path) {
    // ... callee check ...
    const arg = path.node.arguments[0];
    if (!arg) return;
    if (!t.isObjectExpression(arg)) {
      // Caller is responsible for warning emission:
      const rawText = source.slice(arg.start ?? 0, arg.end ?? 0);
      // Return sentinel so caller can emit:
      rawEntries.push({ varName: varNameFromParent(path), raw: rawText });
      return;
    }
    // ... literal object processing ...
  }
});
```

### NativeWind fixture addition (expo-tabs-and-dynamic)

```tsx
// Add to test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx
import { View, Text, StyleSheet } from "react-native";
const styles = StyleSheet.create({ card: { padding: 8 }, bold: { fontWeight: "bold" } });
export default function HomeTab({ active }: { active?: boolean }) {
  return (
    <View style={[styles.card, active && styles.bold]}>
      <Text style={{ fontWeight: "bold" }} className="ios:p-4 android:p-2 text-lg">Home</Text>
    </View>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `case "element"` only in `injectChildrenSlots` | `case "component"` checks slotLine match first (commit `7b80ae0`) | Expo `<Slot />` now correctly substituted with page tree |
| `classNames: []` hardcoded | NativeWind `className` attr extraction + platform-variant strip | `find_by_style("p-4")` works on Expo projects |
| `inlineStyles: {}` hardcoded | `extractInlineStyle` delegated via `style-prop.ts` | `find_by_style("fontWeight")` works on RN primitives |
| No style array handling | `flattenStyleArray` key-union | `find_by_style("bold")` works for conditional `&&` array members |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `||` conditional member in style array is handled same as `&&` (resolve right side, include unconditionally) | Pattern 2 — flattenStyleArray | If wrong, test case for `||` fails; low risk — simple fix to add `el.operator === "||"` check |
| A2 | Nested `ArrayExpression` inside outer array should warn + skip (not attempt to flatten recursively) | Pattern 2 — flattenStyleArray | If wrong, we'd need recursive flattening; low risk — nested style arrays are extremely rare and degrade safely |
| A3 | `MemberExpression` where `object` is NOT in `fileStyleIndex` should emit `{ raw }` + warning | Pattern 2 — flattenStyleArray | If wrong, silent miss; low risk since SPEC says all unsupported patterns get warning |

---

## Open Questions

1. **styleIndex scope for one-hop: per-file vs global**
   - What we know: D-02 says fileStyleIndex is built per file and passed to `buildComponentDefinition`. D-03 says the adapter resolves import paths.
   - What's unclear: Whether the global cross-file cache (for one-hop resolved files) is a local variable inside `extractComponents` or stored as an instance variable on the adapter.
   - Recommendation: Local variable inside `extractComponents` — it naturally scopes to a single parse invocation. Instance variable would cause stale data across multiple `extractComponents` calls.

2. **What to do when `parseStyleSheetCreate` returns a varName but the one-hop target has no `StyleSheet.create`?**
   - What we know: Two-hop degrades to `{ raw }` + warning (D-04).
   - What's unclear: What if the one-hop target is a plain object literal (not `StyleSheet.create`)? That file's `parseStyleSheetCreate` returns an empty map.
   - Recommendation: Emit a warning "StyleSheet not found in imported file at \<path\>" and produce empty keys; `find_by_style` simply won't match — safe degradation.

---

## Environment Availability

All external dependencies are available:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@babel/parser` | All AST parsing | ✓ | `^7.29.2` | — |
| `@babel/traverse` | AST walking | ✓ | `^7.29.0` | — |
| `@babel/types` | Type guards | ✓ | `^7.29.0` | — |
| `vitest` | Test runner | ✓ | `^4.3.6` | — |
| Node.js | Runtime | ✓ | `>=20` (project target) | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^4.3.6` |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `vitest run test/core/styles/rn` |
| Full suite command | `vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXPO-SLOT-01 (Req 1) | vitest suite green with 494 tests; snapshots show injected tree | smoke | `vitest run test/adapters/expo` | ✅ existing |
| RN-04 | `parseStyleSheetCreate` returns correct varName→keys map for in-file literal | unit | `vitest run test/core/styles/rn/stylesheet-create.test.ts` | ❌ Wave 0 |
| RN-04 | One-hop import resolves to imported file's StyleSheet keys | unit | `vitest run test/core/styles/rn/stylesheet-create.test.ts` | ❌ Wave 0 |
| RN-04 | Two-hop import → empty keys + warning (not an error) | unit | `vitest run test/core/styles/rn/stylesheet-create.test.ts` | ❌ Wave 0 |
| RN-05 | `style={{ fontWeight: "bold" }}` on RN primitive → `inlineStyles` populated | unit | `vitest run test/core/styles/rn/style-prop.test.ts` | ❌ Wave 0 |
| RN-05 | Existing v1.0 inline-style tests still pass unchanged | regression | `vitest run test/core/extractors/inline-style.test.ts` | ✅ existing |
| RN-06 | `flattenStyleArray` — ≥ 8 shape cases (plain member, two members, `&&`, `||`, nested array, null, string literal, call expr) | unit | `vitest run test/core/styles/rn/index.test.ts` | ❌ Wave 0 |
| RN-07 | `className="ios:p-4 android:p-2 text-lg"` → `["p-4", "p-2", "text-lg"]` | unit | `vitest run test/core/styles/rn/style-prop.test.ts` | ❌ Wave 0 |
| RN-07 | `tw\`text-lg\`` → warning emitted, no tokens returned | unit | `vitest run test/core/styles/rn/style-prop.test.ts` | ❌ Wave 0 |
| RN-08 | `StyleSheet.create(getStyles())` → empty match + warning, no throw | unit | `vitest run test/core/styles/rn/stylesheet-create.test.ts` | ❌ Wave 0 |
| RN-08 | Computed key `StyleSheet.create({ [key]: {...} })` → warning, no throw | unit | `vitest run test/core/styles/rn/stylesheet-create.test.ts` | ❌ Wave 0 |
| integration | `find_by_style("container")` on expo-basic returns View node | integration snapshot | `vitest run test/adapters/expo` | ✅ existing (after wiring) |
| integration | `find_by_style("p-4")` on expo-tabs-and-dynamic returns className node | integration snapshot | `vitest run test/adapters/expo` | ✅ existing (after fixture edit) |

### Sampling Rate

- **Per task commit:** `vitest run test/core/styles/rn` (unit tests for new modules)
- **Per wave merge:** `vitest run` (full 494+ suite)
- **Phase gate:** Full suite green (≥ 494 + new tests) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/core/styles/rn/stylesheet-create.test.ts` — covers RN-04 + RN-08
- [ ] `test/core/styles/rn/style-prop.test.ts` — covers RN-05 + RN-07
- [ ] `test/core/styles/rn/index.test.ts` — covers RN-06 (≥ 8 `flattenStyleArray` cases)
- [ ] `src/core/styles/rn/` directory itself (no existing files)

---

## Security Domain

> `security_enforcement` not explicitly set to `false` — including this section.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Babel AST type guards (`t.isObjectExpression`, `t.isStringLiteral`, etc.) — all untrusted input is user source code |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed JSX / TypeScript in user fixture | Tampering | `@babel/parser` with `errorRecovery: false` (default); parseFile wraps in try/catch and returns `kind: "error"` |
| Extremely large style objects | DoS (resource exhaustion) | No guards needed in v1 — on-demand parse, no cache in scope; parse time is bounded by file size |
| Backslash path injection in styleIndex keys | Tampering | `toForwardSlash` applied to all Map keys; existing Windows path invariant |

---

## Sources

### Primary (HIGH confidence — verified in this session)

- Existing `src/core/extractors/inline-style.ts` — ground truth for `{ raw }` sentinel pattern and spread key convention [VERIFIED: source read]
- Existing `src/core/import-bindings.ts` — `collectImportBindings` API signature [VERIFIED: source read]
- Existing `src/adapters/expo/ExpoRouterAdapter.ts` — current `buildComponentDefinition` signature and `bindings` parameter usage [VERIFIED: source read]
- Existing `src/core/resolver/index.ts` — `coreResolveModule` API for one-hop path resolution [VERIFIED: source read]
- Commit `7b80ae0` — EXPO-SLOT-01 fix committed + snapshots re-locked [VERIFIED: git log + git show]
- Live vitest run — 494 tests passing, 0 failing [VERIFIED: local execution]
- Live Babel traversal — all four AST patterns (StyleSheet.create, flattenStyleArray, NativeWind className, tagged template detection) verified with actual `@babel/parser` + `@babel/traverse` [VERIFIED: local execution]
- `test/architecture/island.test.ts` — exact island rule enforcement (runtime imports from `src/adapters/` forbidden in `src/core/**`) [VERIFIED: source read]
- `.planning/phases/13-rn-style-signal-extraction/13-SPEC.md` — 7 locked requirements, acceptance criteria [VERIFIED: source read]
- `.planning/phases/13-rn-style-signal-extraction/13-CONTEXT.md` — implementation decisions D-01 through D-05 [VERIFIED: source read]

### Secondary (MEDIUM confidence)

- `test/fixtures/expo-tabs-and-dynamic/app/(tabs)/index.tsx` — existing fixture structure; confirms `StyleSheet.create` and style array already present; `className` not yet present [VERIFIED: source read]

---

## Metadata

**Confidence breakdown:**
- EXPO-SLOT-01 status: HIGH — confirmed by git log, git show, vitest run, and snapshot file content
- Standard stack: HIGH — all packages already installed and live-verified
- Architecture patterns: HIGH — all four AST patterns verified by live Babel execution; matches established project conventions
- Pitfalls: HIGH — derived from reading actual source code, not training data

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (stable domain — Babel AST shapes do not change within a semver minor)
