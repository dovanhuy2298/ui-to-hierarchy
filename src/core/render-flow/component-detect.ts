/**
 * PARSE-04 component discovery + HOC unwrap.
 *
 * `discoverComponents(ast)` walks a parsed file and returns every top-level
 * component declaration:
 *   - FunctionDeclaration with capitalized name
 *   - VariableDeclarator with arrow/function init (with HOC unwrap)
 *   - ClassDeclaration extending Component / PureComponent (qualified or unqualified)
 *   - ExportDefaultDeclaration wrapping an HOC call expression
 *
 * `unwrapHocChain(node)` peels off recognized HOCs (memo, forwardRef, observer,
 * /^with[A-Z]/, /HOC$/) outermost-to-innermost. The returned `wrappers[]`
 * preserves outer-to-inner order (RESEARCH Pattern 5).
 */
import * as t from "@babel/types";
import { traverse } from "../babel-shim.js";

const HOC_NAMES = new Set(["memo", "forwardRef", "observer"]);
const HOC_PATTERNS: RegExp[] = [/^with[A-Z]/, /HOC$/];

export function isHocCallee(name: string): boolean {
  return HOC_NAMES.has(name) || HOC_PATTERNS.some((re) => re.test(name));
}

export interface UnwrapResult {
  /** Wrappers in outer-to-inner order. e.g. memo(forwardRef(Foo)) → ["memo", "forwardRef"]. */
  wrappers: string[];
  /** The inner node — function/class/identifier/CallExpression. */
  inner: t.Node;
}

/**
 * Unwrap a wrapping HOC chain. Stops at the first non-call or non-HOC callee.
 * Accepts e.g. `memo(forwardRef(observer(Foo)))` and returns
 * `{ wrappers: ["memo","forwardRef","observer"], inner: <Identifier "Foo"> }`.
 */
export function unwrapHocChain(node: t.Node): UnwrapResult {
  const wrappers: string[] = [];
  let current: t.Node = node;
  while (
    t.isCallExpression(current) &&
    t.isIdentifier(current.callee) &&
    isHocCallee(current.callee.name)
  ) {
    wrappers.push(current.callee.name);
    const arg = current.arguments[0];
    if (
      !arg ||
      (!t.isIdentifier(arg) &&
        !t.isArrowFunctionExpression(arg) &&
        !t.isFunctionExpression(arg) &&
        !t.isCallExpression(arg))
    ) {
      break;
    }
    current = arg as t.Node;
  }
  return { wrappers, inner: current };
}

export interface DiscoveredComponent {
  name: string;
  kind: "function" | "class";
  wrappers: string[];
  /** Node fed into `walkRenderFlow` — function/arrow body, ClassMethod, or Identifier ref. */
  body: t.Node;
  declarationLine: number;
}

/**
 * PARSE-04 superclass test:
 *   `extends Component | PureComponent | React.Component | React.PureComponent`.
 */
export function isReactComponentSuperclass(node: t.Node | null | undefined): boolean {
  if (!node) return false;
  if (t.isIdentifier(node)) return node.name === "Component" || node.name === "PureComponent";
  if (t.isMemberExpression(node) && !node.computed) {
    return (
      t.isIdentifier(node.object) &&
      node.object.name === "React" &&
      t.isIdentifier(node.property) &&
      (node.property.name === "Component" || node.property.name === "PureComponent")
    );
  }
  return false;
}

/** Discover every top-level component (function + class) in the parsed file. */
export function discoverComponents(ast: t.File): DiscoveredComponent[] {
  const out: DiscoveredComponent[] = [];

  traverse(ast, {
    FunctionDeclaration(p: { node: t.FunctionDeclaration }) {
      const id = p.node.id;
      if (!id || !/^[A-Z]/.test(id.name)) return;
      out.push({
        name: id.name,
        kind: "function",
        wrappers: [],
        body: p.node,
        declarationLine: p.node.loc?.start.line ?? 0,
      });
    },
    VariableDeclarator(p: { node: t.VariableDeclarator }) {
      const id = p.node.id;
      if (!t.isIdentifier(id) || !/^[A-Z]/.test(id.name)) return;
      if (!p.node.init) return;
      const { wrappers, inner } = unwrapHocChain(p.node.init);
      if (t.isArrowFunctionExpression(inner) || t.isFunctionExpression(inner)) {
        out.push({
          name: id.name,
          kind: "function",
          wrappers,
          body: inner,
          declarationLine: p.node.loc?.start.line ?? 0,
        });
      } else if (t.isIdentifier(inner) && wrappers.length > 0) {
        // e.g. `memo(Foo)` where Foo is declared elsewhere — record wrapper, body is the Identifier.
        out.push({
          name: id.name,
          kind: "function",
          wrappers,
          body: inner,
          declarationLine: p.node.loc?.start.line ?? 0,
        });
      }
    },
    ClassDeclaration(p: { node: t.ClassDeclaration }) {
      if (!isReactComponentSuperclass(p.node.superClass)) return;
      const name = p.node.id?.name;
      if (!name) return;
      const renderMethod = p.node.body.body.find(
        (m): m is t.ClassMethod =>
          t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === "render",
      );
      out.push({
        name,
        kind: "class",
        wrappers: [],
        body: renderMethod ?? p.node,
        declarationLine: p.node.loc?.start.line ?? 0,
      });
    },
    ExportDefaultDeclaration(p: { node: t.ExportDefaultDeclaration }) {
      const decl = p.node.declaration;
      // Named function/class declarations are already captured by their dedicated visitor — skip.
      if (t.isFunctionDeclaration(decl) && decl.id && /^[A-Z]/.test(decl.id.name)) return;
      if (t.isClassDeclaration(decl) && decl.id && /^[A-Z]/.test(decl.id.name)) return;
      // Wrapped expression: `export default memo(Foo)`.
      if (t.isExpression(decl)) {
        const { wrappers, inner } = unwrapHocChain(decl);
        const name = t.isIdentifier(inner) ? inner.name : "default";
        if (/^[A-Z]/.test(name)) {
          out.push({
            name,
            kind: "function",
            wrappers,
            body: inner,
            declarationLine: p.node.loc?.start.line ?? 0,
          });
        }
      }
    },
  });

  return out;
}
