---
"@aokiapp/tlv": minor
---

Expand public API: expose parser schema types to consumers.

Changes:
- Add public exports for parser schema types to support direct typing in user code.
- Update tests to use package-level path aliases resolved by Vite plugin and tests/tsconfig.json.
- Enhance test runner script to compile declarations for tests before running Vitest.
- Update Vitest config for path alias resolution and coverage improvements; remove 'dist' from coverage exclude.

No runtime behavior changes; semver-minor due to expanded public API surface.