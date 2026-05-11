import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  shims: false,
  dts: false,
  banner: { js: "#!/usr/bin/env node" },
  external: [
    "@modelcontextprotocol/sdk",
    "@babel/parser",
    "@babel/traverse",
    "@babel/types",
    "zod",
    "get-tsconfig",
    "tinyglobby",
  ],
  define: {
    __TOOL_VERSION__: JSON.stringify(pkg.version),
    __INIT_MARKER_VERSION__: JSON.stringify(
      pkg.version.split(".").slice(0, 2).join("."),
    ),
  },
});
