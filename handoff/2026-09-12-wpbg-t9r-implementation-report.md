# wpbg-t9r: correct `resolveMatch()`'s docstring

**Scope: comment-only.** No behaviour changed. The `node.children.length > 0` gate in
`resolveMatch()` (`src/block-locator.js`) is untouched, byte-for-byte, apart from
whitespace inside its docstring. Confirmed by `git diff --stat`: every changed line is a
`*`-prefixed comment line in `src/block-locator.js`, plus one comment line in a test file
(see below) — no code line, no assertion, no test body changed.

## What was wrong

`resolveMatch()`'s docstring said:

> `null` for a block with children, unconditionally: validating a block in isolation
> strips its inner blocks (see `shallowMarkup()` above), so canonicalizing a parent comes
> back with its children gone, and splicing that in would silently destroy them.
> Nested-parent support is out of scope here (wpbg-hdl).

Two things were false, per the sources this ticket asked me to read against the code:

1. **The mechanism.** Canonicalizing a parent's full markup does not strip its children —
   `flattenBlockTree` on the canonicalized result always comes back with the same block
   count (N→N in every probe: `wpbg-lsf`'s implementation report §3, and every nested case
   in `handoff/2026-09-12-wpbg-hdl-spike-findings.md`). The "children gone" behaviour is
   `shallowMarkup()`'s, and `shallowMarkup()` is a different function used for a different
   purpose (isolating a block's own verdict for `resolveItemLines()`, not producing
   replacement text). The docstring conflated the two.
2. **The framing.** "Nested-parent support is out of scope here (wpbg-hdl)" read as a
   pending limitation. `wpbg-hdl` is closed with a settled "no" — leaf-only is permanent,
   not deferred.

## Before / after

**Before** (lines 174–178):

```
 * `null` for a block with children, unconditionally: validating a block in
 * isolation strips its inner blocks (see `shallowMarkup()` above), so
 * canonicalizing a parent comes back with its children gone, and splicing
 * that in would silently destroy them. Nested-parent support is out of scope
 * here (wpbg-hdl).
```

**After:**

```
 * `null` for a block with children, unconditionally — a settled ceiling
 * (wpbg-hdl), not a pending limitation. Canonicalizing a parent does not
 * strip its children (that is `shallowMarkup()` above, for the unrelated
 * purpose of isolating a *verdict*); it recursively re-serializes every
 * descendant, the way Gutenberg's `canonicalize`/`save()` does for any markup
 * spanning more than one block. Whether a given descendant's bytes survive
 * that re-serialization unchanged depends on whether the source's existing
 * formatting already matches what the serializer would emit for that block
 * type — not on where the defect lives — and that is only knowable by doing
 * the rewrite and diffing it, the exact ambiguity `match` exists to avoid
 * answering by inspection. So a parent's `match` would be a bulk,
 * unverifiable rewrite of its whole subtree masquerading as a `TextEdit`. See
 * docs/adr/0002-search-is-byte-exact-or-absent.md (2026-09-12 amendment) for
 * the full record.
```

The citation is by full ADR path, matching the file's own convention (the very next
paragraph of this same docstring already cites
`docs/adr/0002-search-is-byte-exact-or-absent.md` in full).

## Another comment carrying the same disproved claim (found and fixed)

The brief flagged this as in-scope if found. `grep -rni "strip\|destroy\|nested-parent\|
wpbg-hdl\|children gone" src/ tests/` turned up one: `tests/block-locator.test.js:215-217`,
a test comment on the "returns null for a block with children, without ever calling
fixMarkup" case:

> The gate short-circuits before canonicalization is even attempted — splicing a parent's
> canonicalized-alone form back in would silently destroy its children, so it must never
> get that far.

Same false "destroy" framing. Changed to:

> The gate short-circuits before canonicalization is even attempted — a parent's `match`
> is out of scope regardless of what canonicalizing it would produce (recursive
> re-serialization makes that unverifiable, not destructive; see resolveMatch()'s
> docstring), so it must never get that far.

The test's assertions (`expect(result).toBeNull()`, `expect(fixMarkupCalled).toBe(false)`)
are unchanged — this is a comment-only fix in that file too. Re-ran
`tests/block-locator.test.js` alone after the edit: 17/17 pass.

No other hits from that grep were about this claim (the rest are unrelated uses of
"strip"/"stripped" for PHP-header stripping, CSS class names literally containing "strip",
etc.).

## Test runs

Ran the full suite three times, per the brief's guidance about the known `cli.test.js`
flake (`wpbg-f06`):

1. **155/157** — two failures, both `Error: Test timed out in 25000ms`:
   `tests/cli.test.js > CLI wiring > exits 0 and emits a clean JSON report for a valid
   file`, and `tests/pipeline.test.js > validateFile — clean cases > validates a clean
   core/heading block with no findings`. Suite took 262.84s total, with those two test
   files individually reporting 105s and 238s wall time for suites that normally run in a
   few seconds — a CPU-load symptom, not a real timeout at the assertion.
2. **156/157** — one failure, `tests/cli.test.js > CLI human output color suppression >
   non-TTY (piped) human output has no ANSI escapes`, same `Test timed out in 25000ms`
   signature. This matches the `wpbg-f06`-tracked flake description exactly (a single
   `cli.test.js` timeout).
3. **157/157** — clean. This is the result of record.

**Note for whoever owns `wpbg-f06`:** run 1 shows the same load-induced timeout hitting
`tests/pipeline.test.js`, not just `tests/cli.test.js`. `wpbg-f06` as currently scoped
("cli.test.js intermittently exceeds its 25s timeout under CPU load") describes only one
of the two files affected. A comment-only docstring edit cannot cause a test timeout in
either file, and both failures disappeared on rerun without any code change in between —
consistent with shared-machine CPU contention, not a regression from this change.

## What in the brief turned out wrong, on inspection

- Nothing in the brief's technical claims was wrong against the source — I read
  `src/block-locator.js`, the ADR 0002 2026-09-12 amendment, and the spike findings
  directly, and the brief's summary of all three matched what's actually there.
- One omission, not an error: the brief anticipated only a `cli.test.js` flake failure. My
  first full run also hit a `pipeline.test.js` timeout with the identical signature (see
  above) — worth surfacing since it means `wpbg-f06`'s scope may be narrower than the
  actual flake.
- The brief's citation instruction ("cites ADR 0002's 2026-09-12 amendment") described the
  content correctly but not the file's own citation *style* (full path, not "ADR 0002").
  Matched the file's existing convention instead, per the brief's own "match the density
  and voice of the surrounding comments" criterion.

## Files changed

- `src/block-locator.js` — `resolveMatch()`'s docstring, corrected (comment-only).
- `tests/block-locator.test.js` — one test comment carrying the same disproved claim,
  corrected (comment-only; assertions unchanged).
- `handoff/2026-09-12-wpbg-t9r-implementation-report.md` — this file.

## Process note

Per this ticket's brief, I did not run `br` and did not touch `.beads/` — the tracker is
the orchestrator's to write, and posting this report to the bead is the orchestrator's
responsibility, not mine, for this ticket specifically (this overrides my usual default of
posting implementation reports to the bead myself).
