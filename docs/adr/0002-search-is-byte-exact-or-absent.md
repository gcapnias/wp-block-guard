# A finding's `search` is byte-exact or absent, never best-effort

Status: accepted 2026-09-03, amended 2026-09-05, amended 2026-09-12 (see "Amendments" below)

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
- `BLOCK_INVALID` — the element inside the block's delimiters, from the span
  `src/block-locator.js` re-derives, and `null` on that module's fallback path. Never from
  block-runner's `source.htmlLine`.
- `BLOCK_RUNNER_SKIPPED`, `BLOCK_RUNNER_FAILURE`, `STRUCTURAL_NO_BLOCKS` — `null`. These
  are about the file, not a span of it.
- `BLOCK_RUNNER_WARNING` — `null`, and not by accident: `resolveItemLines()` resolves
  nothing unless *every* item it is given has `status: "invalid"`, so a warning item can
  never be mapped to a span. It cannot currently fire from this path at all (ADR 0005),
  but the rule holds if it ever does.

**The fallback is per-file, not per-finding.** Wherever `resolveItemLines()` cannot
establish the mapping it returns `null` for every item, so one unmappable item — a warning
among invalids, or a block count we and block-runner disagree about — leaves `search`
`null` for every block-runner finding in that file, not just the one at fault. That is the
intended trade: the mapping's soundness argument is about the document as a whole, and
partial confidence in it is not confidence.

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

## Amendments

### 2026-09-05: `BLOCK_INVALID` is now populated

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

### 2026-09-12: `match` (wpbg-lsf) inherits the same rule, and is leaf-only for good

`wpbg-lsf` added `match`, the verified replacement text for a leaf `BLOCK_INVALID`
finding — the other half of a `{ search, match }` `TextEdit`. It ships `null`
unconditionally for any block with children. `wpbg-hdl` was a spike to determine whether
that was a temporary limitation, and settled that it is not: a parent's `match` is
permanently out of scope, and the reason is this ADR's own rule, not a separate one.

The mechanism (`resolveMatch()` in `src/block-locator.js`) canonicalizes a block's full
markup and splices the corrected inner span back into the original delimiters. For a leaf
this is byte-exact and verified before being emitted, matching this ADR's rule directly.
For a block with children, canonicalizing it recursively re-serializes every descendant
too — this is not a bug to fix, it is what Gutenberg's `canonicalize`/`save()` does for any
markup spanning more than one block. Whether a given descendant's bytes survive that
re-serialization unchanged turns out to depend entirely on whether the source's existing
formatting (whitespace between a block's delimiter and its own content) already happens to
match what the serializer would emit for that block type — not on where the defect is.
Measured directly (`handoff/2026-09-12-wpbg-hdl-spike-findings.md`): a fixture whose
child markup already matched the serializer's own convention came back byte-identical,
while a fixture with the same shape (defect confined to the parent's own wrapper, valid
children) but different pre-existing whitespace had its children's bytes rewritten, and in
two cases the rewrite introduced findings that were not present in the baseline.

That is not knowable ahead of the rewrite without doing the rewrite and diffing the
result — the exact "was it corrected, or just reformatted?" ambiguity `match` exists to
avoid answering by inspection. So a parent's `match` would not be a `TextEdit` at all; it
would be a bulk, unverifiable rewrite of the parent's entire subtree, masquerading as one.
There is no narrower rule that rescues a scoped version of it: the ticket that proposed
`match` for parents also proposed confining it to defects in the parent's own opening tag,
but the spike's synthetic counter-fixture showed that axis doesn't predict the outcome —
byte-preservation tracks the source's formatting convention, not the defect's location.

Consequence: `match` is `null` for any block with children, permanently, by the same logic
that already governs `search` — not a gap to close later, and not the "nested-parent
support" bead `wpbg-lsf`'s original ticket anticipated.
