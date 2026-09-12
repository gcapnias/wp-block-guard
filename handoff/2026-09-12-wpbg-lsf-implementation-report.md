# wpbg-lsf: verified per-block `match` text — implementation report

Implements the brief for `wpbg-lsf` as given directly (not `br show`, per this session's
overrides), following the "Authoritative corrections" section, which supersedes the
original ticket body.

## 1. What changed and why

`match` is now a field on every finding, populated only for a leaf `BLOCK_INVALID`
finding (`node.children.length === 0`) under `--suggest`, and only once the correction
has actually been verified to clear the finding. `null` everywhere else, including on
every plain (non-`--suggest`) run.

### `src/block-locator.js`

- `markupSpan()` stays module-private (see §4 — an earlier pass exported it
  unnecessarily and that was reverted).
- `resolveItemLines()`'s returned entries now carry the block-tree `node` itself
  alongside the pre-existing `line`/`start`/`end` (the `search` span), instead of
  discarding it. This is the "widen the return" instruction from correction B: the node
  is already in hand at the point the span is computed, and `resolveMatch()` needs
  exactly that node — its `children` to gate leaf-only, its own `start`/`end` to isolate
  the block for canonicalization. No second tree-walk.
- New exported `resolveMatch({ node, searchSpan, sourceContent, raw, fixMarkup,
  validateMarkup, conformToSource })`:
  1. `node.children.length > 0` → `null` immediately, before canonicalization is even
     attempted (verified as load-bearing, not redundant — see §3).
  2. `blockMarkup = sourceContent.slice(node.start, node.end)` — the whole block,
     original delimiters included, sliced from the *unmasked* source (same source
     `search` is sliced from).
  3. `correctedRaw = await fixMarkup(blockMarkup)` — canonicalize the block alone.
     `null` output → `null` match.
  4. `conformedBlock = conformToSource(correctedRaw, raw)` — conform the **whole**
     canonicalized block to the file's line-ending convention, *before* extracting the
     inner span. This order matters and was flagged by the advisor before I wrote the
     code: `conformToSource` matches `raw`'s trailing-newline state, and `raw` is the
     whole file, which almost always ends in `\n`. If conform ran *after* extracting the
     inner span (which has its own surrounding whitespace already trimmed off), the
     extracted text would read as "lacks a trailing newline" and `conformToSource` would
     spuriously append one — a blank line an agent's find-and-replace would insert right
     before the closing delimiter. Conforming the whole block first means that spurious
     newline lands outside the span that gets extracted next, and is discarded with it.
  5. Re-parse `conformedBlock` with the same tokenizer (`buildBlockTree`/
     `flattenBlockTree`) used elsewhere in this module, expect exactly one node, and
     take its `markupSpan()` — the same "trimmed element, delimiters discarded" shape
     `search` already uses, just applied to the corrected markup instead of the
     original. This is "extract the corrected inner content" (ticket step 3), expressed
     as the exact same primitive `search` is built from, not a second extraction
     mechanism.
  6. Splice: `sourceContent` up to the *original* `search` span, plus the corrected
     inner content, plus `sourceContent` from the end of the `search` span onward — i.e.
     original delimiters (and any block-internal whitespace outside the trimmed span)
     plus the corrected element. This is ticket step 4.
  7. `validateMarkup(candidate)` and check both `result.ok` (the call itself succeeded)
     and `(result.data.items || []).length === 0` (the markup is actually valid — `ok`
     alone is "call succeeded," not "clean"). Clean → return the corrected inner content.
     Not clean, or the call failed, or the re-parse didn't reduce to one node → `null`.

Regarding correction C's "applied to both the splice candidate you validate and the
value you emit" — the code calls `conformToSource` exactly **once** (on the whole
canonicalized block, per §above), not twice. This was flagged by the Spec review pass
and is intentional, not an oversight: the candidate is assembled from the
already-conformed inner content plus the original delimiter bytes (which are already
native-EOL, being a literal slice of `raw`/`sourceContent`), so the candidate validated
is byte-identical to what an agent produces by replacing `search` with `match` in the
real file. A second call on the same already-conformed text would be a no-op
(`conformToSource` is idempotent on text already in its target convention); it is
omitted because it has nothing left to do, not because the requirement was skipped.

### `src/pipeline.js`

- `findingsForItems()` gained a fifth parameter, `{ suggest, raw }`, defaulting both to
  false/undefined so the plain-validate and `--fix` post-write revalidate call sites are
  unaffected unless they opt in. Only the first call site (Layer 2, the one that runs
  under `--suggest`) passes `suggest: suggest && !hasEmbeddedPhp` and `raw`; the
  `--fix` revalidate call site (always reached with `suggest: false` in the enclosing
  scope) is untouched and so never computes `match`.
- The `!hasEmbeddedPhp` term was **not** in the original brief's algorithm description,
  but is required: `--suggest`/`--fix` are already gated out entirely for a file with
  embedded PHP interpolation elsewhere in the body (`fixSkippedReason: "Contains
  embedded PHP interpolation..."`), and `resolveMatch` slices `blockMarkup` from the
  *unmasked* `sourceContent` — so without this term, a leaf `BLOCK_INVALID` finding in
  such a file could get a non-null `match` computed from raw PHP tags, directly
  contradicting the file's own skip reason and risking a canonicalize call over
  content that was never meant to be treated as pure markup. Caught and required by the
  final advisor review pass; verified both that a real fixture reaches this path (a
  runtime-constructed file combining a fixable heading with embedded PHP elsewhere) and
  that the gate is load-bearing (test fails if the `&& !hasEmbeddedPhp` term is
  removed — see §2).
- `findingsForItems`'s `.map()` became `Promise.all(...map(async ...))` since computing
  `match` requires two additional awaited calls (`fixMarkup`, `validateMarkup`) per
  qualifying finding.

### `src/findings.js`

`makeFinding()` gained `match`, defaulting to `null` the same way `search` already does
(`overrides.match == null ? null : overrides.match`), and it sits between `search` and
`fix` in the returned object — field order is part of the JSON contract per the existing
`places search between message and fix` test, now updated to include `match`.

### Docs (`README.md`, `src/help.js`)

Both describe the JSON finding shape and the agent workflow; both now mention `match`
next to `search` — this is user-facing CLI documentation, not a domain doc/ADR, so it
was updated directly rather than flagged as a follow-up.

## 2. The new fixture and its verified findings

`tests/fixtures/wp-block-guard/invalid-parent-valid-child.html` — a `core/group` missing
its `wp-block-group` class (a real, otherwise-fixable near-miss), wrapping a **valid**
`core/paragraph` child. Verified via `node bin/wp-block-guard.js <file> --json` before
locking in any assertion, per repo convention:

```
BLOCK_INVALID on core/group (line 2), message: Expected attribute `class` of value
"wp-block-group word-cloud-bg", saw "word-cloud-bg". Exactly one finding; the child
paragraph is clean.
```

This shape (parent invalid, child valid, parent fixable in isolation) was a deliberate
choice over the ticket's suggested "small `core/group` wrapping one invalid child" —
the advisor caught before I wrote it that an *invalid child* makes the child itself the
leaf finding under test, proving nothing about the children gate. And an *unfixable*
parent (e.g. the `aria-hidden` shape from the wpbg-8j7 report) would make `match: null`
true for two independent reasons at once (the children gate *and* no correction
existing), so a test against it would still pass with the children gate deleted —
which is exactly the class of vacuous test this whole bead is trying not to write.
Documented in `tests/README.md`'s fixture table.

Because that fixture alone can't isolate *which* of the two mechanisms is responsible
for the `null` (see §3), a second, unit-level test directly exercises `resolveMatch()`
with a hand-built node and stubbed `fixMarkup`/`validateMarkup` (mirroring the existing
`resolveItemLines` stub-test style in `tests/block-locator.test.js`), asserting `null`
**and** that `fixMarkup` is never called when `node.children.length > 0` — proven to
fail when the gate is removed.

## 3. A genuine finding: the children-gate is redundant in one specific sense, but is real, load-bearing protection in another

While verifying the fixture test would fail if the leaf-gate were removed (per the
brief's and the advisor's instruction to check this empirically, not assume it), I found
it does **not** fail against the real fixture: canonicalizing a parent's full block
markup (including its child's delimiters) via `fixMarkup`, then re-parsing the result
with `flattenBlockTree(buildBlockTree(...))`, always returns **more than one node**
whenever the block has children — `flattenBlockTree` walks and flattens descendants too,
so a parent with one child always yields at least 2 entries. The existing
`correctedNodes.length !== 1` check (needed anyway, to confirm the corrected markup is
still exactly one *top-level* block) catches this independently of the explicit
`node.children.length > 0` check.

So against the real fixture, the two guards are redundant with each other, and deleting
the explicit gate does not make the integration test fail. This is not a bug — `null` is
still the correct, safe answer either way — but it does mean the fixture-level
acceptance criterion ("proven by the new nested fixture... with no destructive value
emitted") is satisfied for the *outcome*, not for isolating *which* guard produces it.

The unit-level `resolveMatch` test (§2) is what actually isolates the explicit gate: it
stubs `fixMarkup` to throw if called, and confirms the gate returns `null` **before**
`fixMarkup` is ever invoked. That is worth keeping even though it's "redundant" with the
downstream node-count check, for two reasons: (1) it is the only test that would catch a
future change to `flattenBlockTree`'s behavior silently losing this protection, and (2) a
future reader who deletes the explicit gate "because it's redundant" would remove the
short-circuit that keeps a parent's markup from ever reaching `canonicalize()` at all —
cheaper and more obviously correct than relying on a downstream count to catch it after
the fact.

## 4. Standards/Spec review findings and how they were resolved

Ran `/code-review` (two parallel sub-agents) against `a083fdf` (the branch point), then
consulted the advisor on both reports plus my own empirical follow-up before finalizing.

**Standards review — acted on:**
- `markupSpan` had been changed from module-private to `export`ed, on the mistaken
  assumption another module would need it. It doesn't — `resolveMatch` lives in the same
  file (`src/block-locator.js`) and calls it directly. Reverted to private.
- `src/block-locator.js`'s header comment described the module as solely re-deriving
  block positions (a "Divergent Change" smell once `resolveMatch` added a second,
  unrelated responsibility). Added a short paragraph noting the same block-isolation
  fact the module already rests on is what makes `resolveMatch` sound too, rather than
  leaving the new responsibility undocumented at the top of the file.
- Long-parameter-list note on `resolveMatch`'s 7-key options object: consistent with
  the pre-existing `resolveItemLines({ content, items, validateMarkup })` dependency-
  injection pattern in the same file (needed to avoid a `pipeline.js` ↔ `block-locator.js`
  import cycle, since `conformToSource` lives in `pipeline.js`); not changed.

**Standards review — flagged, not acted on (per this session's explicit brief):**
- `docs/adr/0003-no-corrected-markup-in-findings.md` opens by describing exactly the
  field this bead adds as something "we deliberately do not add." ADR 0006 already
  reframes 0003 as background rather than a live prohibition, but 0003's own status line
  is unchanged and now reads as false on its face. The brief for this session explicitly
  said not to amend it myself and to flag it as a follow-up `domain-modeling` task for
  the orchestrator to file — done here, not touched in the diff.
- `CONTEXT.md`'s glossary documents `search`, `Suggestion`, and `fixSkippedReason` but
  has no entry for `match`. Per the same brief section and the advisor's explicit
  guidance ("flag `match` for the same follow-up as ADR 0003 rather than amending it
  yourself"), this is flagged here rather than edited — it belongs in the same
  `domain-modeling` follow-up as the ADR 0003 amendment.

**Spec review — one clarification, no code change:** flagged that correction C's
"applied to both the splice candidate you validate and the value you emit" reads as two
separate `conformToSource` calls, where the code makes one. Addressed in §1 above:
functionally equivalent by construction (the candidate is assembled from
already-conformed content plus native-EOL delimiter bytes), confirmed intentional via
the advisor, not corrected.

**Spec review — confirmed, no gaps found** on every acceptance criterion, including the
embedded-PHP interaction (checked empirically, not just read): `null` on plain runs,
verified `search`→`match` replacement + re-`validateFile` (not string comparison),
`null` for the new nested fixture, `null` for `unfixable-extra-attribute.html`,
CRLF/LF fidelity via runtime-constructed inputs (no `.gitattributes`, no literal "CRLF
fixture"), and `search` left unchanged (dedicated test plus the field-order test).

**A vacuous test caught late, after the first `/code-review` pass:** the advisor's final
review pass caught that my original embedded-PHP test asserted `match === null` against
`pattern-with-interpolation.php`, which produces **zero** `BLOCK_INVALID` findings at
all — so the assertion held trivially regardless of whether the `!hasEmbeddedPhp` gate
existed, the same class of trap the wpbg-8j7 report's own §2 warns about ("a single-line
`search` contains no EOL... would have been vacuous"). Replaced with a
runtime-constructed file combining a genuinely fixable leaf `BLOCK_INVALID` (heading
missing its class) with embedded PHP interpolation elsewhere in the body — confirmed via
the CLI first, then proven load-bearing by temporarily removing `&& !hasEmbeddedPhp`
from the call site and confirming the test fails (`invalid.match` came back as the real,
non-null correction), then restoring it and confirming the full suite is still green.

## 5. Full test-suite result

```
npx vitest run

 Test Files  5 passed (5)
      Tests  118 passed (118)
```

118 = 106 pre-existing (per the wpbg-8j7 report) + 8 new integration tests in
`tests/pipeline.test.js` (`describe('validateFile — --suggest match (wpbg-lsf)')`) + 4
new unit tests in `tests/block-locator.test.js` (`describe('resolveMatch')`). No
pre-existing test was deleted; two were edited deliberately and are called out above
(the field-order test, and the `--suggest` parity test, which now excludes `match` from
the field-by-field equality check and asserts it directly instead — `null` on the plain
run, non-null on the `--suggest` run for that fixture's leaf finding).

This run was taken **after** all review-driven fixes (the `markupSpan` export revert,
the header-comment addition, and the embedded-PHP test replacement), not before —
an earlier 118/118 run predates those changes and was superseded, per the advisor's
explicit instruction to re-run after edits rather than report a stale number.

## 6. Things that turned out differently than the brief expected, or worth flagging

- **The brief's leaf-only "children gate" and the downstream `correctedNodes.length !==
  1` check turned out to overlap for every case the fixture can exercise** — see §3.
  Kept both; the unit test is what actually isolates the explicit gate's own
  contribution.
- **The `!hasEmbeddedPhp` term was not in the ticket's algorithm** and was required
  by a case the brief didn't anticipate (a leaf `BLOCK_INVALID` finding in a file that
  also has embedded PHP elsewhere). Added, tested, and proven load-bearing — see §1
  and §4.
- **`docs/adr/0003-no-corrected-markup-in-findings.md`'s status line is now false** and
  needs a `domain-modeling` follow-up to amend it (as the wpbg-lsf handoff from
  2026-09-06 already anticipated). **Flagging per instructions, not amending it here.**
- **`CONTEXT.md`'s glossary has no `match` entry**, unlike every other agent-facing
  finding field. Same follow-up as the ADR 0003 amendment — flagging, not amending.
- Everything else in the brief built and tested as written; no acceptance criterion was
  found to be unbuildable.

## 7. Files changed

- `src/block-locator.js` — widened `resolveItemLines`'s return to carry the resolved
  node; added `resolveMatch()`; header comment updated to acknowledge the module's
  second responsibility. `markupSpan` remains private.
- `src/pipeline.js` — `findingsForItems()` takes `{ suggest, raw }` and computes `match`
  for a leaf `BLOCK_INVALID` finding when `suggest && !hasEmbeddedPhp`; the Layer-2 call
  site passes both; the `--fix` post-write revalidate call site is unchanged.
- `src/findings.js` — `makeFinding()` emits `match` (defaulting to `null`) between
  `search` and `fix`.
- `src/help.js`, `README.md` — documented the new field in the JSON shape and agent
  workflow sections.
- `tests/fixtures/wp-block-guard/invalid-parent-valid-child.html` — new fixture (§2).
- `tests/README.md` — fixture table entry for the above.
- `tests/pipeline.test.js` — field-order test updated; `--suggest` parity test updated
  to exclude/assert `match` separately; new `describe('validateFile — --suggest match
  (wpbg-lsf)')` block (8 tests: plain-run null, search-unchanged, verified
  search→match replacement + re-`validateFile`, children-gate via the new fixture,
  unresolvable correction via `unfixable-extra-attribute.html`, embedded-PHP
  interaction, CRLF fidelity, LF fidelity).
- `tests/block-locator.test.js` — new `describe('resolveMatch')` block (4 unit tests,
  stubbed block-runner, no jsdom boot): children-gate short-circuit (proven load-bearing
  by deliberately breaking it), canonicalize-failure → `null`, unclean-candidate →
  `null`, and the success path.
- `handoff/2026-09-12-wpbg-lsf-implementation-report.md` — this report.

## 8. Commits

See this worktree's `wpbg-lsf` branch git log for the commit(s) made alongside this
report.
