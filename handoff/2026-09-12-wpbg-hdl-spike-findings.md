# wpbg-hdl spike: can a parent block ever get a `match`?

**Verdict: no.** Leaf-only is a permanent ceiling, not a temporary limitation — and not for
the reason the ticket gave. `fixMarkup` (Gutenberg's `canonicalize`) recursively
re-serializes every descendant whenever it is asked to correct a parent, unconditionally.
Whether a given descendant's bytes survive that re-serialization depends entirely on
whether the source's existing whitespace/formatting convention happens to already match
what the serializer emits for that block type — a property of the input you cannot know
without doing the rewrite and diffing the result. That is exactly the "was it corrected or
just reformatted?" ambiguity `wpbg-lsf` was built to avoid, so a parent `match` would
reintroduce the very problem the feature exists to sidestep. The narrower "wrapper-only
defect" rule the ticket's footnote proposed does not hold either — see below.

## What the ticket got wrong (confirmed)

The ticket claimed validating a block in isolation strips its children so canonicalizing a
parent comes back with them gone. False, and already independently disproven twice before
this spike: `wpbg-lsf`'s own implementation report (§3) found `flattenBlockTree` on a
canonicalized parent always returns more than one node — children are preserved in the
tree, not silently deleted. This spike's probes confirm the same thing from the pipeline
side: every nested case below re-parsed with the same child count as its baseline
(`invalid-parent-valid-child`: 2→2 blocks; `title.html`: 8→8 in all four probes;
`deeply-nested-mismatched-closer`: 4→4; synthetic zero-whitespace: 3→3). Nothing is
destroyed. `shallowMarkup()` (which genuinely does strip children, by design, for the
unrelated purpose of isolating a block's own verdict) was never the right method to extend
for this — there are no child seams to record because full-block canonicalization never
loses the children in the first place.

## Method

Mirrored `resolveMatch()`'s actual splice exactly (`src/block-locator.js`): original
delimiters, `fixMarkup` on the full block markup, `conformToSource(corrected, raw)` on the
*whole* canonicalized block before extracting anything, `markupSpan` to pull the
trimmed corrected inner element, then splice `slice(node.start, searchSpan.start) +
correctedInner + slice(searchSpan.end, node.end)` — but applied to a node with children
instead of the leaf-only gate that ships today. `conformToSource` was applied before any
byte comparison in every probe (fixtures are CRLF on disk; `fixMarkup` emits LF). Findings
were diffed by identity (`block@htmlLine`) against a same-document baseline, and — the
decisive check — each descendant's own span was re-located in the candidate document and
compared byte-for-byte against its span in the original, not just counted.

Probe script: `.scratch/hdl-probe.mjs` (throwaway, not committed).

## Measurements

| Fixture | Target | Children | Descendant bytes | Findings delta |
|---|---|---|---|---|
| `invalid-parent-valid-child.html` | `core/group` L1 | 1 (`core/paragraph`) | **identical** | none |
| `title.html` | `core/group` L1 | 3 | **changed** (all 3 children) | resolved-away `core/group@3, core/paragraph@8, core/paragraph@16`; **newly-appeared `core/paragraph@9`** |
| `title.html` | `core/group` L6 | 1 | **changed** | resolved-away `core/paragraph@8, core/paragraph@16`; **newly-appeared `core/paragraph@9, core/paragraph@18`** |
| `title.html` | `core/group` L14 | 3 | **changed** (2 of 3 children; the `post-title` self-closer is untouched) | resolved-away `core/paragraph@16`; none newly-appeared |
| `deeply-nested-mismatched-closer.html` | `core/group` (already clean) | 1 (`core/columns`) | **changed** | resolved-away `core/column@3`; newly-appeared `core/column@2` (a clean parent still gets rewritten and still perturbs child findings) |
| synthetic zero-whitespace nested (`.scratch/hdl-nowhitespace.html`) | outer `core/group` | 1 (`core/group`, itself wrapping a valid paragraph) | **changed** (newlines inserted throughout, where the source had none) | none (block-runner still passed) |

Block counts never dropped in any probe (always N→N) — confirming the ticket's stated fear
is unfounded, independent of everything else in this table.

### Why `invalid-parent-valid-child` looked stable, and why that is not a counterexample

This was the one case with byte-identical descendants, and it looked at first like support
for a "wrapper-only" class. It is not. I re-ran `fixMarkup` on just that fixture's whole
markup and printed the actual output:

```
"<!-- wp:group {...} -->\r\n<div class=\"word-cloud-bg\">\r\n<!-- wp:paragraph -->\r\n<p>Hello</p>\r\n<!-- /wp:paragraph -->\r\n</div>\r\n<!-- /wp:group -->\r\n"
```

The source already had `<!-- wp:paragraph -->\r\n<p>Hello</p>\r\n<!-- /wp:paragraph -->`
verbatim — that specific fixture happens to already use the exact interior-newline
convention Gutenberg's serializer produces for `core/paragraph`. Nothing about the
correction being "confined to the wrapper" caused the stability; the coincidence is in the
input's own formatting.

The synthetic zero-whitespace fixture is the direct test of that claim, and it falsifies
it: same shape (outer `core/group` with a wrapper-only class defect, one clean nested
child), but built with **no** whitespace anywhere between delimiters and elements.
Canonicalizing the outer block **inserted** `\r\n` throughout the inner `core/group` and
its paragraph child — bytes the child never had. So byte-preservation is not a function of
where the defect lives (wrapper vs. content); it is a function of whether the source's
existing convention happens to match what the serializer would produce anyway — which is
unknowable in advance and only checkable by doing the rewrite and diffing it. That is
already the ambiguity this feature exists to avoid, so it cannot become the test that
gates emitting `match`.

`deeply-nested-mismatched-closer.html`'s target parent was already clean (`fixMarkup`
still produced a rewrite for it) and its child findings still moved — a clean parent isn't
even a precondition for the rewrite-collateral problem.

### An independent reason, on its own

Two probes (`title.html` L1 and L6) show findings **appearing** that were not present in
the baseline (`core/paragraph@9`, `core/paragraph@18`) — not just existing findings moving
line, but the reformatted child markup reading as invalid to block-runner where the
original did not. A parent `match` would in those cases hand an agent an edit that
introduces new invalid blocks it did not have before. That holds regardless of the
byte-identity argument above and would be sufficient on its own to rule out parent
`match`.

## Does the narrower "wrapper-only" rule hold?

No — see above. The ticket's own footnote framed the narrower rule around *where the
defect is* ("confined to the parent's opening tag"). That is the wrong axis. Defect
location doesn't decide whether descendant bytes survive; the source's pre-existing
formatting convention relative to the serializer's own output does, and that is not
something inspectable ahead of the rewrite. There is no narrow class to characterize and
recommend for a scoped `match` — the mechanism (`fixMarkup` on a multi-block span)
recursively re-serializes descendants unconditionally, every time.

## What in the brief turned out wrong

- **The preliminary "in no case was the targeted parent's own finding resolved" claim in
  the brief does not survive and should not be repeated.** I traced it: my own probe's
  `targetKeyBase` lookup used `baseline.items.find(i => i.block === target.blockName)`,
  which matches the *first* `core/group` finding in the document regardless of which
  group was actually targeted — that is why every `title.html` run printed `core/group@1`
  no matter which line was under test. That line of the brief's evidence is an artifact of
  a probe bug, not a real measurement, on either side of this spike. It is not needed for
  the verdict — the byte comparison and the appeared/resolved-away finding diffs are the
  real evidence and they stand on their own without it.
- **The brief's framing of the narrow-class hypothesis ("confined to its wrapper
  attributes") is the wrong axis**, as above. The right axis is "does the source already
  match the serializer's own formatting convention," which is not a property of the
  defect's location and not knowable without performing the rewrite.
- Everything else in the brief — the corrected picture of "children preserved, not
  stripped," the instruction to mirror `resolveMatch`'s real splice, and the pre-agreed
  "no" conditions — held up under direct testing.

## Recommendation

Leaf-only stands as permanent, and ADR 0002 has been amended (not created — 0002 already
exists) to record the mechanism as the reason, not just the current absence of a feature.
See `docs/adr/0002-search-is-byte-exact-or-absent.md`'s new amendment section. No
implementation bead is recommended for parent `match` itself: there is no scoped version
of it worth building, narrow or otherwise.

**One follow-up bead is warranted, and this spike cannot do it** (`src/` is off-limits
here): `src/block-locator.js` lines 171–178, `resolveMatch()`'s own docstring, currently
reads

> `null` for a block with children, unconditionally: validating a block in isolation
> strips its inner blocks (see `shallowMarkup()` above), so canonicalizing a parent comes
> back with its children gone, and splicing that in would silently destroy them.
> Nested-parent support is out of scope here (wpbg-hdl).

Both claims in that comment are now known false — children are preserved (not stripped),
and this spike is the "wpbg-hdl" it defers to, whose actual finding is that recursive
re-serialization, not destruction, is why parent `match` doesn't work. That comment now
directly contradicts the ADR 0002 amendment above. It needs a `domain-modeling`/doc-fix
follow-up to correct it to describe the real reason (recursive re-serialization plus
formatting-convention-dependent byte drift), the same way `wpbg-lsf`'s report already
flagged ADR 0003's stale status line and `CONTEXT.md`'s missing `match` entry as follow-ups
rather than fixing them out-of-band. Whoever picks up that follow-up should read this
ADR 0002 amendment alongside ADR 0003 and ADR 0006, since 0003 ("no corrected markup in
findings") is the doc most directly in tension with both `match` and this spike's finding.

## Files

- `handoff/2026-09-12-wpbg-hdl-spike-findings.md` — this file.
- `docs/adr/0002-search-is-byte-exact-or-absent.md` — amended with the `match`/leaf-only
  finding.
- No `src/` changes. `.scratch/hdl-probe.mjs` and `.scratch/hdl-nowhitespace.html` are
  throwaway probe artifacts, gitignored, not committed.
