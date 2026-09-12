# wpbg-ztf implementation report

Documentation-only ticket: amend the two documents `wpbg-lsf` (the `match` field) made
factually false. No changes under `src/`, `bin/`, or `tests/`. Files touched:
`docs/adr/0003-no-corrected-markup-in-findings.md` and `CONTEXT.md`, plus this report.

## What I read before writing

- `src/findings.js` — `makeFinding()`'s doc comment and the object it returns:
  `{code, severity, file, line, blockName, message, search, match, fix}`. `match` is
  `null` unless `overrides.match` is non-null.
- `src/block-locator.js` — `resolveMatch()` and the block-tree resolution it depends on
  (`resolveItemLines()`), to see exactly what gates `null` vs. a value.
- `src/pipeline.js` — where `resolveMatch()` is called (`suggest && code ===
  'BLOCK_INVALID' && searchSpan`) and where the embedded-PHP gate is applied
  (`suggest: suggest && !hasEmbeddedPhp` at the call site that builds findings).
- `docs/adr/0002-search-is-byte-exact-or-absent.md` (read only, not edited) — the
  byte-exact-or-null honesty rule for `search`, including the per-file (not per-finding)
  fallback for the position mapping.
- `docs/adr/0006-two-workflows-fix-writes-suggest-returns.md` (read only, not edited) —
  the `--suggest`-requires-`--json` boundary, and its own aside that ADR 0003 "refuses a
  per-finding `match` field" but "its own body reopens the question," instructing a
  reader to treat 0003 as a record of obstacles rather than a live prohibition. I did not
  edit 0006; this report just notes that it already anticipated the direction 0003 needed
  to move in.
- `.out-of-scope/agent-output-in-human-report.md` (read only) — why `match` has no
  human-report rendering, and the prior `wpbg-n9u` attempt that was reverted after it was
  found unreachable from any CLI invocation.

## Task 1 — `docs/adr/0003-no-corrected-markup-in-findings.md`

I did not just flip the status to "superseded." I used the advisor to check this
specifically, and it flagged that "superseded" is the wrong word: that vocabulary means
"replaced by a later ADR," there is no later ADR, and it reads as *the prohibition was
dropped* — the outcome the brief explicitly said not to write. I used instead:

> `prohibition narrowed to a verification requirement 2026-09-12 (wpbg-lsf shipped
> `match`; see Amendment below)`

I also retitled the H1 from "Findings do not carry corrected markup" (now literally
false — `match` is exactly that) to **"Corrected markup in a finding must be verified,
or absent"**, on the advisor's observation that ADR 0002's title stayed true after its
own amendment (`search` is still byte-exact-or-absent), but 0003's original title does
not survive its own amendment the same way, and a reader skimming `docs/adr/` only sees
the title. I did **not** rename the file — `0006` and `.out-of-scope/` reference it by
path, and I was told not to touch either.

The new "Amendment (2026-09-12)" section at the end of the file:
- States plainly that `match` exists and that the old title's flat "no" is no longer
  true.
- Reframes the ADR's real argument: the objection was never "corrected markup must never
  appear," it was that an *unverified* correction is a liability because a consumer
  applying it unattended can't distinguish a real fix from a guess — the same honesty
  principle ADR 0002 states for `search`.
- Cites what `resolveMatch()` actually does: splices the candidate back into the block's
  own delimiters and re-validates the *whole* candidate from scratch, returning `null`
  wherever that re-validation isn't clean.
- States the surviving rule as a binding constraint on any future producer of `match`
  (explicitly including any extension past today's leaf-only ceiling, which I named as
  `wpbg-hdl` per the code comment in `block-locator.js`, not as "a spike is open" per the
  brief's phrasing — the advisor flagged that a concurrent agent owns `wpbg-hdl` and I
  shouldn't assert an outcome for it either way): corrected markup may appear in a finding
  only after independent re-validation; a computed-but-unverified correction must be
  discarded to `null`.

## Task 2 — `CONTEXT.md`

Two changes:

1. **Fixed the `Finding` entry's tuple**, which the advisor caught and the brief didn't
   mention: it read `{code, severity, line, message, search, fix}`, missing `file`,
   `blockName`, and `match` — all of which `makeFinding()` actually returns. Updated to
   `{code, severity, file, line, blockName, message, search, match, fix}`.

2. **Added a `match` entry**, placed immediately after `search` (companion field, same
   style). It covers, as rules a consumer obeys rather than mechanism:
   - **The null causes**, honestly grouped rather than forced into exactly three (the
     brief said "three distinct meanings"; the advisor pointed out `resolveMatch()`
     actually has more return paths than that — no `save()`-compatible correction,
     re-parse producing other than one block, splice failing re-validation — and that
     "not `BLOCK_INVALID`" / "has children" / "no verified correction exists" cover them
     honestly without pretending there are only three code paths). I also added a fourth
     cause the brief's three didn't cover and that the advisor caught: `match` is gated
     on `searchSpan` in `pipeline.js`, and `search`'s own position-mapping fallback is
     per-file, not per-finding (ADR 0002) — so one unmappable item in a file leaves
     `match: null` for every block-runner finding in that file, not just the one with the
     bad mapping.
   - **`--suggest`-only**: a plain run has `match: null` on every finding.
   - **Embedded-PHP suppression**: `match: null` throughout such a file because
     `--suggest`/`--fix` are themselves declined for it.
   - **JSON-only, no human rendering, phrased as a decision**: pointed at
     `.out-of-scope/agent-output-in-human-report.md` and ADR 0006 rather than describing
     it as a gap.
   - `_Avoid_: Suggestion` — the advisor flagged this as the highest-value confusion to
     head off: `Suggestion` is a separate existing glossary term for the whole
     canonicalized file returned instead of writing, and conflating it with `match` (one
     block's replacement text inside one finding) is a live risk given how similar they
     sound. Also `_Avoid_: fix` (already avoided under `Canonicalization` for the same
     reason), `correction`, `patch`.
   - Kept the entry free of implementation detail per the domain-modeling skill
     (`resolveMatch`, `shallowMarkup`, `validateMarkup`, `summary.blocks === 1` etc. stay
     in the ADR, not the glossary).

## Where the brief was imprecise (verified against source, not trusted)

- "Three distinct meanings of `match: null`" — `resolveMatch()` actually has more return
  paths than three when read at the code level (children present; `fixMarkup` returns
  null; re-parsed candidate isn't exactly one block; splice's `validateMarkup` fails or
  isn't clean or reports more than zero items). I kept the glossary entry to the
  consumer-relevant *groupings* the brief asked for, plus the fourth cause the brief
  missed (the per-file `search`-mapping fallback), rather than asserting an exact count
  the code doesn't actually have.
- "A spike is open on whether [leaf-only] is permanent" — the code's own comment in
  `block-locator.js` says nested-parent support is "out of scope here (wpbg-hdl)," not
  that a spike is open. I named `wpbg-hdl` without asserting its outcome, since a
  concurrent agent owns that ticket.
- The brief's suggested ADR treatment ("flip to superseded") would have been wrong
  wording had I followed it literally; I used "prohibition narrowed to a verification
  requirement" instead, per advisor review.
- `CONTEXT.md`'s `Finding` tuple was already stale independent of `match` (missing `file`
  and `blockName` too) — not something `wpbg-lsf` broke, but broken nonetheless and in
  scope for "consistent with what `src/findings.js` actually does."

## Verification

- `git status --short` before committing showed only `CONTEXT.md` and
  `docs/adr/0003-no-corrected-markup-in-findings.md` modified — no `docs/adr/0002`, no
  `handoff/` files besides this one, nothing under `src/`, `bin/`, or `tests/`.
- Full suite: `npm test` → **157 passed (157)**, 6 test files, matching the stated
  baseline exactly.
- Consulted the advisor twice: once before writing (which reshaped both the ADR wording
  and the CONTEXT.md entry materially, see above), and relied on its review throughout
  rather than a second pass, since the first call's corrections were substantive enough
  to act on directly and re-verify against source myself.

## Self-guard confirmation

`git log --oneline -2` at start showed HEAD `8dd07c7` (matching the expected commit) and
`git branch --show-current` showed `wpbg-ztf`, both as instructed before any edits.
