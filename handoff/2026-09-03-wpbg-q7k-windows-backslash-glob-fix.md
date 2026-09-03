# wpbg-q7k: Windows backslash-glob path fix

**Ticket:** wpbg-q7k — CLI fails to match files on Windows-style backslash paths
**Branch/worktree:** `worktree-agent-a82868f047659d6b9` (this worktree)
**Status left in tracker:** `in_progress` (per issue-tracker.md convention, left for the user to review/close)

## Problem

On Windows, `wp-block-guard .\tests\fixtures\mastermind-ls\parts\footer.html` (and any
backslash-style argv pattern) failed with "No matching .html or .php files found", even
though the file exists. `src/cli.js` passed raw argv patterns straight into `fast-glob`
(`fg`), which treats `\` as a glob-escape character, not a path separator — so
`.\tests\fixtures\...\footer.html` gets silently mangled and never matches.

## Fix

Added a small, pure, exported helper in `src/cli.js`, directly above `main()`:

```js
export function normalizePatternsForPlatform(patterns, platform = process.platform) {
  if (platform !== 'win32') return patterns;
  return patterns.map((p) => p.split('\\').join('/'));
}
```

`main()`'s only `fg(...)` call site now reads:

```js
files = await fg(normalizePatternsForPlatform(patterns), { onlyFiles: true, dot: false, unique: true });
```

Confirmed via `grep -rn "fg(\|fast-glob" src/` that this is the *only* call site touching
fast-glob, so the fix has a single choke point as the ticket asked, rather than being
scattered.

On `win32`, every argv pattern gets `\` → `/` normalized before hitting fast-glob. On
every other platform, patterns pass through completely unmodified — `\` remains a legal
glob-escape/filename character there, per the ticket's explicit non-goal.

## Tests (`tests/cli.test.js`)

1. **CLI-level regression test**, gated with `it.skipIf(process.platform !== 'win32')`
   (chosen over an early `if (...) return`, since a bare early return would report as a
   *passing* test on non-Windows CI and mask that it never ran — this repo had no prior
   platform-conditional test pattern to follow, so this establishes one):
   - Builds the argv pattern as a **literal relative backslash string**
     (`'.\\tests\\fixtures\\wp-block-guard\\unbalanced-delimiter.html'`) — deliberately
     *not* routed through the existing `fx()` fixture-path helper, which pre-normalizes
     separators for portability and was explicitly out of scope to touch.
   - Spawns the real CLI binary (`spawnSync`) with that pattern and with its
     forward-slash equivalent, and asserts both runs produce the same exit status and
     identical JSON reports.
   - Uses the `unbalanced-delimiter.html` fixture (already used by another test in this
     file), which trips a Layer-1 structural error and short-circuits before block-runner
     (Layer 2), keeping the test fast — no long timeout needed.
2. **Unit tests for `normalizePatternsForPlatform`**: backslash→forward-slash conversion
   on `'win32'`; forward-slash patterns left unchanged on `'win32'`; backslash patterns
   passed through unmodified on `'linux'` and `'darwin'`. Platform is injected as a
   parameter rather than mocking `process.platform`, keeping the unit tests fast and
   platform-independent.

### Red/green verification

Before finalizing, I temporarily reverted the `fg()` call site to its pre-fix form
(`fg(patterns, ...)`, no normalization) and ran the new CLI-level regression test in
isolation. It failed as expected:

```
AssertionError: expected 2 to be 1
  expect(backslashRun.status).toBe(forwardSlashRun.status);
```

(the backslash run exited 2 — "no matching files" — while the forward-slash run
succeeded), confirming the test actually discriminates the bug. The fix was restored
immediately after.

## Full test suite

`npx vitest run` → **47/47 passing** (4 test files), confirmed on the final run with the
fix in place.

Two `tests/pipeline.test.js` tests (`fixes a near-miss block in place...`,
`fixes a file with multiple BLOCK_INVALID findings...`) intermittently timed out at
45000ms on two earlier full-suite runs, due to slow/cold `block-runner` process spawns.
This is **pre-existing flakiness unrelated to this change** — I confirmed this by
`git stash`-ing my changes and re-running the same failing test against unmodified
`develop`; it failed identically with the same timeout. Not touched, consistent with the
ticket's stated out-of-scope ("do not touch any other cross-platform path handling
issues").

## Files changed

- `src/cli.js` — added `normalizePatternsForPlatform()`; wired into the `fg()` call in
  `main()`.
- `tests/cli.test.js` — added the CLI-level regression test and the
  `normalizePatternsForPlatform` unit tests described above.

## Acceptance criteria

- [x] On Windows, `.\tests\fixtures\...\footer.html`-style patterns resolve to the same
      file(s) as their forward-slash equivalent
- [x] Existing forward-slash pattern behavior is unchanged on all platforms
- [x] New test passes a raw backslash-style pattern as CLI argv, not routed through the
      fixture-normalizing `fx()` helper
- [x] Non-Windows platforms pass `\`-containing patterns through unmodified

## Tracker

- Comment posted to `wpbg-q7k` (comment id 3) with this same summary.
- Status left as `in_progress` — not closed, per this repo's
  `docs/agents/issue-tracker.md` and the ticket brief's explicit instruction to leave it
  for the user to review and close.
