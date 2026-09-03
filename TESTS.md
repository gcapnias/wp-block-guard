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
| `two-invalid-headings.html` | Two separate `core/heading` blocks, each missing `class="wp-block-heading"` | `BLOCK_INVALID` (x2) |
| `deeply-nested-mismatched-closer.html` | `wp:group > wp:columns > wp:column` (3 levels), with `/wp:columns` and `/wp:column` closed out of order | `STRUCTURAL_MISMATCHED_CLOSER` (x2), `BLOCK_RUNNER_SKIPPED` |

Each fixture's expected findings were verified empirically by running
`node bin/wp-block-guard.js <file> --json` before locking in test assertions — none of the
expectations below are guessed.

Test files (`tests/`):

| File | Covers |
| --- | --- |
| `structural.test.js` | Unit tests for `tokenizeDelimiters`, `runStructuralLayer`, and `qualifyBlockName` on inline strings (balanced pairs, self-closing delimiters, invalid JSON, non-`wp:` comments, namespaced block names, no-blocks, unbalanced, mismatched closers, bare-name-to-`core/`-namespace qualification on findings) |
| `php-fragment.test.js` | Unit tests for `extractPhpHeader`, `scanForEmbeddedPhp`, `maskEmbeddedPhp` on inline strings, including the bug-2 regression tests (single occurrence per tag, short-echo tags, multiple tags, unterminated opener) |
| `pipeline.test.js` | `validateFile()` against every fixture above, plus `--fix` behavior (copies the invalid fixture to a temp file first, never mutates the checked-in fixture), the bug-1 regression test, multi-finding `--fix` (`two-invalid-headings.html`), and 3-level nested mismatched closers (`deeply-nested-mismatched-closer.html`) |
| `cli.test.js` | End-to-end spawns of `bin/wp-block-guard.js`: clean exit 0, `BLOCK_INVALID` exit 1, `--strict` exit-code and (bug-3 regression) human-output PASS/FAIL labeling, no-args usage error (exit 2, help to stderr), no-glob-match usage error (exit 2), `--version`, and multi-file JSON output ordering (alphabetical by full path, independent of argument order) |

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

### Bug 4 — `blockName` inconsistently namespaced (`src/structural.js`)

**Root cause:** block-runner's `BLOCK_INVALID` reports are always fully-namespaced, while the
structural layer's tokenizer parsed the bare delimiter text as written — see `qualifyBlockName()`
in `src/structural.js` for the full explanation of why core blocks' delimiters omit the
namespace.

**Fix:** `src/structural.js` adds `qualifyBlockName(name)`, applied by `checkStructuralBalance`
only where a name is surfaced in a finding (`blockName` field and the human-readable `detail`
text) — the balance-tracking stack (`stack`) still pushes/pops/matches openers and closers using
the raw, unqualified name parsed from the delimiter, so nesting logic is unaffected.

**Proof:** `tests/structural.test.js` has a dedicated `qualifyBlockName` unit-test block
(bare → `core/<name>`, namespaced left as-is) plus updated `runStructuralLayer` assertions
(`STRUCTURAL_UNBALANCED_DELIMITER` on `<!-- wp:heading -->` now asserts `blockName: 'core/heading'`;
a new test confirms `<!-- wp:my-plugin/card -->` stays `'my-plugin/card'`).

### Bug 5 — multi-file JSON output ordering (documentation, not code)

**Investigation:** the README claimed `files[]` ordering "does not always match" argument
order and wasn't confirmed deterministic. Reading `src/cli.js` showed `files.filter(...).sort()`
already runs before any file is processed, and `buildReport()` in `src/report.js` just maps
`fileResults` through in the order `cli.js`'s `for (const file of files)` loop pushed them —
no reordering happens after the sort. An empirical multi-file run (3 fixtures passed in
reverse-alphabetical argument order) confirmed `files[]` comes back in ascending path order
every time. **Conclusion: this was stale documentation of a real (if undocumented) guarantee,
not a bug** — the "not confirmed harmful" observation in the README was a case of argument
order being mistaken for non-determinism.

**Fix:** no code change; README now states the actual guarantee plainly (ascending
lexicographic order of the full resolved path, plain JS `sort()` semantics — not locale-aware,
not grouped by directory/basename — never argument order).

**Proof:** `tests/cli.test.js` → `multi-file JSON output is in alphabetical path order
regardless of argument order` spawns the CLI with three fixtures in reverse-alphabetical
argument order and asserts `report.files` comes back in alphabetical order.

## Final test run

```
$ npx vitest run
 RUN  v4.1.11 E:/Shared/Workspaces/personal/firecrawl-cli

 Test Files  4 passed (4)
      Tests  43 passed (43)
   Duration  122.31s (transform 205ms, setup 0ms, import 342ms, tests 172.72s, environment 1ms)
```

No skips. Wall-clock time is dominated by real `block-runner` process spawns (~10s
steady-state each, per README "Known issues" #4 — a known, separately-tracked performance
issue, not something addressed by this test suite). `vitest.config.js` sets a 20s default
`testTimeout` to cover single-spawn tests; tests that perform 2–3 sequential block-runner
spawns (both `--fix` pipeline tests, `--strict` two-invocation CLI test) have explicit higher
per-test timeouts (45000ms / 30000ms).

## Known gaps / not covered

- **Performance (README issue #4)** is explicitly out of scope for this suite — it's a
  characteristic of `block-runner`'s own process-startup cost, not a correctness bug, and the
  task instructions were explicit not to let it drive unrealistic test timeouts. A parallel,
  separate effort is rewriting `src/block-runner-adapter.js` to call block-runner's in-process
  library API instead of spawning its CLI, specifically to address this — that file was
  deliberately left untouched by this round of work.
- **`--fix` against a file where `fixMarkup` itself fails/returns null** (the
  `fixSkippedReason: 'block-runner "fix" did not produce output.'` path) and
  **`BLOCK_RUNNER_FAILURE`** (block-runner itself failing to invoke, or returning unparseable
  output) both remain untested. Both depend on `src/block-runner-adapter.js`'s internals
  (subprocess spawn failure, non-JSON stdout, `fix`'s temp-file `--out` step failing) — exactly
  the code the parallel adapter rewrite is actively changing, including what its `ok`/`error`
  shape looks like on failure. Deliberately left as an open gap pending that rewrite landing,
  rather than writing tests against internals known to be in flux.
- **`BLOCK_RUNNER_WARNING` has no fixture/test, and is very likely unreachable as things
  stand.** Investigated by reading `block-runner`'s own `dist/index.js` (v0.8.0, the installed
  version): its exported `validate(markup, options)` — the function backing both the `validate`
  CLI command wp-block-guard's adapter spawns (`block-runner validate - --json`) and the
  in-process library call the parallel adapter rewrite is moving to (`import { validate } from
  'block-runner'`) — only ever pushes `items` with `status: "invalid"`; `summary.warnings` is
  hardcoded to `0` and never incremented on that path. The only `status: "warning"` sites in
  block-runner's bundle (`warnings.push({..., status: "warning", ...})`, `capabilities.note`,
  etc.) live inside `runConvert()`, the implementation of the separate `convert` command, which
  wp-block-guard never calls. So under block-runner 0.8.0, `item.status === 'warning'` in
  `src/pipeline.js`'s `code = item.status === 'warning' ? 'BLOCK_RUNNER_WARNING' : 'BLOCK_INVALID'`
  branch appears to be dead code reachable through neither the current subprocess adapter nor
  the library API the parallel rewrite is adopting — not just untested, but with no known way
  to construct a fixture that would trigger it via `validate`/`fix`. Left as an open gap rather
  than faked; `BLOCK_RUNNER_WARNING`'s entries in the README finding-code table and
  `src/findings.js`'s registry were left in place since removing a documented finding code from
  the stable contract is out of scope here.
- **Bun/standalone-executable roadmap item** (mentioned in README "Roadmap") is unrelated to
  this Node/vitest suite and untouched.
