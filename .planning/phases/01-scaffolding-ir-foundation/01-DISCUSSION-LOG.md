# Phase 1: Scaffolding & IR Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 01-scaffolding-ir-foundation
**Areas discussed:** IR shape, Markdown tree format, JSON schema & envelope, src/ directory layout

---

## IR Shape

### Gray area selection
All four areas selected (IR shape, Markdown tree format, JSON schema & envelope, src/ directory layout).

### Node kinds (multiSelect)
| Option | Description | Selected |
|--------|-------------|----------|
| Baseline only | component, element, text, branch, list, slot, error — fragments flatten | ✓ |
| + fragment | Keep `<>` as explicit IR node | ✓ |
| + spread | Mark `{...props}` / spread children explicitly | ✓ |
| + unknown | Catch-all for unparseable expressions | |

**User's choice:** Baseline + fragment + spread. No `unknown` kind.
**Notes:** Selecting baseline alongside fragment+spread is interpreted as "baseline surface PLUS these two additions" — yielding 9 kinds total.

### Schema authoring
| Option | Description | Selected |
|--------|-------------|----------|
| Zod → infer TS types | Single source of truth; free runtime validation | ✓ |
| TS interfaces only | No runtime cost but drift-prone | |
| Split (TS inside, zod at boundary) | Plain TS tree, zod validates at JSON export | |

**User's choice:** Zod → infer TS types.

### File:line attachment
| Option | Description | Selected |
|--------|-------------|----------|
| Flat `file` + `line` fields | Always present; matches prototype | ✓ |
| Nested `loc: { file, line, column? }` | Babel-style structured location | |
| Pre-formatted string `"file.tsx:42"` | Tiniest but needs re-parsing | |

**User's choice:** Flat `file` + `line`. `column` reserved for future.

---

## Markdown Tree Format

### Tree glyph
| Option | Description | Selected |
|--------|-------------|----------|
| Box-drawing ├── / └── / │ | Standard CLI, Unicode | ✓ |
| Markdown bullet with indent | Parse-friendly, no tree feel | |
| ASCII \|-- / \`-- | Fallback, uglier | |

**User's choice:** Box-drawing Unicode.

### file:line position
| Option | Description | Selected |
|--------|-------------|----------|
| Suffix ` @ file:line` at EOL | Natural read; LLM-easy parse | ✓ |
| Brackets `[file:line]` | Clearly metadata | |
| Prefix column `file:line  ├── <Card>` | Scannable but breaks tree feel | |

**User's choice:** `@ file:line` suffix.

### Node label style
| Option | Description | Selected |
|--------|-------------|----------|
| `<Card>` / `div` / `"..."` / `? cond` / `.map` | Per-kind distinct grammar | ✓ |
| Prefix `component:Card` / `element:div` | Machine-parseable key:value | |
| Emoji/symbol markers | Compact but copy-paste-risky | |

**User's choice:** Per-kind grammar (angle brackets for components).

### Layout hint rendering
| Option | Description | Selected |
|--------|-------------|----------|
| Inline between label and `@ file:line` | Compact, single-line | ✓ |
| Separate indented sub-line | Explicit but widens tree | |
| JSON only, not in markdown | Markdown ultra-minimal | |

**User's choice:** Inline between label and `@ file:line`.

---

## JSON Schema & Envelope

### Discriminator field name
| Option | Description | Selected |
|--------|-------------|----------|
| `kind` | Matches prototype; terse; zod discriminatedUnion-friendly | ✓ |
| `type` | Familiar but collides with React `element.type` | |
| `nodeType` | Non-colliding but verbose | |

**User's choice:** `kind`.

### Schema version field
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — `schemaVersion: "1"` in envelope | Cheap; future-proofs clients | ✓ |
| Not needed in v1 | Less noise; add later | |

**User's choice:** Include `schemaVersion: "1"`.

### Envelope fields (multiSelect)
| Option | Description | Selected |
|--------|-------------|----------|
| `resolvedRoot` (required by ARCH-03) | Echo the resolved project root | ✓ |
| `toolVersion` | Package version for debug reports | ✓ |
| `warnings[]` | Non-fatal issue channel | ✓ |
| `generatedAt` timestamp | ISO timestamp for logs | ✓ |

**User's choice:** All four.

### File path style
| Option | Description | Selected |
|--------|-------------|----------|
| Relative to resolvedRoot, forward-slash | Token-saving, portable; satisfies SC-2 | ✓ |
| Absolute paths | Directly usable but token-heavy | |

**User's choice:** Relative + forward-slash.

---

## src/ Directory Layout

### Directory shape
| Option | Description | Selected |
|--------|-------------|----------|
| `ir/` + `renderers/` + `core/` + `adapters/` + `mcp/` + `cli.ts` | 5 islands, ARCH-01 enforced from day one | ✓ |
| Merged: `ir/` + `render/` + `server/` + `cli.ts` | Fewer folders, later split | |
| Flat | Everything top-level in `src/` | |

**User's choice:** 5 islands + `cli.ts`. Placeholder dirs for `core/`, `adapters/`, `mcp/` in Phase 1.

### Boundary enforcement
| Option | Description | Selected |
|--------|-------------|----------|
| ESLint `no-restricted-imports` + CI check | Automated, cheap | ✓ |
| dependency-cruiser / madge unit test | Stronger but adds dep | |
| Convention + code review | Simplest but forgettable | |

**User's choice:** ESLint rule + CI.

### Fixture granularity
| Option | Description | Selected |
|--------|-------------|----------|
| One kitchen-sink + 2–3 small | Broad coverage, low file count | ✓ |
| One fixture per kind | Granular but maintenance-heavy | |
| Minimal (single round-trip), expand later | Phase 1 ultra-thin | |

**User's choice:** Kitchen-sink + 2–3 small.

### CLI Phase 1 behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Stub prints `"mcp server not implemented yet"`, exits 0 | Minimal to pass SC-1 | ✓ |
| Print help/usage + `--version` | Slightly more; scope creep | |
| Accept TSX via stdin/arg and print tree | Dev-friendly but needs parser (Phase 3) | |

**User's choice:** Stub exit 0.

---

## Claude's Discretion

Enumerated in CONTEXT.md `<decisions>` under "Claude's Discretion":
- Biome vs ESLint specific pick
- Test fixture file organization under `test/`
- Whether zod schema is one file or split per kind
- Text truncation implementation in markdown renderer
- `schemaVersion` as top-level field vs under `meta.*`

## Deferred Ideas

Listed in CONTEXT.md `<deferred>`:
- `unknown` IR kind (declined in D-02)
- Text truncation policy details
- `column` field on IR nodes
- dependency-cruiser / madge for boundary enforcement
- CLI dev helper mode
