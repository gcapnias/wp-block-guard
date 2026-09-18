# Adopt block-runner 0.9.7

## Outcome

`wp-block-guard` now depends on `block-runner ^0.9.7` and declares the same
Node support range as upstream: `^20.19.0 || ^22.13.0 || >=24.0.0`.

The upgrade retains this project's lossless canonicalization contract. When
`canonicalize()` reports any warning, the adapter declines its output because
0.9.7's warning-bearing invalid-block rebuild can remove authored attributes
and change styling. Consequently, `--fix` leaves that file untouched and
`--suggest` returns no candidate. Warning-free near-miss repairs continue to
work as before.

## Implementation

- `canonicalizeMarkup()` retains the warning metadata needed by the pipeline.
- The established `fixMarkup(): Promise<string|null>` contract remains for
  callers that need only safe correction text.
- The pipeline reports a specific unsafe-auto-fix reason for warning-bearing
  rebuilds.
- Tests cover an untouched CRLF file, retained `BLOCK_INVALID` finding,
  withheld suggestion, and byte-exact search text for the unsafe fixture.
- User-facing Node-version guidance and ADR 0007 were updated.

## Verification

- `npx vitest run tests/pipeline.test.js --reporter=verbose` with `NO_COLOR`
  unset: **60 passed**.
- `npx vitest run tests/cli.test.js --reporter=verbose -t "emits the suggestion
  in JSON"` with `NO_COLOR` unset: **1 passed, 24 skipped**.
- `npm install --package-lock-only --ignore-scripts`: completed with no lockfile
  inconsistency and no vulnerabilities. npm emitted pre-existing peer-resolution
  warnings in the WordPress/React dependency graph.

The CLI suite cannot be run as one terminal invocation in this environment:
the terminal execution wrapper ends the process at roughly 60 seconds, while
the real CLI cases each cold-start block-runner for about 10 seconds. The
pipeline suite, which contains the upgrade-sensitive behavior, completed in
full.
