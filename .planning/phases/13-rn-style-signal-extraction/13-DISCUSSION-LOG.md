# Phase 13: RN Style Signal Extraction — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-19
**Phase:** 13-rn-style-signal-extraction
**Areas discussed:** StyleSheet index data flow, One-hop import resolution

---

## StyleSheet Index Data Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Adapter-internal Map | `Map<absPath, Map<varName, string[]>>` — ExpoRouterAdapter builds during extractComponents, passes per-file sub-map to buildComponentDefinition and flattenStyleArray. No IR/ParseResult change. Island rule intact. | ✓ |
| ParseResult field | Add `rnStyleIndex: Map<string, string[]>` to ParseResult (similar to declLines in POLISH-03). Requires IR schema change. Analyzer core would need to know about RN styles. | |

**User's choice:** Adapter-internal Map (Recommended)

**Sub-question: Index key shape**

| Option | Description | Selected |
|--------|-------------|----------|
| Per-file: `Map<absPath, Map<varName, string[]>>` | Each file has its own namespace — `styles.card` in two different files don't conflict. `flattenStyleArray` receives `styleIndex[currentFile]`. | ✓ |
| You decide | Claude chooses appropriate shape. | |

**User's choice:** Per-file keying (Recommended)

---

## One-Hop Import Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Direct re-parse in stylesheet-create.ts | `parseStyleSheetCreate(ast, source)` takes pre-parsed AST. Adapter does path resolution + `@babel/parser.parse()`. `stylesheet-create.ts` never touches filesystem. Self-contained, easy to test. | ✓ |
| Reuse Analyzer cache — pass parsed ASTs | ExpoRouterAdapter already parses routing files; if imported file is already parsed, reuse AST. Problem: styles files are not routing files, so they're not in extractComponents scope. | |

**User's choice:** Direct re-parse (Recommended)

**Sub-question: Who resolves the import specifier to absPath?**

| Option | Description | Selected |
|--------|-------------|----------|
| ExpoRouterAdapter | Uses existing import-binding map (collectImportBindings) + project resolver to get absPath, then passes to stylesheet-create.ts. Keeps stylesheet-create.ts filesystem-agnostic. | ✓ |
| You decide | Claude chooses. | |

**User's choice:** ExpoRouterAdapter (Recommended)

---

## Claude's Discretion

None — user selected recommended options for all questions.

## Deferred Ideas

None — discussion stayed within phase scope.
