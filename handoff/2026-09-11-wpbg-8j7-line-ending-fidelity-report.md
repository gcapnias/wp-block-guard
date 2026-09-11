# wpbg-8j7: `--fix` line-ending fidelity — implementation report

Implementation report for `wpbg-8j7`. The ticket's own title and "Suggested fix" ("append
a trailing newline if the fix dropped one") were superseded by the triage comment
(comment id 19), which widened the scope to full line-ending fidelity (CRLF vs. LF, not
just EOF) and named the fix as reusing `conformToSource` at the `--fix` write call rather
than writing a second normalizer. This report follows that brief, plus the three
follow-up questions posed alongside it.

## 1. Answers to the pre-work questions

### Q1: Does the post-fix re-validate path (`src/pipeline.js` findingsForItems call after `--fix`) actually emit `search` values on its findings?

**Yes — confirmed with real output, not inferred.** `unfixable-extra-attribute.html` is a
`BLOCK_INVALID` shape that `--fix` attempts (canonicalize can't resolve it, but nothing
gates it out), so the post-fix re-validate path is reached and produces a residual
`BLOCK_INVALID` finding with a non-null `search`. To make the CRLF/LF distinction
observable at all (a single-line span contains no EOL, so it can't distinguish the two),
I built a CRLF variant at runtime with the offending attribute on a block that wraps
nested content, so the resolved span crosses line boundaries:

```
<!-- wp:group {"className":"word-cloud-bg","layout":{"type":"default"}} -->
<div class="wp-block-group word-cloud-bg" aria-hidden="true"><!-- wp:paragraph -->
<p>Hi</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->
```

Run through `validateFile(tmpFile, { fix: true })` on the CRLF version, the residual
finding's `search` came back as:

```
"<div class=\"wp-block-group word-cloud-bg\" aria-hidden=\"true\">\r\n<!-- wp:paragraph -->\r\n<p>Hi</p>\r\n<!-- /wp:paragraph -->\r\n</div>"
```

— CRLF throughout, and `written.includes(finding.search)` was `true` against the bytes
actually on disk. This confirms the brief's premise: the re-validate path does emit
`search`, so per `docs/adr/0002-search-is-byte-exact-or-absent.md` the write and the
re-validate/slice source must be the same string, and the one-liner conform-at-write-only
fix would have been insufficient.

**Decisive check, not assumed:** I temporarily reverted the write path's `body =
conformedBody` back to `body = fixedBody` (the unconformed LF string) while leaving the
disk write conformed to CRLF, and re-ran the same probe. Result: `search` came back with
LF (`"...aria-hidden=\"true\">\n<!-- wp:paragraph -->\n..."`), and
`written.includes(finding.search)` was `false` — the divergence the brief warned about,
reproduced directly. This is now test 5 in the new describe block (see §2), and it fails
without the `body = conformedBody` line.

### Q2: Is `validateMarkup` genuinely insensitive to line endings?

**Not the way I'd have assumed — but the difference doesn't matter for correctness here, and I want to be precise about why.**

First probe, against `unfixable-extra-attribute.html` (a single-block, single-line fixture,
`offset: 0`): `validateMarkup(lf)` and `validateMarkup(crlf)` returned **byte-identical**
`items` arrays, including `source.htmlLine`/`source.offset`.

Second probe (prompted by review), against `valid-then-invalid-same-name.html` (multiple
blocks, findings not at offset 0): the substantive fields (`block`, `status`, `reason`)
were identical between LF and CRLF, but `source.htmlLine` and `source.offset` **were not**:

```
LF:   htmlLine 3, offset 109  |  htmlLine 9,  offset 331
CRLF: htmlLine 5, offset 111  |  htmlLine 17, offset 339
```

So block-runner's own line/offset accounting is not CRLF-neutral in general — the htmlLine
delta (+2, then +8) doesn't even track a constant per-line offset, suggesting its internal
counting double-counts `\r` in some contexts (attribute values crossing block boundaries,
plausibly). This is a genuine quirk worth flagging, but **it does not affect this fix's
correctness**, because `src/pipeline.js` never uses `item.source.htmlLine`/`offset`
directly except as a last-resort fallback (`findingsForItems`'s `fallback` variable, used
only when `resolveItemLines` can't resolve a position, and `search` is `null` on that path
by construction — see the docblock at `src/pipeline.js:16-20`). The primary path
re-derives positions via `resolveItemLines`'s own tokenizer against whatever content
string was actually passed to `validateMarkup`, so as long as write, re-validate, and slice
all operate on the *same* string (which this fix now guarantees — see Q3), block-runner's
own internal htmlLine inconsistency is fully absorbed and never surfaces in this tool's
output. It's a pre-existing property of block-runner, orthogonal to this ticket, and not
introduced or worsened by this change.

### Q3: Does conforming `header + fixedBody` and slicing back out at `header.length` misalign, vs. conforming `fixedBody` alone?

**Confirmed — conform the body alone; do not conform `header + fixedBody` and slice.**
Traced `extractPhpHeader` (`src/php-fragment.js:24-32`):

```js
const header = match[0];                        // a literal slice of `content` (== raw)
return { header, body: content.slice(header.length), headerLines };
```

`header` is `match[0]` — a substring of `raw` itself, so it already carries `raw`'s native
EOLs untouched, byte-for-byte. `body` is `raw`'s exact tail (`content.slice(header.length)`),
so `header + body === raw` holds identically. Since `header` never needs re-conforming (it
already matches `raw`'s convention by construction) and `body` is exactly what needs to
match `raw`'s trailing-newline state (it's the part of `raw` that follows the header),
`conformToSource(fixedBody, raw)` is the correct, alignment-safe call — no `header.length`
recomputation involved, and no risk of the slice landing mid-multi-byte-EOL-conversion the
way `conformToSource(header + fixedBody, raw).slice(header.length)` would risk if
`conformToSource` ever changed the header's own byte length (which it can, when converting
its EOLs).

## 2. What changed and why

### `src/pipeline.js`

- **Write path** (previously `src/pipeline.js:217`, `await fs.writeFile(filePath, header + fixedBody, 'utf8')`):
  now conforms `fixedBody` to `raw`'s line-ending convention and trailing-newline state
  before writing, and reassigns `body` to the *conformed* string, not `fixedBody`:

  ```js
  const conformedBody = conformToSource(fixedBody, raw);
  await fs.writeFile(filePath, header + conformedBody, 'utf8');
  fixApplied = true;
  body = conformedBody;
  ```

  This is the one-liner the brief anticipated ("wrap the write") plus the widened scope
  from the Q&A: `body` is now the same string as what's on disk, so the subsequent
  `validateMarkup(body)` and `findingsForItems(items, body, body, ...)` calls slice
  `search` out of bytes that match the file, closing the divergence Q1 found.
- **`conformToSource`'s docblock** (`src/pipeline.js:56-59` originally): updated the stale
  comment that said "Only the suggestion path uses this... tracked separately (wpbg-8j7)
  and fixing it belongs at the write call, which the suggestion path never reaches" — now
  describes both call sites sharing the function, per the brief's explicit instruction to
  fix this since it would be wrong once this bead landed.

### `docs/adr/0006-two-workflows-fix-writes-suggest-returns.md`

Updated the "A suggestion is re-conformed to its source" section, which asserted `--fix`
"has the same trailing-newline defect (tracked as its own issue)" as still-open — that
sentence is now false. Replaced it to describe both `--fix` and `--suggest` sharing the
same `conformToSource` call, past tense on the defect. Left the rest of the ADR (the
non-mutation rationale, the `--suggest`-specific findings-describe-disk rationale) alone —
nothing else in it was about this defect.

### Tests (`tests/pipeline.test.js`)

Added a new `describe('validateFile — --fix line-ending fidelity (wpbg-8j7)', ...)` block
with 5 tests, following the `writeWithEol` runtime-construction pattern already used in the
`--suggest` describe block (`tests/pipeline.test.js`, originally around line 425) rather
than checked-in "CRLF fixtures" — every fixture in this repo is committed as LF
(`core.autocrlf=true`, no `.gitattributes`), so a CRLF fixture would silently become an LF
one on a fresh clone or in CI.

The acceptance criteria name four combinations explicitly (LF-with-trailing-newline,
LF-without, CRLF-with-trailing-newline, CRLF-without). **First pass at this test block had
a real gap here**, caught by the `/code-review` Spec pass below, not by me: two of the four
tests both used `'\n'` with `trailingNewline: true`, so only 3 distinct combinations were
exercised, and CRLF-without-a-trailing-newline was never constructed or asserted at all —
exactly the shape where an off-by-one in `conformToSource`'s CRLF-specific trailing-newline
branch could regress undetected. Corrected to four tests, one per named combination, each
asserting both axes (EOL convention and trailing-newline state) together so a fix that
gets one axis right and the other wrong for a given combination can't pass silently:

1. CRLF + trailing newline present.
2. CRLF + trailing newline absent.
3. LF + trailing newline present.
4. LF + trailing newline absent.
5. **The one that actually exercises the `body = conformedBody` reassignment, not just the
   write**: a CRLF input built at runtime whose `BLOCK_INVALID` finding survives `--fix`
   (nested-block variant described in Q1, so the resolved span crosses a line boundary),
   asserting the emitted `search` (a) is non-null, (b) contains `\r\n`, and (c) is found
   verbatim in the file on disk. A single-line-span variant of this test (my first attempt,
   using `unfixable-extra-attribute.html` unmodified) would have been vacuous — a
   single-line `search` contains no EOL, so it passes identically regardless of whether
   `body` was conformed. I verified this by temporarily reverting `body = conformedBody` to
   `body = fixedBody` and re-running: the single-line version still passed (proving it
   inert), the multi-line version failed (proving it load-bearing) — see the code comment
   directly above test 5 for the same note.

## 3. Full-suite result

```
npx vitest run

 Test Files  5 passed (5)
      Tests  106 passed (106)
```

106 = 101 pre-existing + 5 new. **No pre-existing test needed to change or was edited.**
None of the existing `--fix` assertions encoded the old LF-only/newline-stripping
behaviour in a way that this change broke — the existing `--fix` tests
(`tests/pipeline.test.js`, `describe('validateFile — --fix', ...)` and
`describe('validateFile — positions after --fix', ...)`) assert on content substrings
(`toContain('wp-block-heading')`), `ok`/`findings` shape, and line-number positions, none
of which are line-ending-sensitive on an LF-in/LF-out fixture (which is what every checked-
in `.html`/`.php` fixture is, post-`core.autocrlf`). So there was nothing to report as a
broken pre-existing assertion.

## 4. Anything decided against

- **Did not** implement the ticket body's literal suggestion (append-a-newline-only patch)
  — superseded by the triage comment, as instructed.
- **Did not** write a second/parallel line-ending normalizer for `--fix` — reused
  `conformToSource`, per the brief's explicit instruction.
- **Did not** recover `body` via `conformToSource(header + fixedBody, raw).slice(header.length)`
  — ruled out by Q3's analysis before writing any code, per the brief's warning.
- **Did not** treat block-runner's own htmlLine/offset CRLF inconsistency (Q2) as a bug to
  fix in this pass — it's absorbed by the existing `resolveItemLines`-based re-derivation
  and is orthogonal to this ticket's acceptance criteria. Flagging it here so the next
  agent doesn't have to rediscover it if `item.source.htmlLine`'s fallback path ever comes
  under scrutiny for a CRLF file.
- **Did not** touch `.beads/` at all (no `br` mutating commands run from this worktree).
- **Did not** edit any pre-existing test — none needed it (see §2).

## 5. `/code-review` results

Ran the repo's `/code-review` skill (Standards + Spec sub-agents in parallel) against
`git diff 38b70ca` before committing.

- **Standards**: no hard violations. One judgement-call smell noted (mild overlap between
  `conformToSource`'s docblock and the new write-site comment both explaining the
  `--fix`/`--suggest` sharing — left as-is; both comments serve different readers, at the
  function definition and at the call site, and the file's existing style already tolerates
  this density).
- **Spec**: found one real gap (the test-matrix duplication described in §2/§3 above) and
  confirmed the Q1/Q3 answers are backed by the diff's actual logic, not just asserted in
  prose — it independently traced `resolveItemLines` and `extractPhpHeader` and reached the
  same conclusions as §1. Flagged that no test exercises a CRLF PHP file with a header
  (Q3's invariant is checked only by source-reading, not by an executed test) —
  acceptable per the brief, which asked for a structural check rather than a new PHP
  fixture, but noted here for visibility.

The test-matrix gap was fixed (see §2); full suite re-run afterward, still 106/106.

## 6. Notes for the next agent

- This worktree (`worktree-agent-a93d9583912bacf01`) was already sitting at `develop`'s tip
  (`38b70ca`) when I started — no rebase/reset was needed to branch from `develop`.
- The three throwaway probe scripts used to answer Q1/Q2 empirically
  (`.scratch/probe-eol.mjs`, `.scratch/probe-eol2.mjs`, `.scratch/probe-span.mjs`) were
  deleted after use and are not part of the commit — `.scratch/` is gitignored per
  `CLAUDE.md` anyway, but noting it for anyone diffing the worktree.
- `git status` at the start of this session showed untracked
  `.beads/beads.db-lock-pending`/`-reserved`/`-shared` files. Per instructions these were
  left completely alone — not staged, not inspected, not touched — and the commit stages
  only `src/pipeline.js`, `tests/pipeline.test.js`, `docs/adr/0006-...md`, and this report,
  by name.
- If a future change touches `findingsForItems`'s fallback path (`item.source.htmlLine`),
  re-read the Q2 finding above first: block-runner's own htmlLine/offset numbering is not
  reliably CRLF-neutral, even though the fields this pipeline actually surfaces are.
- **`--fix` and `--suggest` do not conform identically for a PHP file whose header and body
  disagree on line-ending convention.** `--suggest` conforms `header + fixedBody` as one
  string, so a minority-convention header gets rewritten to match the body's majority
  convention. `--fix` conforms `fixedBody` alone and leaves `header` untouched (per Q3,
  correctly — `header` is already a verbatim slice of `raw`). For a uniform-EOL file these
  agree exactly; for a PHP file with, say, an LF header sitting above a majority-CRLF body,
  `--suggest`'s returned text would have the header rewritten to CRLF and `--fix`'s written
  file would keep the header as LF. Neither behaviour is wrong on its own, and nothing in
  the brief asked for identical output between the two paths in this specific mixed case —
  but ADR 0006's framing ("`--suggest` computes the identical correction to what `--fix`
  writes") is not quite true here, so don't assume it without checking if this ever becomes
  load-bearing. No fixture in this repo currently exercises a header/body EOL mismatch, so
  this is untested territory, not a known-passing case.

## 7. Files changed

- `src/pipeline.js` — write path now conforms the fixed body to the input's line-ending
  convention before writing, and reassigns `body` to that conformed string so the
  re-validate/slice source matches the file on disk; `conformToSource`'s docblock comment
  updated to no longer point at this bead as unfixed.
- `tests/pipeline.test.js` — new `describe` block, 5 tests (see §2).
- `docs/adr/0006-two-workflows-fix-writes-suggest-returns.md` — updated the now-stale
  "tracked as its own issue" sentence.
- `handoff/2026-09-11-wpbg-8j7-line-ending-fidelity-report.md` — this report (new file).

## 8. Commits

See this worktree's git log for the commit made alongside this report.
