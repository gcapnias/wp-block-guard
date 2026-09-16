# Tests

Automated test suite for `wp-block-guard`, run with [vitest](https://vitest.dev/).

## Running the tests

```sh
npm test
```

This runs `vitest run` (see `package.json`). Configuration lives in `vitest.config.js`
at the repo root, and is three settings:

- **`testTimeout: 5000`** — vitest's own default. Deliberately *not* raised globally;
  see "Timeouts and the block-runner boot" below.
- **`fileParallelism: false`** — test files run one at a time. This is a correctness
  setting, not a speed one (`wpbg-f06`).
- **`exclude: [.claude/worktrees/**]`** — those are full nested checkouts with their own
  `tests/*.test.js`, which vitest would otherwise discover and run.

To run a single file or filter by name:

```sh
npx vitest run tests/structural.test.js
npx vitest run -t "qualifyBlockName"
```

Both work for every test in the suite. Keep it that way: a budget that only holds
because some *earlier* test warmed block-runner will pass a full run and fail
`-t "<that case>"`.

## Timeouts and the block-runner boot

`block-runner` loads jsdom + the `@wordpress/*` tree lazily, at its **first
`validate()` call** — not at import. So the boot lands inside whatever is running at
the time, and it is paid **once per OS process**
(`docs/adr/0004-in-process-block-runner-invocation.md`).

Two consequences, and the suite handles them differently:

- **`pipeline.test.js`** calls `validateFile` in-process, so one boot covers the whole
  file. It is paid in a `beforeAll` warm-up hook, which keeps it out of any individual
  test's budget and makes every case runnable on its own.
- **`cli.test.js`** spawns the real binary per case, so each spawn pays a fresh boot in
  the child. A warm-up cannot help; those describe blocks carry raised budgets instead.

### Measured costs (2026-09-16, 12-core machine)

This table is the single source for the numbers cited in `vitest.config.js`,
`tests/pipeline.test.js`, and `tests/cli.test.js`. Update it here, not there.

| What | Cost |
|---|---|
| `import('block-runner')` | 1.1–1.3s |
| First `validate()` in a process (the boot) | 8.0–13.9s |
| Every in-process `validate()` after it | 2–160ms |
| One block-runner-backed CLI invocation | 8.3–13.0s |
| Two such invocations in one case (`--strict`) | 16.0–23.1s |
| CLI invocation that never reaches block-runner | 1.1–2.5s |
| Full suite, serial | ~119–155s |

Note this re-measures ADR 0004's "11–36ms" figure for post-boot in-process calls; the
spread is wider (2–160ms) on the fixtures this suite uses, but the conclusion the ADR
draws from it is unchanged.

### Where raised budgets live, and why

These are **budgets, not costs** — they are sized well above the table above on
purpose. A timeout here can only ever catch block-runner *hanging*; it cannot
make the boot faster, so a tight number buys a false red rather than a faster
signal.

| Location | Budget | Covers |
|---|---|---|
| `pipeline.test.js` `beforeAll` | 120s | the one in-process boot |
| `pipeline.test.js` stderr-containment case | 45s | a boot inside a spawned child |
| `cli.test.js` three spawning describes | 45s | one boot per case |
| `cli.test.js` `--strict` case | 90s | two boots back to back |

The warm-up hook's 120s looks wildly out of proportion to a 14s worst-case boot,
and is deliberate. A 45s budget there **did** time out on one run whose wall
clock was 226s against ~122s for its neighbours. Two things make the hook a
special case: the boot's tail is fat and entirely at the mercy of machine load,
and a *hook* failure fails all 60 tests in the file rather than one. Note that a
timed-out hook does not appear to cancel the boot already in flight, so such a
run also pays a long teardown.

A per-case timeout argument (`it(name, fn, ms)`) overrides a describe-level
`{ timeout }` option — verified against vitest 4.1.11, which is what puts
`--strict` on 90s rather than its describe's 45s.

Everything else runs on the 5s default, including all 72 cases in
`structural.test.js`, `php-fragment.test.js`, `report.test.js`, and
`block-locator.test.js`, and the other 58 cases in `pipeline.test.js`.

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

Unit tests against inline strings for `extractPhpHeader`, `scanForEmbeddedPhp`,
`maskEmbeddedPhp`, `findTrailingPhpSection`, and `maskTrailingPhp`: header stripping,
single-occurrence-per-tag reporting (short-echo tags, multiple tags, unterminated
openers), and trailing-section detection (wpbg-zxg) — including that a `?>` inside a
string literal, block comment, line comment, or heredoc body is not mistaken for the
real closer, and that a real closer inside a line comment correctly *is* treated as one
(PHP's own rule for `//`/`#` comments).

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
| `trailing-php-after-markup.php` (wpbg-zxg) | Valid-looking `core/heading` markup (actually invalid — missing `wp-block-heading` class) followed by a `<?php` opener with no closer, containing a `<!-- wp:paragraph -->` string literal. Case A: the trailing section is masked to EOF instead of validated, so the real `core/heading` defect surfaces instead of being hidden behind a false structural error | `PHP_TRAILING_SECTION`, `BLOCK_INVALID` (no `STRUCTURAL_UNBALANCED_DELIMITER`, no `BLOCK_RUNNER_SKIPPED`) |
| `trailing-php-entire-file.php` (wpbg-zxg) | A `functions.php`-shaped file: `<?php` opener, never closed, no block markup anywhere — the higher-impact case, a theme file globbed by mistake | `PHP_TRAILING_SECTION` only (no `STRUCTURAL_NO_BLOCKS`); `ok: true`, exit 0 |
| `trailing-php-quoted-closer.php` (wpbg-zxg) | Same shape as `trailing-php-entire-file.php`, but the PHP body itself contains a quoted `"?>"` string literal before the real (missing) closer — regression fixture proving trailing-section detection is not a naive `<?`/`?>` token count, which a quoted `?>` would falsely close | `PHP_TRAILING_SECTION` only; no `PHP_HEADER_STRIPPED` (the quoted `?>` must not be mistaken for a real header closer), no `STRUCTURAL_UNBALANCED_DELIMITER` |
| `trailing-short-echo-no-content.php` (wpbg-zxg) | Valid heading markup followed by a bare, unclosed `<?=` at EOF with nothing after it — case C, the one shape that must NOT start reporting differently: still passes, exit 0, no structural error (only the finding *code* changed, from `PHP_INTERPOLATION_UNCHECKED` to `PHP_TRAILING_SECTION`, per the decided design) | `PHP_TRAILING_SECTION` only |
| `trailing-php-after-no-blocks.php` (wpbg-zxg) | Real, blockless `<p>Hello</p>` HTML followed by an unrelated trailing PHP section — regression fixture proving the `STRUCTURAL_NO_BLOCKS` suppression is scoped to "the file is entirely PHP", not "a trailing section exists anywhere": genuine unconverted-HTML content must still be reported | `PHP_TRAILING_SECTION`, `STRUCTURAL_NO_BLOCKS` (both) |

When adding a fixture, run it through the CLI with `--json` first and copy the actual
output into the test assertion — do not guess expected findings.

## Coverage snapshot

6 test files, 157 tests, all passing as of the last full run (up from 139 before
wpbg-zxg added `findTrailingPhpSection`/`maskTrailingPhp` unit tests and the
trailing-PHP-section integration tests). No tests are skipped.

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
