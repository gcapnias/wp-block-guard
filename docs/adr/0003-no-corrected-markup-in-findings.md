# Corrected markup in a finding must be verified, or absent

Status: accepted — cost rationale amended 2026-09-04; isolation blocker resolved 2026-09-05;
prohibition narrowed to a verification requirement 2026-09-12 (wpbg-lsf shipped `match`; see
Amendment below)

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
blocker was correctness, not speed: whether a block validated in isolation gets the same
verdict as in context, most doubtfully for deeply nested blocks whose parents are also
invalid.

**That is now settled: it does** — see
`handoff/2026-09-05-block-isolation-verdict-spike.md` (wpbg-4n7). Not by fixture luck but
by construction: `validateBlock` compares `getSaveContent(blockType, block.attributes)`
against `block.originalContent`, and `save()` is invoked with no block context, so nothing
outside a block's own delimiter span feeds its validation. Extraction does not need to
carry the parent's delimiters, so the overlapping-span problem does not arise. `wpbg-x8v`
is reopened accordingly.

Two obstacles survive the spike and are what any `match` field must answer to:
canonicalization decodes HTML entities, so it is not byte-preserving; and blocks with no
`save()`-compatible correction stay invalid, per the Consequence section below.

## Cost is not the reason (amended)

An earlier version of this ADR rejected per-block canonicalization as costing "roughly 12s
per invalid block", and called it disproportionate. That figure was measured against the
adapter as it stands on `develop`, which spawns a fresh block-runner process per call and
therefore re-pays the jsdom + `@wordpress/*` boot every time. It does not generalize.

Called in-process, the boot is a one-time cost inside the *first* call and every call after
it is cheap — measured at 8.8s for the first `validate()`, then 11-36ms per subsequent
`validate()` or `canonicalize()`. Per-block correction across a whole file is therefore
fractions of a second on top of the validation already being performed.

That is no longer conditional: Layer 2 now calls block-runner in-process, so the cheap
path is the one in effect — see
`docs/adr/0004-in-process-block-runner-invocation.md`. **Cost is not a reason to refuse
this field.** The correctness question that remained has since been answered in the
affirmative — see above.

Re-measured per-block during that spike: 8 isolated `validate()` calls totalled 128ms
(median 9ms), and the two repairable blocks canonicalized alone in 12ms and 34ms.

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

## Amendment (2026-09-12): `match` exists — the objection was satisfied, not overturned

wpbg-lsf added `match` to `BLOCK_INVALID` findings: the verified replacement text for
`search`, together forming an LSP-style `TextEdit` expressed as text (`src/findings.js`).
This ADR's original title was a flat "no" to exactly that field, and that "no" is no
longer literally true, so the title above has been changed to say what still holds.

What this ADR actually argued was never "corrected markup must never appear in a
finding" for its own sake — it was that an *unverified* correction is a liability,
because a consumer applying it unattended cannot tell a real fix from a guess. That is
the same honesty principle `docs/adr/0002-search-is-byte-exact-or-absent.md` states for
`search`: a wrong value is worse than a missing one, so `null` is the honest answer
whenever certainty isn't there. wpbg-lsf did not decide that principle no longer
applies to corrected markup; it built `match` to satisfy it.

Concretely, `resolveMatch()` (`src/block-locator.js`) never returns computed replacement
text on the strength of the computation alone. It only ever returns text after splicing
the candidate back into the block's own delimiters and re-validating that whole
candidate from scratch; anywhere that re-validation does not come back clean — the
splice still reports findings, resolves to other than exactly one block, or the
canonicalization step it depends on produced nothing usable — it returns `null` instead.
The two obstacles this ADR flagged as unresolved (canonicalization is not
byte-preserving; some blocks have no `save()`-compatible correction at all) are exactly
why that verification step exists and cannot be skipped, not evidence against it: they
are why an unverified guess would sometimes be wrong, and re-validation is what catches
that before the value ever reaches a finding.

The rule that survives, and binds any future producer of `match` (including any
extension past today's leaf-only ceiling, tracked separately as wpbg-hdl): **corrected
markup may appear in a finding only once it has been independently re-validated as
clean. A computed-but-unverified correction must never be exposed as `match` — it must
be discarded in favor of `null`, the same way an uncertain `search` is.** Read this ADR
as the record of why that verification step is load-bearing, not as a prohibition that
was later dropped.
