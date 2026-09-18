# wpbg-zxg: mask a trailing unclosed `<?php` to EOF instead of validating it as markup

## Summary

An unclosed `<?php`/`<?=` opener means PHP runs to EOF. Previously the tool didn't
model that: `maskEmbeddedPhp` (`src/php-fragment.js`) only masks balanced `<?...?>`
regions and deliberately left an unclosed opener alone, so PHP source after it was fed
to the structural pre-check and block-runner as if it might be markup — producing a
false `STRUCTURAL_UNBALANCED_DELIMITER` on a PHP string literal (case A) or an outright
false failure on an ordinary all-PHP file like `functions.php` (case B).

This change adds detection and opener-to-EOF masking for that case, a new warning-level
finding code `PHP_TRAILING_SECTION`, and suppresses `STRUCTURAL_NO_BLOCKS` specifically
when the file is entirely PHP (not merely whenever a trailing section exists anywhere).

Full suite: **157/157 passing** (up from the 139 baseline on `develop`), one full
clean run with no flakes. `src/report.js` and `tests/report.test.js` were not touched.

## Where the detection and masking live

- **`src/php-fragment.js`** — new exports:
  - `findTrailingPhpSection(body)`: a hand-rolled state machine, *not* a `<?`/`?>`
    token count. It walks the body tracking single/double-quoted strings (backslash
    escapes), `/* */` block comments, `//`/`#` line comments (per PHP's own rule, a
    line comment ends at end-of-line **or** `?>`, whichever comes first — so a `?>`
    inside a line comment correctly *is* a real closer), and heredoc/nowdoc bodies
    (terminated by a line starting with the declared identifier). Only a `?>` found
    outside all of those is treated as a real closer. Returns the *first* unclosed
    opener (once PHP is running to EOF from there, everything after — including more
    `<?php`/`?>`-shaped text — is inside that same run, not a second occurrence).
  - `maskTrailingPhp(body, index)`: blanks from `index` through EOF with the same
    same-shaped-whitespace technique `maskEmbeddedPhp` already uses (newlines
    preserved), so line numbers for markup *above* the section are untouched.
  - `firstPhpOpenerIndex(content)`: index of the first opener anywhere in a string, or
    `null`. Added during code review (see "Findings from review" below) to remove a
    duplicated inline regex from `src/pipeline.js`.
  - `maskEmbeddedPhp`'s docstring and the module header comment were updated to
    describe the trailing case as a third, separate situation rather than "that rare
    malformed case" with an "acceptable fallback" — both of those framings were wrong:
    omitting `?>` at EOF is idiomatic PHP (PSR-12 recommends it), and the old fallback
    produced a wrong finding that suppressed correct ones.
- **`src/pipeline.js`** (`validateFile`) wires it in:
  1. Runs `findTrailingPhpSection` on `raw`, *before* `extractPhpHeader`, and compares
     its result's index to `firstPhpOpenerIndex(raw)`. If they match — the file's
     first PHP opener is itself unclosed to EOF — header extraction is bypassed
     entirely (`header: null, body: raw`) rather than calling `extractPhpHeader`. This
     is not in the original brief's decided design; see "Deviation" below for why it
     was necessary.
  2. Re-locates the trailing section relative to `body` (offsets differ from `raw`
     when a real header *was* stripped) and filters `scanForEmbeddedPhp`'s balanced-
     block occurrences to only those strictly before the trailing section's start —
     anything at or after it is inside the same to-EOF run, not a second occurrence,
     so it's reported once as `PHP_TRAILING_SECTION`, not also as
     `PHP_INTERPOLATION_UNCHECKED`.
  3. Builds the `detail` override (`isEntirelyPhp` = nothing but whitespace precedes
     the trailing opener) and pushes `PHP_TRAILING_SECTION`, then masks the tail with
     `maskTrailingPhp`.
  4. `isEntirelyPhp` also gates a `continue` in the structural-findings loop that skips
     `STRUCTURAL_NO_BLOCKS` — scoped narrowly (see "Findings from review" below), so it
     does **not** suppress a genuine `STRUCTURAL_NO_BLOCKS` for real blockless HTML that
     happens to be followed by an unrelated trailing PHP section elsewhere in the file.
  5. The trailing section sets the same `hasEmbeddedPhp` flag embedded PHP does, so it
     rides the existing `--fix`/`--suggest` gate (`suggest && !hasEmbeddedPhp`, and the
     `hasEmbeddedPhp` branch of the skip-reason `if`/`else` chain) unchanged — per the
     brief's decision #5, this is deliberate, not an oversight.
- **`src/findings.js`** — new `REGISTRY` entry `PHP_TRAILING_SECTION` (severity
  `warning`), `message: (o) => o.detail || <fallback>` (matching how
  `STRUCTURAL_MISMATCHED_CLOSER`/`BLOCK_RUNNER_SKIPPED` vary their text via
  `overrides.detail`), `fix` is the fixed string from the brief. `search` is the opener
  token (`trailing.token`), consistent with `PHP_INTERPOLATION_UNCHECKED` and ADR 0002
  (byte-exact or absent, never approximate).

## How case B avoids special-casing

`trailing-php-entire-file.php` (no `?>` anywhere) never matches `LEADING_HEADER_RE`
(it requires a closer), so `extractPhpHeader` already returns `header: null, body:
raw` for it with zero changes to that function. `findTrailingPhpSection` finds the
opener at the top of the file, `isEntirelyPhp` is true (nothing precedes it), and
`maskTrailingPhp` blanks the whole body. The structural layer sees an empty body,
reports would-be `STRUCTURAL_NO_BLOCKS`, and the pipeline drops it because
`isEntirelyPhp`. `src/structural.js` was not touched or made PHP-aware; the
suppression is entirely in the caller, as directed.

## Deviation from the brief: `extractPhpHeader` bypass was necessary, not optional

The brief's decision #4 said mask in the body pass and don't touch `extractPhpHeader`
or widen `LEADING_HEADER_RE`, and asserted "case B falls out with no special-casing."
That holds for the literal case B example — but the brief's approach section also
claims the narrow "trailing opener with no closer after it" operation "avoids [the
quoted-`?>`-fooling-a-counter problem] entirely." That specific claim is wrong.
`LEADING_HEADER_RE` (`^\s*<\?php[\s\S]*?\?>`) is a **lazy** match for the first `?>`
anywhere in the file — including one inside a string literal. Given:

```php
<?php
function foo() {
  return "?>";
}
$x = "<!-- wp:heading -->";
```

`extractPhpHeader` would strip everything up through the quoted `?>` as a bogus
"header," emitting a spurious `PHP_HEADER_STRIPPED` and handing the rest of the file
to `body` *without* its `<?php` opener — hiding the true unclosed section from every
later check and letting the `wp:heading` string literal be validated as markup again,
which is exactly the bug this ticket exists to fix.

The fix (added after an advisor review flagged this before any code was written):
`findTrailingPhpSection(raw)` is run before `extractPhpHeader`. If its result is the
very first PHP opener in the file (`firstPhpOpenerIndex(raw)`), `extractPhpHeader` is
bypassed entirely for that file. This is three lines in `src/pipeline.js`, changes
nothing about `extractPhpHeader`/`LEADING_HEADER_RE` themselves, and is exercised by
the new fixture `tests/fixtures/wp-block-guard/trailing-php-quoted-closer.php`
(verified via `--json`: `PHP_TRAILING_SECTION` only, no `PHP_HEADER_STRIPPED`, no
`STRUCTURAL_UNBALANCED_DELIMITER`).

Say this plainly since the brief invited it: reusing `PHP_TAG_BLOCK_RE`'s notion of
"closed" (or a naive counter) for the trailing decision is quote-blind in precisely the
way a counter is — that's why `findTrailingPhpSection` is a real state machine and not
a regex-covered-ranges scan, and why the header side needed the same treatment.

## New fixtures (all verified via `node bin/wp-block-guard.js <file> --json` before writing assertions)

- `trailing-php-after-markup.php` — case A. Findings: `PHP_TRAILING_SECTION`,
  `BLOCK_INVALID` (`core/heading`, `match: null`). No `STRUCTURAL_UNBALANCED_DELIMITER`,
  no `BLOCK_RUNNER_SKIPPED`. `ok: false`.
- `trailing-php-entire-file.php` — case B. Finding: `PHP_TRAILING_SECTION` only. `ok:
  true`, exit 0. Human output matches the brief's target block exactly (module the
  extra `search`/`fix` lines `report.js` already renders for every finding — untouched).
- `trailing-short-echo-no-content.php` — case C, markup + bare unclosed `<?=` at EOF
  with nothing after it. Finding: `PHP_TRAILING_SECTION` only (today, pre-fix, this was
  `PHP_INTERPOLATION_UNCHECKED`; captured as the actual baseline before changing any
  code). `ok: true`, exit 0, no structural error, no `BLOCK_RUNNER_SKIPPED` — outcome
  unchanged as the brief requires; only the finding *code* changed, which the decided
  design (one code, not two) makes correct, not a regression.
- `trailing-php-quoted-closer.php` — regression fixture for the adversarial case above:
  entirely PHP, contains a quoted `"?>"` string literal before the real (missing)
  closer. Finding: `PHP_TRAILING_SECTION` ("File is entirely PHP...") only; no
  `PHP_HEADER_STRIPPED`, no `STRUCTURAL_UNBALANCED_DELIMITER`.
- `trailing-php-after-no-blocks.php` — added during code review. Real, blockless
  `<p>Hello</p>` HTML followed by an unrelated trailing PHP section. Findings:
  `PHP_TRAILING_SECTION` **and** `STRUCTURAL_NO_BLOCKS` (both) — proves the suppression
  is scoped to "the file is entirely PHP," not "a trailing section exists anywhere."

`tests/README.md`'s fixture table has rows for all five.

## Findings from `/code-review` (Standards + Spec axes) and how each was handled

1. **(Spec, real bug — fixed)** The `STRUCTURAL_NO_BLOCKS` suppression was originally
   gated on "a trailing section was found anywhere in the file," which is broader than
   the brief's "suppress ... when the file was entirely PHP." A file with genuine
   blockless HTML followed by an unrelated trailing PHP section would have had its real
   `STRUCTURAL_NO_BLOCKS` silently swallowed. Fixed: the gate is now `isEntirelyPhp`
   (nothing but whitespace precedes the trailing opener), computed once and reused for
   both the message text and the suppression. Covered by the new
   `trailing-php-after-no-blocks.php` fixture and its test.
2. **(Standards, real duplication — fixed)** The opener regex `/<\?(?:php\b|=)?/` was
   being re-derived inline in `src/pipeline.js` to compute `firstOpenerMatch`, alongside
   two existing copies already in `src/php-fragment.js`. Fixed by adding an exported
   `firstPhpOpenerIndex(content)` to `php-fragment.js` and having `pipeline.js` call it
   instead of inlining the pattern a third time.
3. **(Standards, apparent contradiction — clarified in docs, not code)** CONTEXT.md's
   new glossary entry originally said the trailing section is "neither a header nor
   embedded PHP" without qualification, which read as contradicting
   `src/pipeline.js` setting `hasEmbeddedPhp = true` for it. That flag reuse is the
   brief's own decision #5 (explicit, test-locked) — not a bug — so the fix was to add
   a sentence to the glossary entry explaining that the two are conceptually distinct
   but deliberately share the same `--fix`/`--suggest` safety gate. One remaining
   imprecision, left as-is per the brief: `fixSkippedReason` says "Contains embedded PHP
   interpolation; not safely auto-fixable" for a file that has a trailing section but no
   embedded-PHP-mid-markup at all. The *gate* is correct (brief decision #5); the
   *prose* is slightly inaccurate for this one shape. Flagging as separate-bead material
   rather than fixing here, since changing the shared skip-reason string is a
   cross-cutting change to `pipeline.js` and `--fix`/`--suggest` tests together, and the
   brief didn't ask for prose changes to that gate.
4. **(Spec, doc drift — false alarm, verified)** A full-suite run mid-review reported
   155/156 with one `cli.test.js` timeout. Re-ran `tests/cli.test.js` in isolation: 25/25
   passing, ~2 minutes, no failures. Confirmed as resource-contention flakiness from
   running all six spec files' subprocess-spawning tests concurrently (this repo's own
   `tests/README.md` already documents ~10s-per-spawn `block-runner` costs), not a
   regression from this change. A second full run afterward was clean: 157/157.
5. **(Standards, cheap comment fixes — done)** Two comments in
   `tests/php-fragment.test.js` asserted the pre-this-ticket design rationale ("left
   untouched, per design" / a bare "still reports ... once") without noting that the
   *caller* now treats that case differently. Updated both to point at
   `findTrailingPhpSection`/`PHP_TRAILING_SECTION` instead of leaving a reader to
   conclude the trailing case is still unhandled.

## Other things verified, not just inferred

- The `--fix` (non-`--suggest`) write path (`fs.writeFile(filePath, header +
  conformedBody, ...)`) can never run for a file with a trailing section: the
  `hasEmbeddedPhp` branch of the skip-reason `if`/`else` chain is checked first and
  always matches (the trailing branch sets `hasEmbeddedPhp = true` unconditionally), so
  the masked body is never written to disk.
- Line-number arithmetic (`trailing.line + headerLines`) was checked by hand for the
  shape the brief's decided design doesn't have a fixture for: a real leading `<?php
  ... ?>` header **followed by** valid markup **followed by** a separate trailing
  section. `PHP_TRAILING_SECTION` reported `line: 3` for a `<?php` sitting on the
  file's actual line 3 — correct.
- A pre-existing, out-of-scope issue noted for a future bead: `findTrailingPhpSection`'s
  state machine and the existing `PHP_TAG_BLOCK_RE` (used by `scanForEmbeddedPhp` /
  `maskEmbeddedPhp`) will disagree on a *balanced* `<?...?>` region that itself contains
  a quoted `?>` — the lazy block regex stops at the fake closer and mis-masks. This is a
  pre-existing bug in `maskEmbeddedPhp`'s embedded-PHP path, not introduced by this
  change, and out of scope for wpbg-zxg (which is only about the trailing/unclosed
  case).

## Documentation updated

- `src/findings.js` — `PHP_TRAILING_SECTION` registry entry.
- `README.md` — finding-code table row.
- `src/help.js` — `INPUT TYPES` prose (the code table itself is generated from
  `FINDING_CODES`, so no change needed there).
- `CONTEXT.md` — new glossary entry "Trailing PHP section" between "Embedded PHP" and
  "save() diff", defining it as a third distinct PHP situation, restating the "not
  arbitrary PHP" scope boundary, and (per code review) noting its relationship to the
  `--fix`/`--suggest` gate.
- `tests/README.md` — fixture table rows (5 new fixtures), updated
  `php-fragment.test.js` description, and coverage snapshot (139 → 157).

## Full suite result

```
Test Files  6 passed (6)
     Tests  157 passed (157)
```

Clean run, no skips, no flakes on the final pass. `src/report.js` and
`tests/report.test.js` were not touched (reserved for the concurrent wpbg-n9u work).
