// POLISH-03 regression fixture: Foo is declared on line 3 deterministically.
// The resolved component TreeNode must report line: 3 (not the legacy `line: 1` placeholder).
export function Foo() { return <div>foo</div>; }
