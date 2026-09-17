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
- **`exclude: [...configDefaults.exclude, '.claude/worktrees/**', '.scratch/**', '.firecrawl/**']`**
  — the spread keeps vitest's own default exclusions (`node_modules`, `dist`, …);
  dropping it would clobber them. The three added entries cover the gitignored agent
  workspaces `CLAUDE.md` invites free writes to: `.claude/worktrees/*` are full nested
  checkouts with their own `tests/*.test.js`; `.scratch/` is ad-hoc agent working state;
  `.firecrawl/` is firecrawl agent output. Without all three, a stray test-shaped file
  left in any of them would be discovered and run alongside this checkout's own tests.

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

### Measured costs

Two campaigns, kept distinct because they measured different things. This section is
the single source for the numbers cited in `vitest.config.js`, `tests/pipeline.test.js`,
and `tests/cli.test.js`. Update it here, not there.

#### Boot and import, measured directly (2026-09-17, wpbg-3z1)

Twenty full-suite runs from the main checkout (two campaigns of ten), 3540 records,
instrumented at the seam in `src/block-runner-adapter.js` via `src/timing.js`.

A third campaign of ten runs then confirmed the final constants at HEAD with
instrumentation **off** — the configuration a user or CI actually gets — 10/10 green,
wall clocks 126–186s.

The raw records and per-run wall clocks for all three campaigns are committed under
`handoff/wpbg-3z1-timings/`, so every figure below can be re-derived without re-running
anything:

```sh
npm run analyse:boot -- handoff/wpbg-3z1-timings/campaign-2-confirm.jsonl
npm run measure:boot            # to collect a fresh campaign into .scratch/boot-measure
```

| What | n | min | p50 | p90 | max |
|---|---|---|---|---|---|
| First `validate()` in-process (the boot) | 20 | 6.68s | 7.7s | 9.6s | 9.91s |
| First `validate()` in a CLI child (the boot) | 240 | 6.61s | 7.6s | 10.0s | **87.63s** |
| `block-runner` import, pipeline worker | 20 | 0.88s | 0.98s | 1.18s | 1.20s |
| `block-runner` import, in a CLI child | 420 | 0.80s | 0.89s | 1.10s | 2.68s |
| `block-runner` import, cli.test.js worker | 20 | 0.89s | 1.02s | 1.21s | **25.52s** |
| Every `validate()` after the boot | 2820 | 0ms | 0ms | 10ms | 140ms |
| Full suite, serial (wall clock) | 20 | 116.6s | ~136s | — | 246s |

**Three kinds of process appear here and must not be conflated.** The `cli.test.js`
worker imports `src/cli.js` for its unit tests, pulling in block-runner — so it pays an
import during vitest's **file-import phase, which no test timeout governs**. It is not a
spawned CLI child, and reading it as one is what made an early draft of this table wrong.
`scripts/analyse-boot-timings.mjs` separates them, and asserts the shape of every run
(12 child boots, 9 non-booting children, 1 worker import) rather than trusting the
classification.

Note also that a pid does not identify a process: Windows recycled a pid *within* a run
three times across these 20 runs, merging two children in the log. The analysis splits on
the import record, which every process emits exactly once.

**The second campaign caught a stall intact — the first time that has happened.** One
child paid **87.63s** on an otherwise-green run (246s wall clock against a 132s median),
while in the same run the `cli.test.js` worker paid a 25.52s import. Every previous stall
was censored at ">45s" by the budget that killed the run; this one was measurable only
because the budgets had been raised first. The first campaign's ten runs, by contrast,
produced no stall at all — the widest boot was 17.78s.

#### Whole-invocation costs (2026-09-16, 12-core machine)

Not re-measured by the 2026-09-17 campaign, which timed the boot and import specifically
rather than whole invocations. Retained as the older measurement they are.

| What | Cost |
|---|---|
| One block-runner-backed CLI invocation | 8.3–13.0s |
| Two such invocations in one case (`--strict`) | 16.0–23.1s |
| CLI invocation that never reaches block-runner | 1.1–2.5s |

Note the post-boot in-process figure re-measures ADR 0004's "11–36ms"; the spread is
wider on the fixtures this suite uses, but the conclusion the ADR draws from it is
unchanged.

### The I/O-stall hypothesis

The standing explanation for the stalls that produced these budgets is an **I/O** stall
loading the 350-package `@wordpress/*` + jsdom tree, not CPU contention. The evidence is
circumstantial and is recorded here so it is not re-derived from scratch:

- During one wpbg-f06 stall, the eight CLI cases that spawn a process without booting
  block-runner stayed at 1.10–2.32s — entirely normal — while the boot specifically
  stalled. Process creation was not what slowed down.
- The one red main-checkout run on record showed vitest's file `import` at 17.98s against
  2.44–2.63s on its four green neighbours.
- The 2026-09-17 confirmation campaign caught one stalled run directly: a **25.52s**
  worker import and an **87.63s** child boot in the same run, against ~1.0s and ~9s on
  the other nineteen. Two different processes, minutes apart, both slow on block-runner
  work within one window — consistent with a shared external cause, though the
  measurement cannot identify what it was.
- The stall was **not uniform**: the very child that took 87.63s to boot had a completely
  normal 1.36s import. Whatever slowed down did not slow everything down equally.
- This machine runs OneDrive sync and a PC-manager service over the workspace.

**A likely reading of the earlier red run.** An import-phase stall cannot fail a test — no
budget governs that phase. So the unnamed failure in wpbg-f06's post-merge run was
probably not its 17.98s import, but a boot that stalled in the same window and blew its
45s budget. The 2026-09-17 stall has exactly that shape, with the boot surviving only
because the budget had been raised. This is an inference, not a finding: the failing case
name was never captured on that run, so it cannot be confirmed.

This remains a **hypothesis consistent with the data, not a confirmed cause.** Timing
deltas measure duration, not cause; they cannot distinguish an I/O stall from CPU
contention. Establishing cause would need a different instrument (disk-queue counters, or
a control run with those services paused). Note also that one stall occurred in 20 runs,
which bounds how much can be claimed about frequency.

### Where raised budgets live, and why

These are **budgets, not costs** — they are sized well above the table above on
purpose. A timeout here can only ever catch block-runner *hanging*; it cannot
make the boot faster, so a tight number buys a false red rather than a faster
signal.

| Location | Budget | Headroom over worst measured | Covers |
|---|---|---|---|
| `pipeline.test.js` `beforeAll` | 240s | ~24x (9.91s in-process) | the one in-process boot |
| `pipeline.test.js` stderr-containment case | 240s | ~2.7x (87.63s) | a boot inside a spawned child |
| `cli.test.js` nine block-runner-backed cases | 240s | ~2.7x (87.63s) | one boot per case |
| `cli.test.js` `--strict` case | 480s | ~2.7x | two boots back to back |
| `cli.test.js` backslash-pattern case | 15s | ~6x (2.39s, 2026-09-16) | two node start-ups, no boot |

**Why the three boot budgets are all 240s.** They cover the same cost — one
block-runner boot — so they carry the same number. They did not always: until wpbg-3z1
the in-process hook was on 120s while the child boots were on 45s, a 2.7x split that no
single set of measurements could justify. It was resolved upward rather than downward,
because the one hard empirical result available was that **45s had been observed
insufficient** for both a hook boot and a child boot on this machine.

**Why 240s and not 120s.** 120s was the first answer, set when the widest boot on record
was 17.78s. The confirmation campaign then caught an 87.63s boot — which would have left
that budget only ~1.35x headroom, thinner than the 2.1x this file elsewhere calls the
shape of budget that produces false reds. The number was raised to keep ~2.7x over the
worst boot ever actually observed rather than over the worst one convenient to assume.

**Why the headroom is large at all.** Not because the measured spread demands it — 240s
is ~31x the 7.6s median. Three reasons, in order of weight:

1. **The cost asymmetry is lopsided.** A false red is expensive and has been paid
   repeatedly: wpbg-f06 traced four suites to it, each needing investigation before a
   merge could proceed. A hang caught at 240s rather than 120s costs two extra minutes,
   once, on a failure that is catastrophic and obvious at either number.
2. A timeout here can only ever catch block-runner **hanging**. It cannot make the boot
   faster, so a tight number buys a false red, not a faster signal.
3. For the hook specifically: a *hook* failure fails all ~60 tests in the file rather
   than one. That amplification argument stands on its own, independent of any
   measurement — which matters here, because the in-process boot has only one sample per
   run and has never been observed above 9.91s. That constant rests on this argument,
   not on its own distribution.

Note that the measured range remains the distribution's **body**. Even 87.63s is one
sample; the three earlier stalls are known only as ">45s" because a budget truncated
them, so no headroom factor can be derived from those at all.

Note that a timed-out hook does not appear to cancel the boot already in flight, so such
a run also pays a long teardown. Do not read that inflated wall clock as evidence of a
longer boot.

The `cli.test.js` budgets are per case, not per describe: three of its describe blocks
mix cases that boot with cases that never reach block-runner. Only
`CLI human output color suppression`, where all three cases boot, carries a
describe-level budget. That boot/no-boot split is confirmed by measurement, not assumed:
the instrumentation counts 21 CLI children per run (20 spawned by `cli.test.js`, one by
`pipeline.test.js`), of which 12 record a boot and 9 record only an import. The
`cli.test.js` vitest worker also records an import, but it is not a spawned child and is
counted separately.

A per-case timeout argument (`it(name, fn, ms)`) overrides a describe-level
`{ timeout }` option — verified against vitest 4.1.11, which is what puts
`--strict` on 480s rather than its describe's 240s.

Everything else runs on the 5s default, including all 72 cases in
`structural.test.js`, `php-fragment.test.js`, `report.test.js`, and
`block-locator.test.js`; the other 59 cases in `pipeline.test.js`; the four cases in
`timing.test.js`; and the eight `cli.test.js` cases that spawn the CLI without ever
reaching block-runner.

**Known thin margin, not fixed here.** Those no-boot CLI cases skip the boot but still pay
block-runner's module *import* in the child, measured 0.80–2.68s over 420 samples. Against
the 5s default that is roughly 1.35x headroom — thinner than the 2.1x that wpbg-f06
identified as the shape of budget that produces false reds. Note the honest limit on the
evidence: no *child* import has been observed stalling (2.68s is the worst in 420), and the
25.52s stall was in the `cli.test.js` worker, which no budget governs. wpbg-3z1 measured
this but deliberately did not act on it, since those cases were outside its scope; tracked
as wpbg-6nl.

## Structure

```
tests/
├── structural.test.js    unit tests — Layer 1 (src/structural.js)
├── php-fragment.test.js  unit tests — Layer 0 (src/php-fragment.js)
├── pipeline.test.js      integration tests — validateFile() (src/pipeline.js)
├── cli.test.js           end-to-end tests — bin/wp-block-guard.js
├── timing.test.js        unit tests — the boot instrumentation (src/timing.js)
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
`tests/fixtures/wp-block-guard/` (in-process, so the one block-runner boot is shared
across the whole file — see "Timeouts and the block-runner boot" above), plus `--fix`
behavior — copying the invalid fixture to a temp file first, never
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

### `timing.test.js`

Unit tests for `src/timing.js`, the instrumentation the boot budgets are derived from
(`npm run measure:boot`). The property asserted first is the one that matters most: with
`WPBG_TIMING_LOG` unset — every ordinary run, including every user's — `recordTiming()`
does nothing and touches no disk. The rest cover the JSONL record shape, the `pid`/`run`
tagging that separates this process's boot from a spawned child's, and that an unwritable
log path cannot throw. Instrumentation must not be able to fail a run it is only
observing.

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

- **Performance** is not covered by this suite. `block-runner` boots jsdom and the
  `@wordpress/*` tree once per OS process, at its first `validate()` call (~8-14s,
  regardless of file size); calls after that cost milliseconds — see ADR 0004, which
  moved the invocation in-process so the boot is paid once per run rather than once per
  file. This is `block-runner`'s own startup cost, not something a test can assert
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
