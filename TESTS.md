# wp-block-guard — automated test suite

Implementation report for the vitest suite added under `tests/`, covering the three-layer
`validateFile` pipeline, the pure Layer 0/Layer 1 helper functions, and CLI wiring.

## Scope

- Added `vitest` (`^4.1.11`) as a devDependency and a `"test": "vitest run"` script in
  `package.json`.
- Added fixture files under `tests/fixtures/wp-block-guard/` (a new subdirectory, separate
  from the pre-existing unrelated `tests/fixtures/mastermind-ls/` and `tests/fixtures/derived/`,
  which were not touched).
- Added unit tests for the pure functions in `src/structural.js` and `src/php-fragment.js`
  (inline strings, no file I/O, no block-runner spawn — fast and deterministic).
- Added pipeline tests that call `validateFile()` directly against the fixtures (library-level,
  one real `block-runner` spawn per test where Layer 2 actually runs).
- Added CLI tests that spawn `bin/wp-block-guard.js` via `child_process.spawnSync` to prove
  argument parsing, `--json` shape, `--strict`, `--fix`, and exit codes 0/1/2 end-to-end.
- Found and fixed 3 real bugs in `src/*.js` that were flagged in this README's former
  "Known issues" section (see below); each fix has a dedicated regression test.

## Files created

Fixtures (`tests/fixtures/wp-block-guard/`):

| File | Scenario | Finding code(s) triggered |
| --- | --- | --- |
| `valid-heading.html` | `core/heading` block whose HTML already matches `save()` output (has `wp-block-heading` class) | none — clean |
| `invalid-heading-missing-class.html` | Same block, missing `class="wp-block-heading"` — the classic "unexpected or invalid content" case | `BLOCK_INVALID` |
| `unbalanced-delimiter.html` | `<!-- wp:heading -->` opener with no matching closer | `STRUCTURAL_UNBALANCED_DELIMITER`, `BLOCK_RUNNER_SKIPPED` (no `BLOCK_INVALID`) |
| `mismatched-closer.html` | `wp:group` opened, `wp:paragraph` opened, closers in the wrong order | `STRUCTURAL_MISMATCHED_CLOSER` (x2), `BLOCK_RUNNER_SKIPPED` |
| `invalid-attrs-json.html` | `<!-- wp:heading {level:2} -->` — unquoted key, invalid JSON | `STRUCTURAL_INVALID_ATTRS_JSON`, `BLOCK_RUNNER_SKIPPED` |
| `no-blocks.html` | Plain `<p>Hello</p>` with zero `wp:` delimiters | `STRUCTURAL_NO_BLOCKS` (warning only; `ok: true`) |
| `pattern-with-header.php` | Leading `<?php /* Title: ... */ ?>` header + clean valid block markup | `PHP_HEADER_STRIPPED` (info); otherwise clean |
| `pattern-with-interpolation.php` | Leading header + `core/paragraph` block with embedded `<?php echo esc_html($x); ?>` mid-markup | `PHP_HEADER_STRIPPED`, `PHP_INTERPOLATION_UNCHECKED` (exactly one, post-fix); no crash in structural/block-runner layers on the masked remainder |

Each fixture's expected findings were verified empirically by running
`node bin/wp-block-guard.js <file> --json` before locking in test assertions — none of the
expectations below are guessed.

Test files (`tests/`):

| File | Covers |
| --- | --- |
| `structural.test.js` | Unit tests for `tokenizeDelimiters` and `runStructuralLayer` on inline strings (balanced pairs, self-closing delimiters, invalid JSON, non-`wp:` comments, namespaced block names, no-blocks, unbalanced, mismatched closers) |
| `php-fragment.test.js` | Unit tests for `extractPhpHeader`, `scanForEmbeddedPhp`, `maskEmbeddedPhp` on inline strings, including the bug-2 regression tests (single occurrence per tag, short-echo tags, multiple tags, unterminated opener) |
| `pipeline.test.js` | `validateFile()` against every fixture above, plus `--fix` behavior (copies the invalid fixture to a temp file first, never mutates the checked-in fixture) and the bug-1 regression test |
| `cli.test.js` | End-to-end spawns of `bin/wp-block-guard.js`: clean exit 0, `BLOCK_INVALID` exit 1, `--strict` exit-code and (bug-3 regression) human-output PASS/FAIL labeling, no-args usage error (exit 2, help to stderr), no-glob-match usage error (exit 2), `--version` |

## Files modified in `src/`

- **`src/pipeline.js`** — fixed bug 1 (stale `--fix` results): after a successful
  `fixMarkup()` write, the function now strips the stale `BLOCK_INVALID` /
  `BLOCK_RUNNER_WARNING` / `BLOCK_RUNNER_FAILURE` findings and re-runs `validateMarkup()`
  against the fixed body before computing `ok`/`summary`/`findings`.
- **`src/php-fragment.js`** — fixed bug 2 (duplicate `PHP_INTERPOLATION_UNCHECKED`):
  `scanForEmbeddedPhp` now matches whole `<?...?>` regions (one occurrence per tag, reported
  at the opening token) instead of matching the opening and closing tokens as two separate
  occurrences; a lone unterminated opener (no matching `?>`) is still reported once via a
  fallback pass.
- **`src/report.js`** — fixed bug 3 (`--strict` PASS/FAIL mislabeling): `formatHuman()` now
  accepts an `{ strict }` option and computes each file's printed pass/fail status as
  `file.ok && !(strict && file.summary.warnings > 0)` instead of just `file.ok`.
- **`src/cli.js`** — passes `{ strict: flags.strict }` through to `formatHuman()` so the
  human-readable report reflects the same strict-adjusted status as the exit code.

## Bugs found and fixed (README "Known issues" #1–3)

### Bug 1 — stale `--fix` results (`src/pipeline.js`)

**Root cause:** in the `if (fix)` block, once `fixMarkup(body)` succeeded and the file was
rewritten on disk (`fs.writeFile(filePath, header + fixedBody, 'utf8')`), the function set
`fixApplied = true` but never re-ran Layer 2 against `fixedBody`. The `findings` array
(and the `ok`/`summary` computed from it just below) still contained the *pre-fix*
`BLOCK_INVALID` finding, so a call that had just correctly fixed the file still reported
`ok: false` and would exit `1`.

**Fix:** after a successful fix, remove the stale `BLOCK_INVALID` / `BLOCK_RUNNER_WARNING` /
`BLOCK_RUNNER_FAILURE` findings from the array, set `body = fixedBody`, call
`validateMarkup(body)` again, and push fresh findings from that result — mirroring the
same mapping logic used for the original Layer 2 pass.

**Proof:** `tests/pipeline.test.js` → `validateFile — --fix > fixes a near-miss block in
place without mutating the checked-in fixture` asserts, on the *same* result object returned
by the `{ fix: true }` call (not a second separate call): `result.ok === true`,
`result.summary === { errors: 0, warnings: 0 }`, and no `BLOCK_INVALID` finding present.

### Bug 2 — duplicate `PHP_INTERPOLATION_UNCHECKED` (`src/php-fragment.js`)

**Root cause:** `scanForEmbeddedPhp` used `PHP_TAG_TOKEN_RE = /<\?(?:php\b|=)?|\?>/g`, which
matches the *opening* token (`<?php`/`<?=`) and the *closing* token (`?>`) as two independent
matches. Each embedded `<?php ... ?>` tag therefore produced two `{ index, line, token }`
occurrences, and `pipeline.js` turns every occurrence into its own
`PHP_INTERPOLATION_UNCHECKED` finding — one tag, two identical findings.

**Fix:** `scanForEmbeddedPhp` now iterates `PHP_TAG_BLOCK_RE` (the same balanced
`<?...?>` regex already used by `maskEmbeddedPhp`), reporting one occurrence per whole tag
region at its opening token's position. A fallback second pass still reports an opener that
has no matching `?>` before EOF (which the block regex can't match), so that rare malformed
case isn't silently dropped, but it's still exactly one occurrence per opener, not two.

**Proof:** `tests/php-fragment.test.js` has 4 tests on `scanForEmbeddedPhp` directly,
including one asserting `toHaveLength(1)` for a single embedded tag and one for an
unterminated opener. `tests/pipeline.test.js`'s `pattern-with-interpolation.php` test asserts
`codes.filter(c => c === 'PHP_INTERPOLATION_UNCHECKED')` has length **1**, not 2.

### Bug 3 — `--strict` PASS/FAIL mislabeling (`src/report.js`)

**Root cause:** `formatHuman()` computed each file's printed status purely from `file.ok`,
which is error-only (`errorCount === 0`). Under `--strict`, `cli.js` correctly flips the
process *exit code* to `1` when warnings are present, but `formatHuman()` had no way to know
`--strict` was active, so it kept printing `✔ PASS` for a file whose warnings had just caused
the run to fail.

**Fix:** `formatHuman(report, { strict = false } = {})` now takes a `strict` option and
computes `passes = file.ok && !(strict && file.summary.warnings > 0)` per file, using `passes`
for both the `PASS`/`FAIL` word and the `✔`/`✗` glyph. `cli.js` passes
`{ strict: flags.strict }` through.

**Proof:** `tests/cli.test.js` → `--strict human output does not print PASS for a file whose
warnings caused exit 1` spawns the real CLI against `no-blocks.html` (a warning-only file)
with `--strict`, and asserts both `status === 1` **and** that stdout does not contain `PASS`
(and does contain `FAIL`).

No bugs were left as documented failing/red tests — all three were small, low-risk,
behavior-preserving-except-for-the-bug fixes, so all three were fixed directly per the "prefer
(a) if the fix is small and obviously safe" guidance.

## Final test run

```
$ npx vitest run
 RUN  v4.1.11 E:/Shared/Workspaces/personal/firecrawl-cli

 Test Files  4 passed (4)
      Tests  37 passed (37)
   Start at  09:26:13
   Duration  84.72s (transform 173ms, setup 0ms, import 288ms, tests 134.76s, environment 0ms)
```

No skips. Wall-clock time is dominated by real `block-runner` process spawns (~10s
steady-state each, per README "Known issues" #4 — a known, separately-tracked performance
issue, not something addressed by this test suite). `vitest.config.js` sets a 20s default
`testTimeout` to cover single-spawn tests; the two tests that perform 2–3 sequential
block-runner spawns (`--fix` pipeline test, `--strict` two-invocation CLI test) have explicit
higher per-test timeouts (45000ms / 30000ms).

## Known gaps / not covered

- **Performance (README issue #4)** is explicitly out of scope for this suite — it's a
  characteristic of `block-runner`'s own process-startup cost, not a correctness bug, and the
  task instructions were explicit not to let it drive unrealistic test timeouts.
- **The two "minor/cosmetic, not yet triaged" items** in the README (inconsistent
  `blockName` namespacing between `BLOCK_INVALID` (`core/heading`) and `STRUCTURAL_*`
  (`heading`) findings; multi-file JSON output ordering not guaranteed to match argument
  order) are **not** covered by any test here and are not fixed — they were explicitly called
  out as not-yet-triaged bugs, not something this task asked to resolve. An agent relying on
  `blockName` format consistency or `files[]` ordering should not assume either is guaranteed.
- **`--fix` is only tested against one fixture** (`invalid-heading-missing-class.html`, a
  single near-miss block-runner finding). It is not tested against a file with multiple
  `BLOCK_INVALID` findings, or a file where `fixMarkup` itself fails/returns null
  (`fixSkippedReason: 'block-runner "fix" did not produce output.'` path is untested).
- **`BLOCK_RUNNER_WARNING` and `BLOCK_RUNNER_FAILURE`** finding codes have no dedicated
  fixture/test — no fixture in this suite is known to trigger a block-runner *warning*
  (vs. error) status, and `BLOCK_RUNNER_FAILURE` (block-runner itself failing to invoke or
  returning bad output) was not exercised.
- **Bun/standalone-executable roadmap item** (mentioned in README "Roadmap") is unrelated to
  this Node/vitest suite and untouched.
- The mismatched-closer fixture only tests one specific "swap two closers" shape; deeper
  nesting (3+ levels) of mismatched closers is not covered.
