# wpbg-dpw: colorize the human-readable report, surface `search`

Implements the design approved 2026-09-07 (option 1: color only, existing
layout unchanged) superseding the ticket body's "Not yet decided" section.

## What changed

### `src/report.js`

- Added a hand-rolled ANSI table (`ANSI = { red, green, yellow, cyan, gray,
  reset }`) — no new dependency, per the approved design.
- `formatHuman(report, { strict, color })` now takes an explicit `color`
  boolean instead of reading `process.stdout.isTTY` / `process.env.NO_COLOR`
  itself, so it stays a pure function of its inputs. A `paint(code, text)`
  closure applies `${code}${text}${reset}` only when `color` is true;
  everywhere colorized text is built by calling `paint(...)` instead of a
  scattered `if (color)` per line.
- Colorized exactly the scope the design specifies, nothing more:
  - Status line: `statusMark`/`status` — green for PASS, red for FAIL.
  - Finding marker + `[CODE]` — red/yellow/cyan by `severity`, via a new
    `SEVERITY_COLOR` map keyed the same way as the existing `MARKERS` map.
  - The whole `fix:` line — gray.
  - Summary line: only the `N error(s)` and `N warning(s)` substrings are
    tinted, and **only when the count is nonzero** — see "Deviation" below.
- Added a `search:` line, printed after the message line and before the
  `fix:` line, matching `makeFinding()`'s key order
  (`code, severity, file, line, blockName, message, search, fix`).
  `truncateSearch()` takes the first line only, caps it at 80 chars, and
  appends `…` when the value was truncated or was multi-line to begin with.
  Omitted entirely when `finding.search == null` (never prints
  `search: null`).
- `search` is byte-exact input text, so a CRLF file's first line ends in a
  literal `\r`. Printed as-is, that trailing CR returns the terminal cursor
  to column 0 and the `…` overwrites the start of the line instead of
  appending to the end. `truncateSearch()` strips a trailing `\r` from the
  extracted first line before capping/appending the ellipsis. This wasn't in
  the original brief; caught by the advisor review, not by either code-review
  sub-agent or my first test pass — added a dedicated CRLF regression test.

### `src/cli.js`

- Added `shouldColorize({ isTTY, noColor } = {})`, mirroring the existing
  `normalizePatternsForPlatform(patterns, platform)` pattern: it defaults its
  params from `process.stdout.isTTY`/`process.env.NO_COLOR` but accepts
  injected values, so tests can assert both true/false states without faking
  a real TTY.
- `main()`'s non-JSON branch now calls
  `formatHuman(report, { strict: flags.strict, color: shouldColorize() })`.
  `--json` takes a separate branch above this and never calls `formatHuman`
  at all — per the brief, I did **not** add a redundant `if (!flags.json)`
  check inside the color computation; it's structurally unreachable already.
  Covered by an end-to-end test asserting `--json` output has no ANSI
  escapes, without adding a runtime branch that pretends otherwise.

### Tests

- New `tests/report.test.js` (14 cases): color on/off per severity and
  status, `fix:` line dimming, summary-count tinting including the
  zero-count exception, `search` line presence/omission/truncation
  (short/long/multi-line/CRLF), and search-vs-fix line ordering.
- `tests/cli.test.js`: added `shouldColorize` unit tests (TTY×NO_COLOR
  matrix) and three end-to-end CLI checks — non-TTY (piped) output has no
  ANSI, `--json` has none regardless of `NO_COLOR`, and an explicit
  `NO_COLOR=1` run has none. The `NO_COLOR=1` end-to-end case is redundant
  with `shouldColorize`'s own non-TTY suppression (spawnSync always pipes
  stdout), but it pins the acceptance criterion end-to-end rather than only
  at the unit level, per a gap the spec-review sub-agent flagged.
- Did not touch `src/findings.js`, `src/block-locator.js`, or
  `src/pipeline.js` (reserved for the concurrent `wpbg-lsf` work).

## Deviation from the literal brief: zero-count tinting

The brief says the summary line should be "uncolored except tinting the
error count and warning count themselves to match their marker colors,"
without qualifying by value. Implemented literally, this makes a clean run
print a red `0 error(s)` and a yellow `0 warning(s)` — inverting the signal
the tinting exists to carry. Flagged by the spec-review sub-agent and
confirmed with the advisor; I changed the behavior so counts are only
tinted when nonzero, and added a test pinning the all-clear case to plain
text. This is the one place I knowingly deviated from a literal reading of
the approved design, on the grounds that the literal reading contradicts the
design's own stated purpose ("tint to match marker colors," where the marker
for a zero count doesn't appear at all).

## Typechecking

Not run — there is no `tsconfig.json` and no `typecheck` script in
`package.json` (verified: `ls *.json` at repo root shows only `package.json`,
`package-lock.json`, `skills-lock.json`). This was unbuildable as stated in
the brief, not skipped by choice.

## Test results

- `tests/report.test.js` alone: 14/14 passed.
- `tests/cli.test.js` alone (post-edit): 25/25 passed on a targeted
  `-t NO_COLOR` run; the full file passed 24/24 on an earlier full run of
  the same file, except for one flake described below.
- One flake observed and diagnosed, not a regression: `CLI --suggest >
  reports suggestedOutput as null for a clean file` timed out at its 25s
  budget in one `tests/cli.test.js`-only run (block-runner cold start under
  load from the many other CLI-spawning tests in that file), then passed in
  14s when run alone, and passed again as part of the full `npm test` run.
  Pre-existing test-timeout budget issue unrelated to this change; not
  chased further, per the brief's process (full suite run once, actual
  output reported, not silently patched).
- Full suite (`npm test`, all 6 files) prior to the CRLF fix and the
  zero-count fix: **124/124 passed** in 117.5s.
- Full suite after both fixes and the added `NO_COLOR=1` test: see below —
  ran once more as the final check.

Final `npm test` (`vitest run`, all 6 files, after the CRLF fix, the
zero-count-tinting fix, and the added `NO_COLOR=1` test):

```
 Test Files  6 passed (6)
      Tests  127 passed (127)
   Duration  144.50s (transform 616ms, setup 0ms, import 3.34s, tests 163.09s, environment 1ms)
```

127/127 passed, no failures, no flakes on this run.

## Open question, not implemented

`wpbg-lsf` is concurrently adding a `match` field to findings. Whether the
human report should eventually surface `match` too is an open question
neither ticket answers. Flagging as a possible follow-up; not implemented
here and this work does not depend on `match` existing.

## Process notes

- `br`/`.beads/` untouched, per the override — no ticket reads/writes from
  this worktree.
- Two-axis code review run via sub-agents (Standards + Spec) against
  `git diff a083fdf`. Standards review found no hard violations against
  `CONTEXT.md`/ADRs; minor stylistic judgement calls (parallel
  `MARKERS`/`SEVERITY_COLOR` maps, `paint` naming) noted but left as-is per
  advisor guidance — not worth the extra diff for a "keep it small" ticket.
  Spec review found the summary-tinting issue above (addressed) and the
  missing end-to-end `NO_COLOR=1` test (addressed); also noted `search: ''`
  (as opposed to `null`) would print a bare `search:` line — theoretically
  reachable from `src/pipeline.js` in a few spots (e.g. an all-whitespace
  PHP header) but out of scope for this ticket, which only specifies `null`
  suppression.
