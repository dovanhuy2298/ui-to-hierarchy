import type { Envelope, TreeNode } from "../ir/index.js";

/**
 * renderMarkdown — emits a Unicode tree view of the IR (D-08, D-09, D-10, D-11).
 *
 * Glyphs: ├── / └── / │   (continuation) /     (blank continuation).
 * Every line ends with ` @ {file}:{line}`. Paths are forward-slash only (D-07).
 *
 * Root node is rendered without a glyph prefix; descendants use ├──/└── with
 * │ / space continuation columns for each ancestor level.
 */

const TEXT_MAX = 60;

// IN-02: derive the attribute list type from the canonical TreeNode shape
// so a future change to TreeNode["attributes"] (e.g. adding a discriminator)
// surfaces as a compile error here instead of silently desyncing.
type AttrList = NonNullable<
  Extract<TreeNode, { kind: "element" }>["attributes"]
>;

function formatAttributes(attrs: AttrList | undefined): string {
  if (!attrs || attrs.length === 0) return "";
  // Defensive escape: backslashes FIRST (so we don't double-escape the
  // backslashes we add for quotes), then embedded double quotes (WR-05),
  // then newlines/CRs and angle brackets (WR-03). Without escaping `\n` /
  // `\r` an attribute value with a real linebreak would split the tree
  // line mid-render and desynchronize every subsequent prefix column.
  // `<` / `>` are escaped because the consumer surface is HTML-ish
  // (`<Name attr="…">`) and an attribute value containing them makes
  // element boundaries ambiguous for downstream parsers.
  const parts = attrs.map((a) => {
    const escaped = a.value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `${a.name}="${escaped}"`;
  });
  return ` ${parts.join(" ")}`;
}

function labelFor(node: TreeNode): string {
  switch (node.kind) {
    case "component":
      return `<${node.name}${formatAttributes(node.attributes)}>`;
    case "element":
      return `${node.tag}${formatAttributes(node.attributes)}`;
    case "text": {
      const v = node.value;
      // IN-01: slice by code points (not UTF-16 code units) so we never split
      // a surrogate pair mid-truncation. `Array.from` iterates by Unicode
      // scalar values, preserving emoji and astral-plane characters intact.
      const cp = Array.from(v);
      const shown = cp.length > TEXT_MAX ? `${cp.slice(0, TEXT_MAX).join("")}…` : v;
      return `"${shown}"`;
    }
    case "branch":
      return `? ${node.condition}`;
    case "list":
      return ".map";
    case "slot":
      return node.name === "children" ? "{children}" : `@${node.name}`;
    case "error":
      return `! ${node.message}`;
    case "fragment":
      return "<>";
    case "spread":
      return `{...${node.expression}}`;
  }
}

/**
 * Children for tree-walk purposes. Branch synthesizes [thenBranch, elseBranch]
 * (filtering nulls) so recursion renders both arms uniformly. list wraps its
 * single item. Leaf kinds (text, slot, error, spread) return [].
 */
function childrenOf(node: TreeNode): TreeNode[] {
  switch (node.kind) {
    case "component":
    case "element":
    case "fragment":
      return node.children;
    case "branch": {
      const out: TreeNode[] = [];
      if (node.thenBranch) out.push(node.thenBranch);
      if (node.elseBranch) out.push(node.elseBranch);
      return out;
    }
    case "list":
      return [node.item];
    default:
      return [];
  }
}

function lineFor(node: TreeNode): string {
  const label = labelFor(node);
  const hint = node.layoutHint ? ` ${node.layoutHint}` : "";
  return `${label}${hint} @ ${node.file}:${node.line}`;
}

function walk(
  node: TreeNode,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
  out: string[],
): void {
  const content = lineFor(node);
  if (isRoot) {
    out.push(content);
  } else {
    const glyph = isLast ? "└── " : "├── ";
    out.push(`${prefix}${glyph}${content}`);
  }
  const kids = childrenOf(node);
  const childPrefix = isRoot ? "" : `${prefix}${isLast ? "    " : "│   "}`;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    if (!child) continue;
    walk(child, childPrefix, i === kids.length - 1, false, out);
  }
}

export function renderMarkdown(tree: TreeNode, envelope: Envelope): string {
  const lines: string[] = [];
  if (envelope.warnings.length > 0) {
    for (const msg of envelope.warnings) {
      lines.push(`<!-- warning: ${msg} -->`);
    }
    lines.push("");
  }
  walk(tree, "", true, true, lines);
  return lines.join("\n");
}
