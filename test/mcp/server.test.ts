import { describe, it } from "vitest";

// Tier 1 — in-process tests using InMemoryTransport + Client
// Stubs filled in by plan 02-05 after Wave 1 implementation is complete.

describe("MCP server — tool registration (MCP-01)", () => {
  it.todo("initialize handshake succeeds");
  it.todo("listTools returns exactly 4 tools");
  it.todo(
    "listTools returns get_full_hierarchy, focus_on, find_by_text, find_by_style",
  );
  it.todo("each tool has a non-empty description");
  it.todo("each tool has a non-empty title");
});

describe("MCP server — tool schemas (MCP-02)", () => {
  it.todo(
    "get_full_hierarchy: route field is required and validates Next.js paths",
  );
  it.todo("get_full_hierarchy: format field defaults to markdown");
  it.todo("focus_on: component field validates PascalCase only");
  it.todo("focus_on: scope field defaults to full");
  it.todo(
    "get_full_hierarchy: invalid route returns isError:true without calling handler",
  );
  it.todo(
    "focus_on: invalid component name returns isError:true without calling handler",
  );
});

describe("MCP server — not-implemented responses (MCP-03)", () => {
  it.todo("get_full_hierarchy returns isError:true with tool name in message");
  it.todo("focus_on returns isError:true with tool name in message");
  it.todo("find_by_text returns isError:true with tool name in message");
  it.todo("find_by_style returns isError:true with tool name in message");
  it.todo("handler exception is caught and returns internalError response");
});
