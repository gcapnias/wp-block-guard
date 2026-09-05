# A finding's `line` points at the markup at fault

Status: accepted 2026-09-05

**`line` is the first line of the text the finding is about.** One rule, applied to every
code, with no per-code exceptions.

In practice that resolves two ways, and the difference is not an inconsistency — it falls
out of what is actually wrong in each case:

- For `STRUCTURAL_*` codes the delimiter comment *is* the defect: it is unbalanced,
  mismatched, or carries unparseable JSON. `line` is the delimiter's line.
- For `BLOCK_INVALID` the delimiter is fine — it carries the attributes Gutenberg treats as
  correct — and the element inside it is what disagrees with `save()`. `line` is the
  element's line.

So `<!-- wp:heading {"level":2} -->` on line 6 with `<h2>` on line 7 reports line 7: the
`<h2>` is the text an operator or agent has to edit.

Two shapes have no element to point at: a self-closing block, and a block whose inner
content is entirely whitespace. For both, the block as a whole is the text the finding is
about, so `line` is its opening delimiter's line.

## Why this needed deciding

block-runner reports `source.htmlLine` per invalid block, and we passed it straight
through. It is wrong twice over (wpbg-djb):

1. **It points at the delimiter, not the element.** True for every finding on
   `tests/fixtures/mastermind-ls/parts/title.html`, so a consumer treating `line` as "the
   line to edit" was wrong on all of them.
2. **It frequently names a different, valid block.** `locateBlock()` searches for
   `"<!-- wp:<name>"` from a cursor that only advances past the previously *invalid*
   block, so any valid block of the same name in between absorbs the hit. On
   `tests/fixtures/wp-block-guard/valid-then-invalid-same-name.html` it reports lines 3 and
   9 — both valid — for defects at lines 7 and 13.

The second is the serious one: it sends a reader to markup that is not broken, and the
accompanying `fix` prose then describes a block they are not looking at.

## Rejected: make `line` mean the delimiter line everywhere

Superficially simpler, and it would have made `BLOCK_INVALID` agree with `STRUCTURAL_*`
by construction rather than by rule.

Rejected because it optimizes for a consistency the reader does not care about at the cost
of the one they do. The delimiter of an invalid block is not the thing to change — editing
it is usually the *wrong* repair, since the attributes it carries are what `save()` is
being held to. Pointing there would mean every `BLOCK_INVALID` finding names a line that
should be left alone.

## How the position is obtained

Not from block-runner. `src/block-locator.js` re-derives it from the byte-exact spans
`buildBlockTree()` produces in `src/structural.js`, using per-block validation to
establish which candidates are genuinely invalid, then matching block-runner's items to
them in document order.

That is sound because a block validated alone gets the same verdict as it does in its
document — settled in `handoff/2026-09-05-block-isolation-verdict-spike.md`. Gutenberg's
`validateBlock` compares `getSaveContent(blockType, block.attributes)` against
`block.originalContent`, and `save()` is invoked with no block context, so nothing outside
a block's own span feeds its verdict.

Only ambiguous names cost anything: a block name whose candidate count already equals its
finding count has a forced mapping, and a name occurring once cannot be confused with
anything.

## Consequence

Wherever the mapping cannot be established with certainty — our tokenizer and
block-runner's parser disagreeing on block count, a shallow span not reducing to exactly
one block, or the ordered names not lining up — `src/block-locator.js` returns `null` for
every item and `src/pipeline.js` falls back to block-runner's own `source.htmlLine`.

The fallback is deliberate. It is the behaviour that shipped before this decision, so an
unresolvable file is no worse off than it was; dropping `line` entirely would be a
regression on the files where block-runner happens to be right.

`BLOCK_RUNNER_WARNING` is unaffected in practice: block-runner's `validate` only ever emits
items with `status: "invalid"`, so that code cannot currently fire from this path.
