# Phase 6 Performance Baseline

**Generated:** 2026-05-05T06:40:14.853Z

**Methodology:** cold spawn of dist/cli.js per invocation, 30 samples per tool, end-to-end wall-clock from spawn to JSON-RPC response.

## Host

- Platform: win32 (x64)
- Node: v24.13.0
- CPU: 12th Gen Intel(R) Core(TM) i5-12500H × 16
- RAM: 15.7 GB

## Latency (ms)

| Tool | min | p50 | p95 | max |
| ---- | --- | --- | --- | --- |
| get_full_hierarchy | 410.0 | 425.3 | 531.8 | 550.0 |
| focus_on | 406.7 | 433.5 | 530.4 | 696.5 |
| find_by_text | 404.7 | 426.3 | 488.0 | 508.4 |
| find_by_style | 411.4 | 448.0 | 541.8 | 547.0 |

> Reproducibility: re-running on the same machine should yield p95 within ±20% (manual sanity check, not enforced).
