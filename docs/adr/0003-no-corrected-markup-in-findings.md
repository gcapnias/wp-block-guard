# Findings do not carry corrected markup

We deliberately do not add a `match` field holding the corrected markup for a flagged
block, even though it is the obvious companion to `search` and would let an agent complete
a find-and-replace unaided. Producing corrected markup means running the block's `save()`
function, and `save()` exists only in JavaScript — a constraint stated upstream in
WordPress/Gutenberg PR #82013 ("Producing saved markup is a separate problem […] Turning
attributes into markup means running the block's `save()`, which only exists in
JavaScript"). This is a property of Gutenberg, not of this tool, so no amount of local
cleverness removes it.

Recording it because the field is an obvious thing to propose again, and because three
cheaper-looking routes all fail in ways that are not apparent from the code:

- **Parsing block-runner's `reason`.** The diff is in there, but as a normalized
  attribute-tuple summary with no tag name, quoting style, or attribute order. It
  describes a mismatch; it is not two swappable strings. `--explain` adds nothing.
- **Scraping `fix`'s stderr.** It does emit real markup, but for one block per run and
  only for a block it could not repair. `validate` writes nothing to stderr.
- **Diffing before and after canonicalization.** `fix` without `--out` is non-mutating and
  prints corrected markup to stdout, which looks ideal, but canonicalization reformats the
  whole document — so "this block changed" does not mean "this block was invalid".

The only route that works is extracting each block and canonicalizing it alone, at roughly
12s per invalid block. We rejected that as disproportionate: `search` plus the existing
`message` already lets an agent or human locate and correct the markup, at no extra cost
per run.

Consequence: some findings have no correction available even in principle — markup
carrying anything `save()` would never emit, such as an `aria-hidden` attribute on a
`core/group`. Upstream's own answer to this class is to let a block declare it cannot round
trip, not to synthesise a fix. Any future attempt here should expect `null` for a
meaningful share of findings rather than treat it as a gap to close.
