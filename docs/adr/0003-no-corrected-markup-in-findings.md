# Findings do not carry corrected markup

Status: accepted — cost rationale amended 2026-09-04

We deliberately do not add a `match` field holding the corrected markup for a flagged
block, even though it is the obvious companion to `search`. The reasons are correctness
ones: block-runner exposes no per-block correction, and for a real share of findings no
correction exists at all.

Recording this because the field is an obvious thing to propose again, and because three
cheaper-looking routes all fail in ways that are not apparent from the code:

- **Parsing block-runner's `reason`.** The diff is in there, but as a normalized
  attribute-tuple summary with no tag name, quoting style, or attribute order. It
  describes a mismatch; it is not two swappable strings. `--explain` adds nothing.
- **Scraping `fix`'s stderr.** It does emit real markup, but for one block per run and
  only for a block it could not repair. `validate` writes nothing to stderr.
- **Diffing before and after canonicalization.** Canonicalization is non-mutating if you
  discard its output, which looks ideal, but it reformats the whole document — so "this
  block changed" does not mean "this block was invalid".

The route that remains open is extracting each block and canonicalizing it alone. Its
blocker is correctness, not speed: it is unverified whether a block validated in isolation
gets the same verdict as in context, and that is most doubtful for deeply nested blocks
whose parents are also invalid. Settle that before reopening this.

## Cost is not the reason (amended)

An earlier version of this ADR rejected per-block canonicalization as costing "roughly 12s
per invalid block", and called it disproportionate. That figure was measured against the
adapter as it stands on `develop`, which spawns a fresh block-runner process per call and
therefore re-pays the jsdom + `@wordpress/*` boot every time. It does not generalize.

Called in-process, the boot is a one-time cost inside the *first* call and every call after
it is cheap — measured at 8.8s for the first `validate()`, then 11-36ms per subsequent
`validate()` or `canonicalize()`. Per-block correction across a whole file is therefore
fractions of a second on top of the validation already being performed, **provided the
adapter calls block-runner as a library instead of spawning it.**

So the cost objection is conditional on adapter shape, not inherent. Do not cite it as a
reason to refuse this field.

## On `save()` being JavaScript-only

WordPress/Gutenberg PR #82013 states that producing saved markup means running a block's
`save()`, which exists only in JavaScript. That rules out any PHP or server-side route and
is worth knowing when someone proposes one.

It is not a constraint on this tool, which already runs `save()` through block-runner in
jsdom. An earlier version of this ADR leaned on it as though it were.

## Consequence

Some findings have no correction available even in principle — markup carrying anything
`save()` would never emit, such as an `aria-hidden` attribute on a `core/group`. Upstream's
own answer to this class is to let a block declare it cannot round trip, not to synthesise
a fix. Any future attempt here should expect `null` for a meaningful share of findings
rather than treat it as a gap to close.
