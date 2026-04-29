# Phase 3: Parser Core (AST + Resolution + Extractors) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 03-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 03-parser-core-ast-resolution-extractors
**Areas discussed:** Parser internal architecture, RenderNode type design, Tailwind layout-only filter, Adapter island enforcement, Test fixture organization, ComponentDefinition props shape, Resolver fallback policy

---

## Parser Internal Architecture

### Q1: How do the 4 modules (parser/resolver/extractors/render-flow) connect?

| Option | Description | Selected |
|--------|-------------|----------|
| Pure functions + ParseContext | Modules export pure functions; shared ParseContext (resolvedRoot, tsconfig, astCache, resolverCache, warnings) passed as arg. Easy to unit-test, no hidden state. | ✓ |
| Parser class with private state | Class with private cache fields and methods; less arg passing but harder to mock pieces. | |
| Namespace modules + module-level WeakMap cache | Module-level Map cache; risks leaking state across tool calls (violates ARCH-02). | |

**User's choice:** Pure functions + ParseContext (Recommended)

### Q2: Where does the AST cache live and what's the key?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-ParseContext, key = absolute path | Map<string, ParseResult> on ParseContext, fresh per extractComponents call. Honors ARCH-02. | ✓ |
| Cache parse + traverse results (richer) | Cache ASTs plus preprocessed export maps and visitor scans. Faster but more invalidation surface. | |
| No cache — parse each time | Simple but barrel chase 5+ levels re-parses repeatedly. | |

**User's choice:** Per-ParseContext, key = absolute path (Recommended)

---

## RenderNode Type Design

### Q3: Relationship between parser-level RenderNode and IR TreeNode (9-kind union in src/ir/schema.ts)?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate, Phase 5 maps | RenderNode in src/adapters/types.ts; Phase 5 owns adapter→IR translation. Honors island rule. | ✓ |
| Reuse IR TreeNode directly | extractComponents returns TreeNode. Saves a mapping step but violates island and pollutes IR. | |
| Extends TreeNode shape with parser-only fields | Hang style fields directly on component nodes. Doesn't match SPEC's ComponentDefinition outer struct. | |

**User's choice:** Separate, Phase 5 maps (Recommended)

### Q4: How many RenderNode kinds (jsx/branch/list/text/fragment/spread/error)?

| Option | Description | Selected |
|--------|-------------|----------|
| 7 kinds reflecting AST | jsx (with isComponent flag), branch, list, text, fragment, spread, error. Phase 5 splits component vs element. | ✓ |
| 9 kinds 1:1 with IR | Match IR including slot. Slot has no parser-level meaning (Next.js routing concept). | |

**User's choice:** 7 kinds, reflecting AST reality (Recommended)

---

## Tailwind Layout-Only Filter

### Q5: How is the layout-only filter (OUT-02) built?

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded prefix list + variant strip regex | Curated prefix module + variant-strip regex. Auditable, easy to extend. | ✓ |
| Regex-only family detection | Per-family regex, compact but harder to audit. | |
| External Tailwind config | Read user's tailwind.config. Most accurate but requires execution; v4 is CSS-first. | |

**User's choice:** Hardcoded prefix list + variant strip regex (Recommended)

### Q6: cn()/clsx()/cva()/twMerge() with non-string-literal args?

| Option | Description | Selected |
|--------|-------------|----------|
| Resolve literals + preserve raw source slice | ClassToken union: { kind: 'literal', value } and { kind: 'raw', source }. | ✓ |
| Only collect literals, drop dynamic | Simpler but loses signal for the agent. | |
| Try resolve simple bindings | Symbolic exec of variants object. Out of v1 scope. | |

**User's choice:** Resolve string literals + preserve raw source slice (Recommended)

---

## Adapter Island Enforcement

### Q7: Where is the island rule enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Biome noRestrictedImports + integration test | Lint rule (loud-fail in IDE/CI) + vitest import-graph scan (catches dynamic imports). | ✓ |
| Biome only | One mechanism; misses dynamic import('...'). | |
| Vitest only | Programmatic but no lint-time signal. | |

**User's choice:** Biome noRestrictedImports + integration test (Recommended)

---

## Test Fixture Organization

### Q8: How are fixtures organized?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-feature folders + 1 kitchen-sink | hoc/, classes/, render-flow/, extractors/, resolver/ folders + kitchen-sink for style interplay. | ✓ |
| One big mega fixture | Single mega.tsx — snapshot diffs become noisy when one feature breaks. | |
| Inline-per-test | TSX strings inside .test.ts; insufficient for resolver tests that need real filesystem. | |

**User's choice:** Per-feature folders + 1 kitchen-sink (Recommended)

### Q9: Resolver fixtures (need full filesystem layout) — how organized?

| Option | Description | Selected |
|--------|-------------|----------|
| Mini-projects with real tsconfig.json | Real on-disk shadcn-barrel/, barrel-cycle/, multi-target/, extends-chain/. get-tsconfig reads real files. | ✓ |
| In-memory FS mock | memfs/mock-fs dep; faster but get-tsconfig internals hard to mock cleanly. | |

**User's choice:** Mini-projects with tsconfig.json thật (Recommended)

---

## ComponentDefinition Props Shape

### Q10: What goes in PropSignature beyond name + raw type slice?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: { name, typeSlice, optional } | Add optional flag from `name?: T`. Stops short of defaults/rest. | ✓ |
| Add defaultValue + restElement | More metadata for find_by_style; SPEC doesn't require it. | |
| Only name + typeSlice (SPEC literal) | Strict SPEC reading; defer optional detection to Phase 5. | |

**User's choice:** Minimal: { name, typeSlice, optional } (Recommended)

### Q11: Inline destructure (function Card({ a, b: alias, ...rest }: Props)) — how to extract?

| Option | Description | Selected |
|--------|-------------|----------|
| Extract destructured names + map to Props type slice | Names: a, alias, rest; typeSlice = raw "Props" for all. Match prototype, useful for query tools. | ✓ |
| Skip destructure, only explicit per-param annotations | Simpler but lower coverage. | |

**User's choice:** Extract destructured names + map sang Props type slice (Recommended)

---

## Resolver Fallback Policy

### Q12: When resolveModule fails, what comes back?

| Option | Description | Selected |
|--------|-------------|----------|
| Discriminated union { ok, value | error } | ResolveResult with kinds: local, external, cycle, not-found, ambiguous. Caller decides. | ✓ |
| Throw + caller try/catch | Familiar but exception flow leaks across boundaries. | |
| Return null + log warnings | Loses cause info; agent can't debug. | |

**User's choice:** Return discriminated union { ok, value | error } (Recommended)

### Q13: tsconfig multi-target paths (e.g. '@/*': ['src/*', 'lib/*']) — which target wins?

| Option | Description | Selected |
|--------|-------------|----------|
| First-existing-file wins | Iterate targets in order, first existing path wins. Matches TS compiler. | ✓ |
| All-targets emit ambiguous error | Safer but breaks in monorepo configs that use this pattern intentionally. | |

**User's choice:** First-existing-file wins (Recommended)

---

## Final Confirmation

### Q14: Write CONTEXT.md or add another area?

| Option | Description | Selected |
|--------|-------------|----------|
| Write CONTEXT.md | All 14 decisions clear; SPEC locks WHAT; downstream agents have enough. | ✓ |
| More areas | (e.g., error-node propagation detail, named-export chase semantics, styled import detection) | |

**User's choice:** Viết CONTEXT.md (Recommended)

---

## Claude's Discretion

Documented in 03-CONTEXT.md `<decisions>` § "Claude's Discretion" — internal sub-file splits inside each module, exact Tailwind prefix list growth, JsxAttribute internal shape, iterableSource truncation policy, snapshot file paths, destructure-alias note format.

## Deferred Ideas

Documented in 03-CONTEXT.md `<deferred>` — symbolic cn() resolution, PropSignature defaultValue/restElement, Tailwind config reading, React.createElement support, cross-call AST cache, performance benchmarks, namespaced JSX full resolution, aliased Fragment detection.
