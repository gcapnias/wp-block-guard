# A finding's `search` is byte-exact or absent, never best-effort

Status: accepted 2026-09-03, amended 2026-09-05 (see "Amendment" below)

A finding carries `search`, the exact source text an agent should look for in order to
replace it. Every value is a contiguous slice of the file as it exists on disk, so a
consumer can find it verbatim. Where the tool cannot identify that text with certainty it
emits `null` rather than an approximation.

`null` is the honest answer, not a placeholder: a wrong `search` is worse than a missing
one. Its whole purpose is find-and-replace, so text taken from a position we are unsure
of points at markup that is not broken, and emitting it would turn a reporting bug into
content corruption.

## Where each value comes from

- `PHP_HEADER_STRIPPED`, `PHP_INTERPOLATION_UNCHECKED` — Layer 0's own scan, which has the
  matched fragment in hand.
- `STRUCTURAL_*` — the delimiter comment, sliced from the byte offsets
  `tokenizeDelimiters()` already computes. The delimiter *is* the defect for these codes.
- `BLOCK_INVALID`, `BLOCK_RUNNER_WARNING` — the element inside the block's delimiters,
  from the span `src/block-locator.js` re-derives, and `null` on that module's fallback
  path. Never from block-runner's `source.htmlLine`.
- `BLOCK_RUNNER_SKIPPED`, `BLOCK_RUNNER_FAILURE`, `STRUCTURAL_NO_BLOCKS` — `null`. These
  are about the file, not a span of it.

Nothing is sliced from block-runner's positions. That is what keeps this cheap: no extra
subprocess and no dependency on its source mapping.

## Two subtleties worth keeping

**Slice from the pre-mask body.** Layer 0 blanks embedded PHP to spaces before the later
layers see it, so a delimiter carrying an interpolated attribute
(`<!-- wp:heading {"level":<?php echo 2; ?>} -->`) tokenizes as masked text. Masking is
length-preserving, so the offsets are shared and `src/pipeline.js` slices the unmasked
body. `tests/fixtures/wp-block-guard/interpolated-delimiter-attrs.php` is the only shape
where the two differ, and exists to catch this.

**The span must be contiguous.** `src/block-locator.js` validates a block in a
children-removed form; that form is what establishes the verdict, but it appears nowhere
in the source, so it cannot be what `search` reports. The reported span is the block's
inner content whole, nested children included.

## Amendment (2026-09-05): `BLOCK_INVALID` is now populated

As originally accepted, this ADR specified `null` for `BLOCK_INVALID` and
`BLOCK_RUNNER_WARNING` — the codes that fire most often on real input — because
block-runner's positions for them could not be used to slice text. Both reasons were
verified against `tests/fixtures/mastermind-ls/parts/title.html`:

- `item.source.htmlLine` pointed at the block's **delimiter comment**, never at the markup
  actually at fault.
- The position could belong to a **different block entirely**: one finding reported line 3
  while its message described the block at line 6.

wpbg-djb removed both. `src/block-locator.js` re-derives positions from our own tokenizer's
spans, establishing which candidates are genuinely invalid by validating each in
isolation, and ADR 0005 settled that the span to report is the element at fault rather
than the delimiter. That gives exactly the byte-exact, contiguous text this ADR demanded
and could not previously obtain, so `search` is populated for those codes wherever the
mapping resolves.

The `null` rule is unchanged where it still applies — the mapping's fallback path. There,
`line` degrades to block-runner's own `source.htmlLine` (dropping it would be a regression)
but `search` does not degrade with it: a line a reader can judge for themselves is not the
same risk as text handed to an agent to replace.

Consequence: the only remaining `search: null` cases are findings with no single span, and
files whose block structure we and block-runner disagree about.
