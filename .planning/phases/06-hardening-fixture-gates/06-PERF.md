# Phase 6 Performance Baseline

**Generated:** 2026-05-05T07:41:58.913Z

**Methodology:** cold spawn of dist/cli.js per invocation, 30 samples per tool, end-to-end wall-clock from spawn to JSON-RPC response.

## Host

- Platform: win32 (x64)
- Node: v24.13.0
- CPU: 12th Gen Intel(R) Core(TM) i5-12500H × 16
- RAM: 15.7 GB

## Latency (ms)

| Tool | min | p50 | p95 | max |
| ---- | --- | --- | --- | --- |
| get_full_hierarchy | 401.8 | 422.9 | 516.1 | 516.7 |
| focus_on | 405.5 | 417.0 | 506.7 | 530.3 |
| find_by_text | 405.9 | 424.7 | 455.5 | 543.9 |
| find_by_style | 408.4 | 427.1 | 496.7 | 506.6 |

> Reproducibility: re-running on the same machine should yield p95 within ±20% (manual sanity check, not enforced).
