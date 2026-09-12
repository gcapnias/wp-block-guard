# Tests

Automated test suite for `wp-block-guard`, run with [vitest](https://vitest.dev/).

## Running the tests

```sh
npm test
```

This runs `vitest run` (see `package.json`). Configuration lives in `vitest.config.js`
at the repo root: a 20s default per-test timeout (block-runner spawns a real headless
Gutenberg process per validation call, which is slower than vitest's 5s default), and
`.claude/worktrees/**` excluded from discovery.

To run a single file or filter by name:

```sh
npx vitest run tests/structural.test.js
npx vitest run -t "qualifyBlockName"
```

Wall-clock time is dominated by real `block-runner` process spawns (~10s steady-state
each). A full run currently takes ~2 minutes. Tests that perform 2–3 sequential
block-runner spawns (`--fix` pipeline tests, the `--strict` CLI test) set explicit
higher per-test timeouts.

## Structure

```
tests/
├── structural.test.js    unit tests — Layer 1 (src/structural.js)
├── php-fragment.test.js  unit tests — Layer 0 (src/php-fragment.js)
├── pipeline.test.js      integration tests — validateFile() (src/pipeline.js)
├── cli.test.js           end-to-end tests — bin/wp-block-guard.js
└── fixtures/
    ├── wp-block-guard/   fixtures for this suite (see below)
    ├── mastermind-ls/    unrelated fixtures for a different tool
    └── derived/          unrelated fixtures for a different tool
```

### `structural.test.js`

Unit tests against inline strings (no file I/O, no block-runner spawn) for
`tokenizeDelimiters`, `runStructuralLayer`, and `qualifyBlockName`: balanced pairs,
self-closing delimiters, invalid attribute JSON, non-`wp:` comments, namespaced block
names, no-blocks, unbalanced delimiters, mismatched closers, and bare-name-to-`core/`
qualification on findings.

### `php-fragment.test.js`

Unit tests against inline strings for `extractPhpHeader`, `scanForEmbeddedPhp`, and
`maskEmbeddedPhp`: header stripping, single-occurrence-per-tag reporting (short-echo
tags, multiple tags, unterminated openers).

### `pipeline.test.js`

Calls `validateFile()` directly against every fixture in
`tests/fixtures/wp-block-guard/` (one real `block-runner` spawn per test where Layer 2
runs), plus `--fix` behavior — copying the invalid fixture to a temp file first, never
mutating the checked-in fixture — including multi-finding `--fix` and 3-level nested
mismatched closers.

Also covers `--suggest`: that it leaves the file byte-identical (compared as `Buffer`s,
not strings), that its findings and `ok` deep-equal a plain run of the same file, that
its skip reasons are the *same strings* `--fix` emits, and that it still returns a
suggestion for a file whose finding the correction cannot resolve — parity with `--fix`,
which writes that file too.

The line-ending tests deliberately **construct** their inputs byte-by-byte instead of
copying a fixture. `core.autocrlf` rewrites checked-in text files on checkout, and every
fixture here is committed as LF, so a fixture's on-disk endings are a property of the
machine rather than of the repo — a "CRLF fixture" silently becomes an LF one on a fresh
clone, and an assertion resting on it would test nothing. See the `conformToSource` unit
tests for the normalization rules in isolation.

### `cli.test.js`

Spawns `bin/wp-block-guard.js` via `child_process.spawnSync` end-to-end: clean exit 0,
`BLOCK_INVALID` exit 1, `--strict` exit code and human-output PASS/FAIL labeling,
no-args usage error (exit 2, help to stderr), no-glob-match usage error (exit 2),
`--version`, and multi-file JSON output ordering (alphabetical by full resolved path,
independent of argument order).

## Fixtures (`tests/fixtures/wp-block-guard/`)

Each fixture's expected findings were verified empirically by running
`node bin/wp-block-guard.js <file> --json` before locking in test assertions.

| File | Scenario | Finding code(s) triggered |
| --- | --- | --- |
| `valid-heading.html` | `core/heading` block whose HTML already matches `save()` output (has `wp-block-heading` class) | none — clean |
| `invalid-heading-missing-class.html` | Same block, missing `class="wp-block-heading"` — the classic "unexpected or invalid content" case | `BLOCK_INVALID` |
| `unbalanced-delimiter.html` | `<!-- wp:heading -->` opener with no matching closer | `STRUCTURAL_UNBALANCED_DELIMITER`, `BLOCK_RUNNER_SKIPPED` (no `BLOCK_INVALID`) |
| `mismatched-closer.html` | `wp:group` opened, `wp:paragraph` opened, closers in the wrong order | `STRUCTURAL_MISMATCHED_CLOSER` (x2), `BLOCK_RUNNER_SKIPPED` |
| `invalid-attrs-json.html` | `<!-- wp:heading {level:2} -->` — unquoted key, invalid JSON | `STRUCTURAL_INVALID_ATTRS_JSON`, `BLOCK_RUNNER_SKIPPED` |
| `no-blocks.html` | Plain `<p>Hello</p>` with zero `wp:` delimiters | `STRUCTURAL_NO_BLOCKS` (warning only; `ok: true`) |
| `pattern-with-header.php` | Leading `<?php /* Title: ... */ ?>` header + clean valid block markup | `PHP_HEADER_STRIPPED` (info); otherwise clean |
| `pattern-with-header-invalid-heading.php` | Leading header + a **repairable** `core/heading` missing `class="wp-block-heading"`. The only fixture combining a stripped PHP header with a fixable block, so the only one that can prove a suggestion re-attaches the header — every other criterion passes if the body is returned alone. (`pattern-with-header.php` is clean and short-circuits; the interpolation fixtures trip the embedded-PHP gate first.) | `PHP_HEADER_STRIPPED`, `BLOCK_INVALID` |
| `pattern-with-interpolation.php` | Leading header + `core/paragraph` block with embedded `<?php echo esc_html($x); ?>` mid-markup | `PHP_HEADER_STRIPPED`, `PHP_INTERPOLATION_UNCHECKED` (exactly one); no crash in structural/block-runner layers on the masked remainder |
| `two-invalid-headings.html` | Two separate `core/heading` blocks, each missing `class="wp-block-heading"` | `BLOCK_INVALID` (x2) |
| `deeply-nested-mismatched-closer.html` | `wp:group > wp:columns > wp:column` (3 levels), with `/wp:columns` and `/wp:column` closed out of order | `STRUCTURAL_MISMATCHED_CLOSER` (x2), `BLOCK_RUNNER_SKIPPED` |
| `interpolated-delimiter-attrs.php` | `<?php ?>` interpolated **inside a delimiter comment's attribute JSON** — the only shape where slicing `search` from the PHP-masked body differs from the original | `PHP_HEADER_STRIPPED`, `PHP_INTERPOLATION_UNCHECKED`, `STRUCTURAL_INVALID_ATTRS_JSON` (the masked JSON no longer parses), `BLOCK_RUNNER_SKIPPED` |
| `invalid-parent-valid-child.html` | `core/group` missing its `wp-block-group` class, wrapping a **valid** `core/paragraph` child — the only fixture exercising `match`'s children-gate (wpbg-lsf): the parent is a real, otherwise-fixable near-miss, but has children, so `match` must be `null` | `BLOCK_INVALID` (the group only; the child is clean) |

When adding a fixture, run it through the CLI with `--json` first and copy the actual
output into the test assertion — do not guess expected findings.

## Coverage snapshot

4 test files, 43 tests, all passing as of the last full run. No tests are skipped.

## Known gaps

- **Performance** is not covered by this suite. `block-runner` spawns a fresh process
  per validation call (~10s steady-state, regardless of file size); this is a
  characteristic of `block-runner`'s own startup cost, not something a test can assert
  against without an unrealistic timeout.
- **`--fix` when `fixMarkup` itself fails or returns null**, and **`BLOCK_RUNNER_FAILURE`**
  (block-runner failing to invoke, or returning unparseable output), are both untested.
  Both depend on the internals of the block-runner adapter (subprocess spawn failure,
  non-JSON stdout, the `fix` command's temp-file `--out` step failing).
- **The hand-built `BLOCK_RUNNER_FAILURE` finding in `src/cli.js`'s per-file catch block**
  is not asserted against. It is constructed as an object literal rather than through
  `makeFinding()`, so its shape — including `search: null` — is kept in step by
  inspection, not by a test. Reaching it means making `validateFile()` throw for a file
  the CLI has already globbed successfully.
- **`BLOCK_RUNNER_WARNING` has no fixture and is very likely unreachable** as things
  stand: the installed `block-runner` version's `validate()` function only ever
  produces `status: "invalid"` items — never `status: "warning"` — on the `validate`/
  `fix` code paths this tool calls. The only `status: "warning"` sites in
  `block-runner`'s own bundle live inside its separate `convert` command, which this
  tool never invokes. Left as an open gap rather than faked with a synthetic fixture.

## Adding tests

- Prefer inline-string unit tests (`structural.test.js`, `php-fragment.test.js` style)
  for pure functions — they run instantly and need no block-runner spawn.
- Add a fixture file under `tests/fixtures/wp-block-guard/` for anything that needs to
  exercise the full pipeline or a real `block-runner` invocation, and verify its actual
  findings via the CLI before writing the assertion.
- `--fix` tests must copy the fixture to a temp file before fixing — never write `--fix`
  output back into a checked-in fixture.
