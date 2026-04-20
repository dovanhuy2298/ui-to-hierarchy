import { z } from "zod";
import { TreeNodeSchema } from "./schema.js";

/**
 * EnvelopeSchema — the top-level MCP response wrapper (D-15).
 *
 * schemaVersion is pinned to the literal "1" so consumers can version-gate.
 * generatedAt must be ISO 8601 (zod `.datetime()`).
 */
export const EnvelopeSchema = z.object({
  schemaVersion: z.literal("1"),
  resolvedRoot: z.string(),
  toolVersion: z.string(),
  generatedAt: z.string().datetime(),
  warnings: z.array(z.string()),
  tree: TreeNodeSchema,
});

export type Envelope = z.infer<typeof EnvelopeSchema>;
