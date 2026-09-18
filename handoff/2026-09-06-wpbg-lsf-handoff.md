# Handoff — next up: `wpbg-lsf` (per-block `match` text)

Written 2026-09-06 at the end of the session that implemented and closed `wpbg-6id`
(`--suggest`). Repo: `E:\Shared\Workspaces\personal\firecrawl-cli`, working branch
**`develop`** (`main` is the git default; work is committed on `develop`).

This document deliberately does **not** restate the design, the rationale, or the
acceptance criteria for your ticket. Those are already written down. Read, in this order:

1. `br show wpbg-lsf --json` and `br comments list wpbg-lsf --json` — the full design,
   probed end to end, plus a correction comment posted this session.
2. `docs/adr/0006-two-workflows-fix-writes-suggest-returns.md` — why `--suggest` exists and
   what its contract is. Your work hangs off it.
3. `docs/adr/0002-search-is-byte-exact-or-absent.md` — the honesty rule `match` must obey.
4. `docs/adr/0003-no-corrected-markup-in-findings.md` — see §4 below before you trust it.
5. `handoff/2026-09-05-block-isolation-verdict-spike.md` — settles the isolation question
   your design relies on.

`wpbg-lsf` is unblocked and appears in `br ready` as of this session. `wpbg-hdl` is blocked
behind it and is explicitly *not* yours — do not attempt nested-parent `match` inside this
bead.

---

## 1. What changed under you this session

`--suggest` shipped and `wpbg-6id` is closed. Commits `4b1899f`, `ce71fba`, `4d69624`,
`64d3fc7`, `3392bd1` on `develop`; the implementation report and findings are comments on
`wpbg-6id`. Suite is green at **101 tests** (`npm test`).

Your bead scopes `match` to "only under `--suggest`". That flag now exists, so the hook
point is real rather than hypothetical.

## 2. Reuse this — it already solves one of your hard requirements

Your bead says *"`match` must be normalized to the input file's own line-ending convention
before emission"* and calls it a hard requirement rather than a nicety.

**That function now exists.** `conformToSource(suggestion, raw)` in `src/pipeline.js`,
re-exported from `src/index.js`. It re-conforms text to the majority line-ending convention
of a source string and matches its trailing-newline state in both directions. It has direct
unit tests (search `describe('conformToSource'` in `tests/pipeline.test.js`).

Do not write a second one. Two caveats for your use:

- It takes the **whole source file** as its second argument to decide the convention. For a
  per-block `match` you want the convention of the *file*, not of the block, so pass `raw`.
- Your bead notes canonicalization can return **mixed** endings within one block (`\n` at
  the delimiters, `\r\n` inside). `conformToSource` normalizes to a single convention, so
  it handles that — but apply it to **both** the splice candidate you validate *and* the
  value you emit, or you will verify something the consumer never applies.

## 3. Four structural facts about the code you are about to touch

Found while working in these files this session. None are obvious from reading the ticket.

**(a) Findings are built *before* the `--suggest` gate runs.** `src/pipeline.js` constructs
block-runner findings in Layer 2 (`findingsForItems`, ~line 179), and the
`if (fix || suggest)` block sits *after* it (~line 189). So you cannot add `match` "in the
suggest branch" — by then the findings already exist. Choose deliberately between threading
a `suggest` flag down into `findingsForItems` and post-processing the findings array inside
the gate. The second is less invasive but means `match` is bolted on after the fact.

Note `findingsForItems` is called **twice**: once in Layer 2 and once on the post-`--fix`
re-validate. Only the first runs under `--suggest` (`--suggest` does not re-validate at
all — see ADR 0006). Do not accidentally wire `match` into the `--fix` path.

**(b) The block-span helpers you need are module-private.** `src/block-locator.js` exports
only `resolveItemLines`. `shallowMarkup()` and `markupSpan()` — the functions that compute
the span your design starts from — are not exported. You will need to widen that surface
or return more from `resolveItemLines`. Worth a moment's design thought rather than
exporting everything: `wpbg-hdl` will want `shallowMarkup` to additionally record child
removal offsets, so pick a shape that does not have to be redone.

**(c) A field-order test will fail the moment you add `match`.** `tests/pipeline.test.js`
has a test named *"places search between message and fix, which is the agent-facing JSON
shape"* asserting the exact key order of `makeFinding()` output. Field order is a
deliberate part of the JSON contract (`JSON.stringify` preserves insertion order). Your
bead says `match` sits *after* `search` and *before* `fix`. Update the assertion in
`src/findings.js` order **and** that test together — a failure there is the contract
working, not a flake.

**(d) `null` must be the default, not the omission.** Your bead requires `match` to be
`null` on every plain (non-`--suggest`) run so the field's presence is stable while the
cost stays opt-in. `makeFinding()` in `src/findings.js` already does this for `search`
(`overrides.search == null ? null : overrides.search`) — follow that pattern rather than
conditionally spreading the key in.

## 4. `docs/adr/0003` is not the prohibition it looks like

ADR 0003 is titled *"Findings do not carry corrected markup"* — i.e. it refuses exactly the
field you are adding. Its body already reopens the question and both of its original
reasons have been overtaken. This session added a pointer in ADR 0006 saying to read 0003
as a record of the obstacles a `match` field must answer to, not as a live prohibition.

**When your work lands, amend ADR 0003's status** so the next reader is not stopped by a
title that no longer holds. That is a `domain-modeling` task, not an afterthought.

## 5. The line-ending trap — read before writing any test

Your bead's acceptance criteria say *"covered by a CRLF fixture and an LF fixture."*
**That is not achievable in this repo**, and a test written that way will pass locally and
assert nothing on CI.

Every fixture is committed as **LF**; `core.autocrlf=true` is set globally and there is no
`.gitattributes`, so a fixture's on-disk line endings are a property of the machine — CRLF
everywhere on a fresh Windows clone, LF everywhere on Linux. `tests/fixtures/mastermind-ls/parts/title.html`
and `tests/fixtures/wp-block-guard/two-invalid-headings.html` *look* like CRLF fixtures in a
working tree and are LF in the index; verify with `git show HEAD:<path>`.

This also means the CRLF measurements your bead reasons from (`title.html`, "CRLF
throughout") are a local authoring artifact. The underlying finding is sound and was
independently re-measured this session — canonicalization really does not preserve line
endings — but the fixture will not reproduce it off that machine.

**What to do instead:** construct line-ending inputs byte-by-byte at runtime. See
`writeWithEol` in the `--suggest` describe block in `tests/pipeline.test.js` for the
pattern. Full reasoning is a comment on `wpbg-lsf` (and on `wpbg-6id`).

No `.gitattributes` was added — pinning fixture endings repo-wide could invalidate
measurements recorded on other beads, and is its own ticket if wanted.

## 6. One deliberate asymmetry to preserve, not "fix"

`--suggest`'s whole-file `suggestedOutput` is **unverified**: it is returned even when
applying it would not clear the finding. Measured precedent — `--fix` on
`unfixable-extra-attribute.html` writes the file and still reports `BLOCK_INVALID`, so
withholding would have been *stricter* than `--fix` rather than equal to it.

Your `match` is the opposite by design: verified, `null` unless the splice validates clean.

That is intentional, not an inconsistency to harmonise. A whole-file suggestion is a
best-effort canonicalization the caller inspects; a per-block `match` is a surgical edit
applied unattended, so it has to earn a higher bar. If you find yourself tempted to relax
`match`'s verification for consistency with `suggestedOutput`, that is the wrong direction.

## 7. Test conventions in this repo

- `npm test` (vitest). **Slow**: block-runner boots real jsdom + `@wordpress/*` in-process,
  ~8–10s for the first call in a file, then single-digit ms. `vitest.config.js` raises
  `testTimeout` well above vitest's 5s default (25000 as of writing, and it has been
  nudged upward before — check it rather than trusting this number); tests making several
  block-runner calls set `45000` explicitly. A cold or contended machine produces spurious
  timeouts — re-run before believing a failure.
- **Never mutate a checked-in fixture.** Copy to `os.tmpdir()` first and clean up in
  `afterAll`. Existing `--fix` and `--suggest` blocks both show the pattern.
- Assert parity against a **real second call**, not a hardcoded string, where the criterion
  is "same as X" — e.g. this session asserted skip reasons `toBe(fixed.fixSkippedReason)`
  rather than pattern-matching. Your bead's "replacing `search` with `match` produces a file
  that validates clean" criterion explicitly wants the same treatment: perform the
  replacement and re-run `validateFile`, do not compare strings.
- New fixtures: run through `node bin/wp-block-guard.js <file> --json` first and copy the
  actual output into assertions. Document the fixture in the table in `tests/README.md`.
  Check a new fixture actually reaches the code path you think it does — this session found
  no existing fixture could exercise PHP-header re-attachment, because the obvious
  candidates short-circuit on earlier gates.

## 8. Working agreements

Mostly in `CLAUDE.md` and `docs/agents/issue-tracker.md`; the ones that bite:

- Commit on `develop`. Imperative subject naming the outcome, no conventional-commit prefix.
- Bead comments: write to a file and pass `--file`. Passing markdown via `--message`
  silently truncates from the first `"` onward. Same for `br create --description-file`.
- `br sync --flush-only` before any commit touching bead state, then stage
  `.beads/issues.jsonl` explicitly. Never stage `.beads/beads.db-lock-*`.
- Never run bare `bv` (blocking TUI). Never hand-edit `.beads/`.
- **Claiming a ticket is permission to investigate, not to implement**: correct the brief,
  get review, confirm with the user, *then* code. This session's brief overrode the ticket
  body on a substantive point; expect to do the same if the design does not survive contact.
- `.scratch/` is free scratch space; `handoff/` is committed.
- Authoring tip: writing JS source through bash heredocs mangles `\n` and `\r\n` escapes.
  Write the payload to a file first, or use the file-edit tools, if the content contains
  escapes or backticks.

## 9. Suggested skills

Call these with the `Skill` tool:

- **`tdd`** — first. Your acceptance criteria are already written as behaviours to assert
  (perform the `search`→`match` replacement and re-validate; prove `null` for parents and
  for non-resolving corrections; line-ending fidelity). Natural red-green fit, and the
  verification gate is the whole point of the feature.
- **`domain-modeling`** — when `match` lands, to amend ADR 0003's status (§4) and add
  `match` to the `CONTEXT.md` glossary alongside `search` and `Suggestion`.
- **`code-review`** — before calling it done. This feature emits text an agent applies to
  files unattended; a wrong `match` corrupts content rather than merely failing.
- **`ce-commit`** — for each commit.

Skip `firecrawl` and the research skills. Every open question here is empirical against the
local block-runner install and a probe answers it in seconds — the last question in this
area was wrongly closed on an out-of-date cost estimate and later settled by measurement.
