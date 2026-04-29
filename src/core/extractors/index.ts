import type * as t from "@babel/types";
// biome-ignore lint/style/noRestrictedImports: type-only import; erased at compile time (D-11 island invariant unaffected)
import type { ClassToken, CssModuleRef, StyledTemplate } from "../../adapters/types.js";
import { extractCssModuleRefs } from "./css-module.js";
import { extractInlineStyle } from "./inline-style.js";
import { extractStyledTemplates } from "./styled.js";
import { extractTailwindClasses } from "./tailwind/index.js";

export interface ComponentStyleSignals {
  classNames: ClassToken[];
  inlineStyles: Record<string, string | { raw: string }>;
  cssModuleRefs: CssModuleRef[];
  styledTemplates: StyledTemplate[];
}

/**
 * Aggregate style signals for a component.
 *
 * - Tailwind + inline are per-element (walked over the JSXElement[] passed in).
 * - CSS Modules + styled-components are file-level (walked over the full AST).
 *
 * `fullClasses` only affects Tailwind. Inline-style / CSS Modules /
 * styled-components capture is unconditional.
 *
 * Consumed by NextJsAdapter (Plan 06).
 */
export function collectStyleSignals(
  ast: t.File,
  jsxElements: t.JSXElement[],
  source: string,
  file: string,
  opts: { fullClasses?: boolean } = {},
): ComponentStyleSignals {
  const classNames: ClassToken[] = [];
  const inlineStyles: Record<string, string | { raw: string }> = {};
  for (const el of jsxElements) {
    classNames.push(...extractTailwindClasses(el, source, file, opts));
    Object.assign(inlineStyles, extractInlineStyle(el, source));
  }
  return {
    classNames,
    inlineStyles,
    cssModuleRefs: extractCssModuleRefs(ast),
    styledTemplates: extractStyledTemplates(ast, source),
  };
}
