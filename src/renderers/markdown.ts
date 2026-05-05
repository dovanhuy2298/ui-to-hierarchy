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

function formatAttributes(
  attrs: Array<{ name: string; value: string }> | undefined,
): string {
  if (!attrs || attrs.length === 0) return "";
  // Defensive escape: backslashes FIRST (so we don't double-escape the
  // backslashes we add for quotes), then embedded double quotes. WR-05.
  const parts = attrs.map((a) => {
    const escaped = a.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
      const shown = v.length > TEXT_MAX ? `${v.slice(0, TEXT_MAX)}…` : v;
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

export function renderMarkdown(tree: TreeNode, _envelope: Envelope): string {
  const lines: string[] = [];
  walk(tree, "", true, true, lines);
  return lines.join("\n");
}
