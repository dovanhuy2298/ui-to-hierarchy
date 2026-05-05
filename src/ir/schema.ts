import { z } from "zod";

/**
 * TreeNode — the IR's 9-kind discriminated union (D-01, D-10, D-11).
 *
 * NOTE (D-04 concession): Zod v4 cannot fully infer the type of a recursive
 * `discriminatedUnion` wrapped in `z.lazy`. We therefore declare `TreeNode`
 * as an explicit TypeScript type alias and annotate `TreeNodeSchema` with
 * `z.ZodType<TreeNode>`. This is the documented Zod recursive-union pattern;
 * the type alias and schema must be kept in sync manually.
 */
export type TreeNode =
  | {
      kind: "component";
      name: string;
      children: TreeNode[];
      file: string;
      line: number;
      layoutHint?: string;
      attributes?: Array<{ name: string; value: string }>;
    }
  | {
      kind: "element";
      tag: string;
      children: TreeNode[];
      file: string;
      line: number;
      layoutHint?: string;
      attributes?: Array<{ name: string; value: string }>;
    }
  | {
      kind: "text";
      value: string;
      file: string;
      line: number;
      layoutHint?: string;
    }
  | {
      kind: "branch";
      condition: string;
      thenBranch: TreeNode | null;
      elseBranch: TreeNode | null;
      file: string;
      line: number;
      layoutHint?: string;
    }
  | {
      kind: "list";
      item: TreeNode;
      file: string;
      line: number;
      layoutHint?: string;
    }
  | {
      kind: "slot";
      name: string;
      file: string;
      line: number;
      layoutHint?: string;
    }
  | {
      kind: "error";
      message: string;
      file: string;
      line: number;
      layoutHint?: string;
    }
  | {
      kind: "fragment";
      children: TreeNode[];
      file: string;
      line: number;
      layoutHint?: string;
    }
  | {
      kind: "spread";
      expression: string;
      file: string;
      line: number;
      layoutHint?: string;
    };

// Shared base fields present on every node (D-11: layoutHint optional).
const BaseNode = {
  file: z.string(),
  line: z.number().int().nonnegative(),
  layoutHint: z.string().optional(),
};

export const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("component"),
      name: z.string(),
      children: z.array(TreeNodeSchema),
      ...BaseNode,
      attributes: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    }),
    z.object({
      kind: z.literal("element"),
      tag: z.string(),
      children: z.array(TreeNodeSchema),
      ...BaseNode,
      attributes: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    }),
    z.object({
      kind: z.literal("text"),
      value: z.string(),
      ...BaseNode,
    }),
    z.object({
      kind: z.literal("branch"),
      condition: z.string(),
      thenBranch: z.union([TreeNodeSchema, z.null()]),
      elseBranch: z.union([TreeNodeSchema, z.null()]),
      ...BaseNode,
    }),
    z.object({
      kind: z.literal("list"),
      item: TreeNodeSchema,
      ...BaseNode,
    }),
    z.object({
      kind: z.literal("slot"),
      name: z.string(),
      ...BaseNode,
    }),
    z.object({
      kind: z.literal("error"),
      message: z.string(),
      ...BaseNode,
    }),
    z.object({
      kind: z.literal("fragment"),
      children: z.array(TreeNodeSchema),
      ...BaseNode,
    }),
    z.object({
      kind: z.literal("spread"),
      expression: z.string(),
      ...BaseNode,
    }),
  ]),
);
