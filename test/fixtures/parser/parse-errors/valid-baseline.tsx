export function Hello() {
  return <span>world</span>;
}
// IN-04: Line 1 is LOAD-BEARING. `test/core/parser/parseFile.test.ts` asserts
// `declLines.get("Hello") === 1` against this fixture. Do NOT prepend
// imports, comments, or blank lines above `export function Hello` without
// also updating that assertion.
