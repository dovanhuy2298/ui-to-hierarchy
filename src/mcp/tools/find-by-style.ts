import { z } from "zod";
import { notImplemented, internalError } from "../errors.js";
import type { ToolResponse } from "../errors.js";
import { resolveRoot } from "../../core/resolve-root.js";

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
  projectRoot: z
    .string()
    .optional()
    .describe(
      "Absolute path to the Next.js project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().",
    ),
});

export async function handler(args: z.infer<typeof inputSchema>): Promise<ToolResponse> {
  try {
    const _root = resolveRoot(args.projectRoot);
    return notImplemented(name);
  } catch (err) {
    return internalError(name, err);
  }
}
