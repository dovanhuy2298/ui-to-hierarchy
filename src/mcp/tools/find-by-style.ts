import { z } from "zod";
import { notImplemented, withErrorBoundary } from "../errors.js";
import type { ToolResponse } from "../errors.js";
import { resolveRoot } from "../../core/resolve-root.js";
import { projectRootSchema } from "./common.js";

export const name = "find_by_style";
export const title = "Find By Style";
export const description =
  "Finds component nodes that use a given CSS class name or style prop. " +
  "Returns matching nodes with file:line location.";

export const inputSchema = z.object({
  class_or_prop: z
    .string()
    .min(1)
    .describe(
      "CSS class name or style prop to search for (e.g., flex, bg-blue-500, color, marginTop).",
    ),
  projectRoot: projectRootSchema,
});

export async function handler(args: z.infer<typeof inputSchema>): Promise<ToolResponse> {
  return withErrorBoundary(name, async () => {
    const _root = resolveRoot(args.projectRoot);
    return notImplemented(name);
  });
}
