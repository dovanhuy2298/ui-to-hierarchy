# Phase 6 Performance Baseline

**Generated:** 2026-05-05T04:04:24.285Z

**Methodology:** cold spawn of dist/cli.js per invocation, 30 samples per tool, end-to-end wall-clock from spawn to JSON-RPC response.

## Host

- Platform: win32 (x64)
- Node: v24.13.0
- CPU: 12th Gen Intel(R) Core(TM) i5-12500H × 16
- RAM: 15.7 GB

## Latency (ms)

| Tool | min | p50 | p95 | max |
| ---- | --- | --- | --- | --- |
| get_full_hierarchy | 399.5 | 430.8 | 568.3 | 590.8 |
| focus_on | 412.5 | 434.5 | 501.1 | 561.0 |
| find_by_text | 414.9 | 441.6 | 518.7 | 543.3 |
| find_by_style | 420.0 | 435.2 | 472.7 | 597.2 |

> Reproducibility: re-running on the same machine should yield p95 within ±20% (manual sanity check, not enforced).
