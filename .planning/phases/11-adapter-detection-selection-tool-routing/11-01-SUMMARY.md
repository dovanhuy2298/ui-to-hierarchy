---
plan: 11-01
phase: 11-adapter-detection-selection-tool-routing
status: complete
wave: 0
completed: 2026-05-18T00:00:00Z
---

# Plan 11-01 Summary — Test Fixtures + RED Test Stubs

## What was built
- Fixed missing package.json in test/fixtures/expo-basic/ and test/fixtures/next-app-router/
- Created complete monorepo-mixed fixture: workspace root + apps/web (Next.js) + apps/mobile (Expo Router)
- Wrote RED test stubs: test/adapters/expo/detect.test.ts (4 cases) and test/adapters/select.test.ts (8 cases)

## Files changed
- test/fixtures/expo-basic/package.json (created)
- test/fixtures/next-app-router/package.json (created)
- test/fixtures/monorepo-mixed/package.json (created)
- test/fixtures/monorepo-mixed/apps/web/package.json (created)
- test/fixtures/monorepo-mixed/apps/web/next.config.ts (created)
- test/fixtures/monorepo-mixed/apps/web/app/page.tsx (created)
- test/fixtures/monorepo-mixed/apps/mobile/package.json (created)
- test/fixtures/monorepo-mixed/apps/mobile/app/_layout.tsx (created)
- test/adapters/expo/detect.test.ts (created — RED)
- test/adapters/select.test.ts (created — RED)

## Verification results
- All 8 fixture files exist and contain expected dependencies
- Both test stub files exist (fail at import as expected — RED state)
- Existing test suite: 349 tests pass, 0 fail — unaffected by new stubs

## Deviations from Plan
None - plan executed exactly as written.

## State for Wave 1
Wave 1 plans (11-02, 11-03) can now run. detectExpoRouter tests will turn GREEN when src/adapters/expo/detect.ts is created. detectNextJs tests will turn GREEN when src/adapters/next/detect.ts exports detectNextJs. selectAdapter tests will turn GREEN when src/adapters/select.ts and src/adapters/expo/ExpoRouterAdapter.ts are created.

## Self-Check: PASSED
- All 10 files created and staged
- Commit b16e644 verified via git log
- Fixture package.json deps verified via node -e check
- Both test stub files exist per node statSync check
