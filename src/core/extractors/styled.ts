import * as t from "@babel/types";
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { StyledTemplate } from "../../adapters/types.js";
import { traverse } from "../babel-shim.js";

/**
 * Extract every styled-components template literal in the file.
 *
 * Detection is identifier-based per D-10: the tag must be either
 * `styled.<name>` (member of identifier `styled`) or `styled(<expr>)` (call
 * whose callee is identifier `styled`). No import-source verification in v1.
 *
 * The template body is the raw source with each `${...}` interpolation
 * replaced by the literal placeholder `{?}`.
 */
export function extractStyledTemplates(ast: t.File, source: string): StyledTemplate[] {
  const out: StyledTemplate[] = [];
  traverse(ast, {
    TaggedTemplateExpression(p: { node: t.TaggedTemplateExpression }) {
      const tag = resolveStyledTag(p.node.tag, source);
      if (!tag) return;
      const body = renderTemplateWithPlaceholder(p.node.quasi);
      out.push({ tag, body });
    },
  });
  return out;
}

function resolveStyledTag(tagNode: t.Expression, source: string): string | null {
  // styled.div  →  MemberExpression { object: Identifier("styled"), property: Identifier("div") }
  if (
    t.isMemberExpression(tagNode) &&
    !tagNode.computed &&
    t.isIdentifier(tagNode.object) &&
    tagNode.object.name === "styled" &&
    t.isIdentifier(tagNode.property)
  ) {
    return tagNode.property.name;
  }
  // styled(Foo) →  CallExpression { callee: Identifier("styled"), arguments: [Identifier("Foo")|...] }
  if (
    t.isCallExpression(tagNode) &&
    t.isIdentifier(tagNode.callee) &&
    tagNode.callee.name === "styled"
  ) {
    const arg = tagNode.arguments[0];
    if (arg && t.isIdentifier(arg)) return arg.name;
    if (arg && t.isExpression(arg)) {
      const start = arg.start ?? 0;
      const end = arg.end ?? start;
      return source.slice(start, end);
    }
  }
  return null;
}

function renderTemplateWithPlaceholder(quasi: t.TemplateLiteral): string {
  const parts: string[] = [];
  for (let i = 0; i < quasi.quasis.length; i++) {
    const q = quasi.quasis[i];
    if (q) parts.push(q.value.cooked ?? q.value.raw);
    if (i < quasi.expressions.length) parts.push("{?}");
  }
  return parts.join("");
}
