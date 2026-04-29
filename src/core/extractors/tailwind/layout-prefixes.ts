/**
 * D-08 layout-only Tailwind prefix list + variant strip regex.
 *
 * The list is locked in CONTEXT.md decision D-08. Adding a family during
 * implementation is allowed (planner discretion) but each addition needs a
 * one-line rationale comment.
 */
export const LAYOUT_PREFIXES: readonly string[] = [
  "flex",
  "grid",
  "gap",
  "m",
  "p",
  "w",
  "h",
  "min-w",
  "min-h",
  "max-w",
  "max-h",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "place-",
  "justify-",
  "items-",
  "self-",
  "content-",
  "basis-",
  "grow",
  "shrink",
  "order",
  "col-",
  "row-",
  "space-",
  "divide-",
  "absolute",
  "relative",
  "fixed",
  "sticky",
  "static",
  "hidden",
  "block",
  "inline",
  "inline-block",
  "inline-flex",
  "inline-grid",
  "overflow-",
  "z-",
  "size-",
];

/** Repeat-strip variant prefixes (e.g. `md:hover:flex` → `flex`, `[&>svg]:size-6` → `size-6`). */
export const VARIANT_PREFIX_RE = /^(?:\[[^\]]+\]|[a-zA-Z0-9_-]+):/;

export function stripVariants(token: string): string {
  let cur = token;
  while (VARIANT_PREFIX_RE.test(cur)) cur = cur.replace(VARIANT_PREFIX_RE, "");
  return cur;
}

/** Test whether a className token (post variant-strip) belongs to a layout family. */
export function isLayoutClass(token: string): boolean {
  const bare = stripVariants(token);
  for (const prefix of LAYOUT_PREFIXES) {
    if (prefix.endsWith("-")) {
      if (bare.startsWith(prefix)) return true;
    } else if (bare === prefix || bare.startsWith(`${prefix}-`)) {
      return true;
    }
  }
  return false;
}

/** Filter a list of class tokens to layout-relevant ones only. */
export function filterLayoutClasses(tokens: string[]): string[] {
  return tokens.filter(isLayoutClass);
}
