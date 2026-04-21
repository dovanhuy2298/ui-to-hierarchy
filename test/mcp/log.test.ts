import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "../../src/mcp/log.js";

describe("log — stderr output", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    delete process.env.MCP_DEBUG;
  });

  it("log.info writes to stderr, not stdout", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info("hello");
    expect(stderrSpy).toHaveBeenCalledOnce();
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  it("log.info emits valid JSON", () => {
    log.info("hello");
    const written = stderrSpy.mock.calls[0]?.[0];
    expect(typeof written).toBe("string");
    expect(() => JSON.parse(written as string)).not.toThrow();
  });

  it("log.info JSON contains level: info, msg, and ts fields", () => {
    log.info("hello");
    const entry = JSON.parse(stderrSpy.mock.calls[0]?.[0] as string);
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("hello");
    expect(typeof entry.ts).toBe("string");
  });

  it("log.info spreads meta fields into JSON", () => {
    log.info("hello", { v: 1, key: "val" });
    const entry = JSON.parse(stderrSpy.mock.calls[0]?.[0] as string);
    expect(entry.v).toBe(1);
    expect(entry.key).toBe("val");
  });

  it("log.warn emits level: warn", () => {
    log.warn("uh oh");
    const entry = JSON.parse(stderrSpy.mock.calls[0]?.[0] as string);
    expect(entry.level).toBe("warn");
    expect(entry.msg).toBe("uh oh");
  });

  it("log.error emits level: error", () => {
    log.error("broke");
    const entry = JSON.parse(stderrSpy.mock.calls[0]?.[0] as string);
    expect(entry.level).toBe("error");
    expect(entry.msg).toBe("broke");
  });

  it("ts field is a valid ISO 8601 string", () => {
    log.info("time check");
    const entry = JSON.parse(stderrSpy.mock.calls[0]?.[0] as string);
    expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
  });

  it("each line ends with a newline", () => {
    log.info("newline check");
    const written = stderrSpy.mock.calls[0]?.[0] as string;
    expect(written.endsWith("\n")).toBe(true);
  });
});

describe("log.debug — conditional output", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    delete process.env.MCP_DEBUG;
  });

  it("log.debug is a no-op when MCP_DEBUG is unset", () => {
    delete process.env.MCP_DEBUG;
    log.debug("silent");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("log.debug is a no-op when MCP_DEBUG is '0'", () => {
    process.env.MCP_DEBUG = "0";
    log.debug("silent");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("log.debug writes when MCP_DEBUG === '1'", () => {
    process.env.MCP_DEBUG = "1";
    log.debug("loud");
    expect(stderrSpy).toHaveBeenCalledOnce();
    const entry = JSON.parse(stderrSpy.mock.calls[0]?.[0] as string);
    expect(entry.level).toBe("debug");
    expect(entry.msg).toBe("loud");
  });
});
