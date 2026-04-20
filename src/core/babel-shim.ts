// Babel traverse ESM/CJS interop shim.
//
// `@babel/traverse` ships as CJS and exposes its callable under `.default`
// in some bundler/runtime interop paths but as the module namespace itself
// in others. A naive `import traverse from "@babel/traverse"` is therefore
// forbidden per CLAUDE.md — it works in some environments and silently
// breaks in others (see Babel issues #13855 and #15269).
//
// This shim is the ONLY place we import `@babel/traverse`. Everything else
// in the codebase must import `traverse` from this module.
import traverseImport from "@babel/traverse";

export const traverse = (traverseImport as any).default ?? traverseImport;
export default traverse;
