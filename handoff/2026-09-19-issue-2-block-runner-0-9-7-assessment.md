# Ticket #2 assessment: block-runner 0.9.7

> Superseded on 2026-09-19 by the maintainer-approved adoption in
> `handoff/2026-09-19-issue-2-block-runner-0-9-7-adoption-report.md`.
> This report remains as the evidence gathered before that decision.

## Recommendation

Stay on the current `block-runner` `^0.8.0` range for now. Do not land a
dependency or `engines` change from this investigation.

0.9.7 is not a drop-in behavioral upgrade for this wrapper: the full suite
against the real installed package produced four pipeline failures caused by
changed canonicalization behavior. The new authoring capabilities are not
needed by this repository's validate/fix workflow. The detailed decision and
revisit trigger are recorded in
[`docs/adr/0007-adopt-block-runner-0-9-7-with-lossless-canonicalization.md`](../docs/adr/0007-adopt-block-runner-0-9-7-with-lossless-canonicalization.md).

## Installation and package evidence

Environment:

- Node `v24.19.0`
- npm `12.0.2`
- Installed command: `npm install --no-save --package-lock=false block-runner@0.9.7`
- Installed package: `block-runner 0.9.7`
- Tracked `package.json` and `package-lock.json`: unchanged
- Install result: 410 packages added/audited, 0 vulnerabilities

The install environment blocked block-runner's optional `postinstall`
`scripts/prune-wp-vips.mjs`; the package imported successfully and the
validate/canonicalize runtime exercised below did not depend on that cleanup.
The install also emitted npm peer-resolution warnings for the existing
WordPress/React graph; these did not prevent the suite from running.

`npm view` reports the following 0.9.7 production additions/changes relevant
to this ticket:

- `php-parser: 3.7.0`
- `@babel/parser: 7.29.8`, React 18.3.1, `postcss: 8.5.26`, `wesper: 0.4.1`
- Node engine: `^20.19.0 || ^22.13.0 || >=24.0.0`

The 0.9.7 import succeeded and exported `validate` and `canonicalize` along
with the authoring, plugin, proof, and style APIs added since 0.8.x.

## Full-suite evidence

Command:

```text
npm test
```

Result with 0.9.7 installed:

```text
Test Files  2 failed | 5 passed (7)
Tests       5 failed | 156 passed (161)
Duration    315.86s
```

The four pipeline failures were:

- `emits a byte-exact search for a residual, multi-line finding on a CRLF input after --fix`
- `locates a residual finding against the rewritten file`
- `slices a post-fix finding from the rewritten file, not the original`
- `is null when the correction does not resolve the finding`

All four use `unfixable-extra-attribute.html`, which 0.9.7 now
canonicalizes successfully. The direct runtime probe showed:

```json
{
  "version": "0.9.7",
  "validate": {
    "ok": false,
    "items": [{ "status": "invalid", "block": "core/group" }]
  },
  "canonicalize": {
    "ok": true,
    "items": [{ "status": "warning", "block": "core/group" }],
    "outputChanged": true,
    "output": "<!-- wp:group {\"className\":\"word-cloud-bg\",\"layout\":{\"type\":\"default\"}} -->\n<div class=\"wp-block-group word-cloud-bg\"></div>\n<!-- /wp:group -->"
  }
}
```

As a control, after installing 0.8.0 with the same no-save/no-lockfile
method, the three residual/correction tests selected from `tests/pipeline.test.js`
passed (`3 passed | 57 skipped`). 0.9.7 was then reinstalled for the final
targeted checks.

The fifth failure was unrelated to block-runner: the process environment has
`NO_COLOR=1`, while `tests/cli.test.js` injects `noColor: undefined` and expects
the unset-variable branch. Running the four `shouldColorize` tests with
`NO_COLOR` empty passed (`4 passed | 21 skipped`).

## Stderr capture verification

ADR 0004 says the in-process adapter temporarily patches
`process.stderr.write` around each sequential block-runner call. The existing
regression test was run with real 0.9.7:

```text
npx vitest run tests/pipeline.test.js -t "does not leak block-runner output"
Test Files  1 passed (1)
Tests       1 passed | 59 skipped (60)
```

The test spawns the CLI on the unfixable extra-attribute fixture and asserts
empty child stderr. It passed, confirming that 0.9.7's `canonicalize()` output
still routes through the adapter's `captureStderr()` containment. The full
suite's same test also passed.

## PHP parser overlap

`node_modules/block-runner/dist/chunk-4XJAYGBS.js` contains a `parsePhp()` helper
that dynamically loads `php-parser` and calls
`new Engine({ parser: { php7: true }, ast: { withPositions: true } }).parseCode(...)`.
The helper is reached by the authoring compiler while validating generated
`block.php` output. It is not part of the existing `validate()`/
`canonicalize()` markup path.

This does not overlap the repository's own Layer 0 PHP-fragment handling:

- `src/php-fragment.js` recognizes the supported leading header,
  embedded-PHP tags, and trailing PHP section.
- Embedded/trailing PHP is masked with same-shaped whitespace to preserve
  offsets and lines, and a `PHP_INTERPOLATION_UNCHECKED` or
  `PHP_TRAILING_SECTION` finding is emitted.
- The downstream structural and block-runner layers therefore never claim to
  validate through embedded PHP.

`php-parser` is an AST parser for generated authoring source; this project is a
flag-and-mask safety boundary for incoming pattern markup. Keep the local
module; do not add or adopt `php-parser` for this workflow based on 0.9.7's
dependency.

## Authoring workflow relevance

0.9.0--0.9.7 add source-bound proposals, registered-block authoring, plugin
inspect/preview/write, style adapters, and proof-oriented delivery APIs. They
serve generation of reusable registered block source and plugin packaging. This
repository consumes block-runner only for Layer 2 save()-diff validation and
canonicalization in its human and agent workflows. None of the new APIs fills a
gap in that contract, so adoption is declined/deferred to a separate,
explicitly scoped ticket.

## Files changed

- `docs/adr/0007-adopt-block-runner-0-9-7-with-lossless-canonicalization.md` — decision, evidence
  summary, and revisit trigger.
- `handoff/2026-09-19-issue-2-block-runner-0-9-7-assessment.md` — durable
  implementation/investigation report.

No source, test, dependency, lockfile, or Node engine files were changed.
