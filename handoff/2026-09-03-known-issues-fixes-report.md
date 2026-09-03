# wp-block-guard — known-issues fixes and test-gap coverage (2026-09-03)

Implementation report for the follow-on work done in this worktree against
`README.md`'s "Known issues" (minor/cosmetic items) and `TESTS.md`'s "Known gaps /
not covered" section. Written to stand alone: a reviewer should be able to read this
file and understand everything that changed, without re-reading the working
conversation.

## 1. Task recap

Assigned: the two README "Known issues" items filed as "Minor/cosmetic, not yet
triaged as bugs" (`blockName` inconsistent namespacing; multi-file JSON output
ordering), plus three items from `TESTS.md`'s "Known gaps / not covered" list
(`--fix` against multiple `BLOCK_INVALID` findings; a `BLOCK_RUNNER_WARNING`
fixture; deeper nested mismatched-closer coverage).

Explicitly out of scope, left untouched:

- README "Known issues" item 1 (renumbered; historically "issue #4"), the
  ~10s/invocation performance problem — a separate, parallel effort is rewriting
  `src/block-runner-adapter.js` to call block-runner's in-process library API
  instead of spawning its CLI, specifically to address this.
- `BLOCK_RUNNER_FAILURE` finding-code coverage and the `fixMarkup` returns-null
  path — both depend on `src/block-runner-adapter.js`'s subprocess-spawn
  internals, which the parallel effort is actively changing.
- `src/block-runner-adapter.js` itself was not opened for editing at any point.

## 2. Item 1 — `blockName` inconsistent namespacing (fixed)

**Root cause, confirmed empirically (not assumed):** in real Gutenberg markup, core
blocks omit the `core/` namespace in their `<!-- wp:name -->` delimiter comment;
only non-core blocks write a full `namespace/name`
(e.g. `<!-- wp:my-plugin/card -->`). The checked-in fixture
`tests/fixtures/wp-block-guard/invalid-heading-missing-class.html` proves this: its
delimiter is literally

```html
<!-- wp:heading {"level":2} -->
<h2>Hello World</h2>
<!-- /wp:heading -->
```

— bare `wp:heading`, no namespace. Running `node bin/wp-block-guard.js` against it
produces a `BLOCK_INVALID` finding with `"blockName": "core/heading"` — sourced from
block-runner's own report (`item.block`), which always returns the fully-namespaced
block name, not the delimiter text. `src/structural.js`'s tokenizer, by contrast,
parses the delimiter comment verbatim (`readName()` reads exactly what's between
`wp:` and the next whitespace/`{`/`-->`), so its findings previously carried the
bare `"heading"`. Both are "correct" for what they read from — the inconsistency was
real, not a parsing bug in either layer.

**Fix — `src/structural.js`:**

- Added `normalizeBlockName(name)`: returns `name` unchanged if it contains `/`
  (already namespaced), otherwise returns `` `core/${name}` ``.
- Applied it inside `checkStructuralBalance()` only at the point findings are
  constructed — the `blockName` field of every `STRUCTURAL_INVALID_ATTRS_JSON`,
  `STRUCTURAL_MISMATCHED_CLOSER`, and `STRUCTURAL_UNBALANCED_DELIMITER` finding, and
  inside the human-readable `detail` text of the mismatched-closer/unbalanced
  findings (since those strings quote the block name too, e.g. `Closing comment for
  "core/columns" does not match innermost open block "core/column"...`).
- Deliberately **not** applied inside `tokenizeDelimiters()` or to the `stack` used
  for balance tracking in `checkStructuralBalance()` — openers and closers are still
  pushed/popped/matched by the raw parsed name exactly as before. Normalization only
  happens at the finding-construction boundary, so nesting/balance semantics are
  unchanged.

**Before/after example** (`<!-- wp:heading -->` with no closer):

| | Before | After |
|---|---|---|
| `STRUCTURAL_UNBALANCED_DELIMITER.blockName` | `"heading"` | `"core/heading"` |
| Same file's `BLOCK_INVALID.blockName` (from block-runner, unchanged) | `"core/heading"` | `"core/heading"` |

An agent matching on `blockName` across finding codes for the same underlying block
now sees a consistent value.

**Tests** (`tests/structural.test.js`):

- New `describe('normalizeBlockName', ...)` block: `normalizeBlockName('heading')
  === 'core/heading'`; `normalizeBlockName('my-plugin/card') === 'my-plugin/card'`
  (unchanged).
- Updated `runStructuralLayer` tests: the unbalanced-delimiter case now asserts
  `findings[0].blockName === 'core/heading'`; the mismatched-closer case asserts
  `['core/group', 'core/paragraph']`.
- New test: `<!-- wp:my-plugin/card -->` with no closer still yields
  `blockName: 'my-plugin/card'` (proves the already-namespaced path is a no-op).

No other test in the suite asserted a bare structural `blockName` or matched
`detail`/`message` text containing one (checked via `grep` across `tests/*.test.js`
before running the suite), so this change had no other fallout.

## 3. Item 2 — multi-file JSON output ordering (documentation fix, not a code bug)

**What was actually found:** `src/cli.js` line 71 already does
`files = files.filter((f) => MARKUP_FILE_RE.test(f)).sort();` before any file is
processed, `for (const file of files)` processes and pushes results in that sorted
order, and `buildReport()` (`src/report.js`) just maps `fileResults` straight into
`report.files` — no reordering happens anywhere downstream. This is fully
deterministic.

**Empirical confirmation:**

```
$ node bin/wp-block-guard.js tests/fixtures/wp-block-guard/no-blocks.html \
    tests/fixtures/wp-block-guard/invalid-attrs-json.html \
    tests/fixtures/wp-block-guard/unbalanced-delimiter.html --json
```

Command-line argument order: `no-blocks, invalid-attrs-json, unbalanced-delimiter`.
Actual `files[]` order in the JSON output: `invalid-attrs-json, no-blocks,
unbalanced-delimiter` — alphabetical, not argument order, every time it was run.

**Conclusion:** this was **not a real bug** — the README's "not confirmed harmful"
phrasing described a genuine observation (`files[]` order ≠ argument order) but
mischaracterized it as unconfirmed non-determinism, when it's actually a
consistent, deterministic alphabetical sort. Whoever filed the original issue most
likely compared `files[]` order against the order they typed arguments, not against
repeated runs.

**Fix — documentation, not code.** `README.md`'s "Known issues" section was updated
to state the real guarantee precisely: files are processed and reported in
**ascending lexicographic order of their full resolved path** — plain JavaScript
`Array.prototype.sort()` semantics (UTF-16 code-unit order, not locale-aware, not
grouped by directory or basename) — and this is **never** command-line argument
order. No change to `src/cli.js` was needed or made.

**Test** (`tests/cli.test.js`, new): `multi-file JSON output is in alphabetical path
order regardless of argument order` — spawns the real CLI with three fixtures
(`invalid-attrs-json.html`, `mismatched-closer.html`, `unbalanced-delimiter.html`,
chosen because all three trip a blocking structural error so block-runner/Layer 2 is
skipped and the spawn stays fast) passed in reverse-alphabetical argument order, and
asserts `report.files.map(f => path.basename(f.file))` equals the alphabetical
ordering.

## 4. Item 3 — new fixtures and tests

### 4a. `--fix` against multiple `BLOCK_INVALID` findings

New fixture `tests/fixtures/wp-block-guard/two-invalid-headings.html`:

```html
<!-- wp:heading {"level":2} -->
<h2>First Heading</h2>
<!-- /wp:heading -->

<!-- wp:heading {"level":3} -->
<h3>Second Heading</h3>
<!-- /wp:heading -->
```

Both headings are missing `class="wp-block-heading"`. Verified via
`node bin/wp-block-guard.js ... --json` that this produces exactly two
`BLOCK_INVALID` findings (one per block, at lines 1 and 5) before writing any test
assertions.

New test in `tests/pipeline.test.js`: `fixes a file with multiple BLOCK_INVALID
findings, correcting all of them`. Copies the fixture to a temp file (never mutates
the checked-in fixture, matching the existing single-finding test's pattern), calls
`validateFile(tmpFile, { fix: true })`, and asserts on the *same* returned result
object: `fixApplied === true`, `fixSkippedReason === null`, `ok === true`,
`findings` is `[]`, `summary` is `{errors: 0, warnings: 0}`. Also asserts the
rewritten file content contains `wp-block-heading` exactly twice
(`content.match(/wp-block-heading/g)).toHaveLength(2)`), confirms the checked-in
fixture is byte-identical to before, and does one more independent
`validateFile(tmpFile)` re-check. This test performs 3 sequential block-runner
spawns (fix, the pipeline's internal re-validate, plus the test's own re-check), so
it carries the same explicit `45000`ms timeout as the existing single-finding
`--fix` test.

### 4b. `BLOCK_RUNNER_WARNING` fixture

**Not achieved — investigated and left as an open gap, not faked.**

What was tried/checked:

1. Read `README.md`'s Layer 2 description and block-runner's own installed
   `README.md` (`node_modules/block-runner/README.md`, resolved up from the parent
   repo since this worktree has no local `node_modules`): its docs describe
   `--strict` causing exit 1 on "unresolved media" or "fallback blocks", framed
   under the `convert` command and its media-resolution flags (`--resolver
   noop|map|wpcli|rest`).
2. Confirmed `src/block-runner-adapter.js` (read-only, not modified) only ever
   invokes block-runner's `validate` and `fix` commands — never `convert`.
3. Read block-runner 0.8.0's installed `dist/index.js` directly. Its exported
   `validate(markup, options)` function — the implementation backing the `validate`
   CLI command wp-block-guard's adapter spawns — builds its `items` array with
   `status: "invalid"` only (see the loop over `flattenBlocks(blocks)`: every
   pushed item is `{ block, status: "invalid", reason, source }`), and its
   `summary.warnings` field is initialized to `0` and never incremented anywhere in
   that function.
4. Grepped the whole bundle (`dist/cli.js` and `dist/index.js`) for
   `status: "warning"` sites: all of them (`warnings.push({ block: "input", status:
   "warning", reason: capabilities.note })` and two others) live inside
   `runConvert()`, the separate implementation backing the `convert` command —
   confirmed by reading the surrounding function body, not just the grep hit.
   `validate()` never merges that `warnings` array into its own `items`; they are
   two entirely separate code paths.

**Conclusion:** under block-runner 0.8.0, `item.status === 'warning'` in
`src/pipeline.js`'s `code = item.status === 'warning' ? 'BLOCK_RUNNER_WARNING' :
'BLOCK_INVALID'` branch appears to be unreachable dead code — not just hard to
trigger with the fixtures tried, but structurally unreachable given that
wp-block-guard's adapter only calls `validate`/`fix`, and `validate()`'s own
implementation has no code path that produces a warning-status item. This holds for
both the current subprocess-based adapter and the in-process library API
(`import { validate } from 'block-runner'`) the parallel rewrite is moving to, since
both call the same `validate()` function.

No fixture was added for this. `BLOCK_RUNNER_WARNING`'s entries in
`README.md`'s finding-code table and `src/findings.js`'s registry were left in
place — removing a documented finding code from what the README calls a "stable
contract" was judged out of scope for this task. Documented in full in `TESTS.md`'s
"Known gaps" section (see §6 below) so this finding isn't lost.

### 4c. Deeper nested mismatched-closer coverage

New fixture `tests/fixtures/wp-block-guard/deeply-nested-mismatched-closer.html`
(the existing `mismatched-closer.html`, a 2-level "swap two closers" case, was not
modified):

```html
<!-- wp:group -->
<div class="wp-block-group">
<!-- wp:columns -->
<div class="wp-block-columns">
<!-- wp:column -->
<div class="wp-block-column">
<p>Hello World</p>
<!-- /wp:columns -->
</div>
<!-- /wp:column -->
</div>
<!-- /wp:group -->
</div>
```

Three levels deep: `wp:group > wp:columns > wp:column`, with `/wp:columns` closed
while `wp:column` is innermost (mismatch 1: closer says `columns`, innermost open is
`column`), followed by `/wp:column` closing against the wrong frame after the
balance-checker's best-effort recovery pop (mismatch 2: closer says `column`,
innermost open is now `columns`), and finally `/wp:group` closes cleanly.

Verified via direct `runStructuralLayer()` call and then the full CLI before writing
assertions — output is exactly two `STRUCTURAL_MISMATCHED_CLOSER` findings
(`blockName: 'core/columns'` at line 8, `blockName: 'core/column'` at line 10) plus
`BLOCK_RUNNER_SKIPPED`, no `BLOCK_INVALID`.

New test in `tests/pipeline.test.js`: `flags out-of-order closers 3+ levels deep
(wp:group > wp:columns > wp:column)` — asserts `ok === false`, exactly two
`STRUCTURAL_MISMATCHED_CLOSER` findings in that `blockName` order, `codes` contains
`BLOCK_RUNNER_SKIPPED` and not `BLOCK_INVALID`.

## 5. Test suite results

```
$ npx vitest run
 RUN  v4.1.11 E:/Shared/Workspaces/personal/firecrawl-cli/.claude/worktrees/agent-ae679ffcff10a47e8

 Test Files  4 passed (4)
      Tests  43 passed (43)
   Start at  10:00:08
   Duration  122.31s (transform 205ms, setup 0ms, import 342ms, tests 172.72s, environment 1ms)

[exited with code 0]
```

Up from 37 tests (pre-existing baseline) to 43: +6 tests
(`normalizeBlockName` ×2, updated/new `runStructuralLayer` assertions ×1 new case,
multi-finding `--fix` ×1, deep-nesting mismatched-closer ×1, multi-file ordering
×1). No skips, no failures.

## 6. Documentation updates made

**`README.md`:**

- "Known issues" section: struck through both former "Minor/cosmetic, not yet
  triaged" bullets in the same `~~...~~ Fixed in src/x.js: ...` style used for the
  three earlier bug fixes, each with its confirmed root cause and the exact fix
  (see §2 and §3 above for the full text). The "Minor/cosmetic, not yet triaged as
  bugs" heading itself was removed since it's now empty.
- The performance item's numbering/position under "Remaining open issue" was left
  untouched (still the sole numbered item there), since `TESTS.md` and the test
  suite's inline comments refer to it as "README issue #4" in multiple places.
- "Verification status" section: test count updated from "37 tests passing" to "43
  tests passing"; "the 3 bug fixes it verifies" → "the bug fixes it verifies" (now
  covers 5, detailed in `TESTS.md`).

**`TESTS.md`:**

- Fixtures table: added rows for `two-invalid-headings.html` and
  `deeply-nested-mismatched-closer.html`.
- Test files table: updated `structural.test.js`, `pipeline.test.js`, `cli.test.js`
  descriptions to mention the new coverage.
- Added "Bug 4 — `blockName` inconsistently namespaced" and "Bug 5 — multi-file JSON
  output ordering (documentation, not code)" sections, matching the style/depth of
  the existing Bug 1–3 writeups (root cause, fix, proof).
- "Final test run" section updated to the 43-test output above.
- "Known gaps / not covered" rewritten: removed the now-resolved `blockName`/
  ordering bullet and the now-partially-resolved `--fix` multi-finding /
  deep-nesting bullets; added detailed, evidence-backed entries for
  `BLOCK_RUNNER_WARNING` (full investigation writeup, see §4b above) and for
  `BLOCK_RUNNER_FAILURE`/`fixMarkup`-returns-null (explicitly noted as pending the
  parallel `block-runner-adapter.js` rewrite); the performance bullet now also notes
  that a parallel effort is addressing it and that `block-runner-adapter.js` was
  deliberately left untouched here.

## 7. Files changed and commit(s)

Commit in this worktree (branch `worktree-agent-ae679ffcff10a47e8`):

```
bfeeaf1 Normalize structural blockName namespacing; add fix/nesting/ordering test coverage
```

Files changed (8 total, per `git show --stat`):

- `README.md` — modified (§6)
- `TESTS.md` — modified (§6)
- `src/structural.js` — modified (`normalizeBlockName`, §2)
- `tests/cli.test.js` — modified (new ordering test, §3)
- `tests/pipeline.test.js` — modified (new multi-fix test §4a, new deep-nesting
  test §4c)
- `tests/structural.test.js` — modified (`normalizeBlockName` unit tests, updated
  existing assertions, §2)
- `tests/fixtures/wp-block-guard/two-invalid-headings.html` — new (§4a)
- `tests/fixtures/wp-block-guard/deeply-nested-mismatched-closer.html` — new (§4c)

Not touched, confirmed via `git status`/`git diff` before committing:
`src/block-runner-adapter.js`, `tests/fixtures/mastermind-ls/`,
`tests/fixtures/derived/`, `node_modules`.

This handoff document (`handoff/2026-09-03-known-issues-fixes-report.md`) is
committed separately, after this report was written.

## 8. Explicitly left open

- **`BLOCK_RUNNER_FAILURE` finding-code coverage** — untested. Would require
  simulating a block-runner subprocess failure or non-JSON stdout, both of which
  live entirely inside `src/block-runner-adapter.js`'s `runCli()`/`validateMarkup()`
  — code the parallel agent is actively rewriting (subprocess spawn → in-process
  library call). Writing a test against the current subprocess-specific failure
  shape (`exitCode`, `stderr` fields) would very likely need to be rewritten again
  once that lands, so it was deliberately left uncovered per the task's explicit
  instruction.
- **`fixMarkup` returns `null` path** (`fixSkippedReason: 'block-runner "fix" did
  not produce output.'`) — same reasoning: depends on `fixMarkup()`'s current
  temp-file-based failure modes in `block-runner-adapter.js`, in flux.
- **`BLOCK_RUNNER_WARNING` fixture/test** — not a "left for someone else" gap in the
  same sense as the two above; investigated as thoroughly as feasible (see §4b) and
  found to be *structurally unreachable* via the `validate`/`fix` commands
  wp-block-guard's adapter uses, under block-runner 0.8.0 as installed. If a future
  block-runner version adds a warning-status path to `validate()`, or if
  wp-block-guard ever starts calling `convert`, this gap could close; until then
  there is no known way to construct a fixture that triggers it.
- **Performance (README's remaining "Known issues" item)** — explicitly out of
  scope; being addressed by the parallel `block-runner-adapter.js` rewrite.
- **Bun/standalone-executable roadmap item** — unrelated, untouched.
