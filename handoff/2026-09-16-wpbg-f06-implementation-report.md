# wpbg-f06 — test-suite flake under block-runner boot contention

**Status:** implemented, verified. Bead left open for the maintainer to close.
**Branch:** `worktree-agent-ad6e0a81a493bcb8f`
**Machine:** 12-core Windows 11, Node ≥20, vitest 4.1.11. Every number here was
measured on this machine. The figures in triage comments #36/#37 came from a
different machine and are **not** reused as a baseline.

## The mechanism, stated precisely

block-runner loads jsdom + the `@wordpress/*` tree **lazily, at its first
`validate()` call** — not at import. Probed directly:

| Step | Cost |
|---|---|
| `import('block-runner')` | 1.1–1.3s |
| first `validate()` | 10.3s / 14.4s |
| second `validate()` | 2–3ms |

Because the boot happens at first call, it lands inside a **test body**, and so
inside that test's timeout budget. That is the whole bug, and it explains why the
casualty was always "the first block-runner-touching test in the file" and never
a later one.

Two things follow, and they need different remedies:

- The boot is paid **once per OS process**. Under `fileParallelism`, every worker
  that pays one starts inside the same opening window and they starve each other.
- Whoever runs first **absorbs** the cost. That is an attribution problem, and it
  is independent of contention.

The fix addresses both, separately.

## What changed

Four files. No product code, no assertion changed, no test skipped, no
concurrency introduced into the adapter path.

### `vitest.config.js`

- `fileParallelism: false` — removes the contention window. Also moves the suite
  strictly to the safe side of ADR 0004, whose `captureStderr()` is only sound
  while one block-runner call is in flight.
- `testTimeout` 25000 → **5000** (vitest's default), so that every remaining
  raised budget has to justify itself locally.
- `.claude/worktrees/**` exclusion preserved verbatim.

### `tests/pipeline.test.js`

- **A `beforeAll` warm-up hook** pays the one in-process boot, keeping it out of
  any individual test's budget.
- **All 21 blanket `}, 45000)` timeouts removed**, including the two stale ones
  the ticket named.
- One scoped budget kept: the `block-runner stderr containment` case, which
  spawns the CLI and so pays a boot in a child the hook cannot reach.

### `tests/cli.test.js`

- Three per-case timeouts (`30000`, `45000`, `45000`) removed.
- `ONE_BOOT_BUDGET_MS` (45s) on the three describe blocks that spawn;
  `TWO_BOOT_BUDGET_MS` (90s) on the single case that spawns twice. The two
  pure-unit blocks stay on the 5s default.
- A warm-up is not available here: the boot happens in the child process.

### `tests/README.md`

Rewritten "Running the tests" section plus a new "Timeouts and the block-runner
boot" section holding the **measurement table**, which is now the single source
for every figure cited in the three files above.

## Measured before / after

Before = 3 baseline runs on the unmodified tree (2 file-parallel, 1 serial).
After = 10 consecutive runs on the final tree. min / median / **max**, ms.

| Case | Before | After | Budget |
|---|---|---|---|
| `pipeline.test.js > validateFile — clean cases > validates a clean core/heading block…` | 7427 / 7970 / **11043** | 5 / 5 / **7** | 25s → 5s default |
| `cli.test.js > CLI wiring > exits 0 and emits a clean JSON report…` | 8291 / 9016 / **12692** | 8211 / 8306 / **10806** | 25s → 45s |
| `pipeline.test.js > block-runner stderr containment…` | 8964 / 10332 / **12515** | 8257 / 8324 / **8488** | 45s → 45s |
| `cli.test.js > CLI wiring > --strict turns a warning-only file…` | 16798 / 19223 / **23061** | 16451 / 16592 / **18117** | 30s → 90s |

The **spread** is the result to read, not the medians:

| Case | Before max−min | After max−min |
|---|---|---|
| cli first case | 4401ms | **2595ms** |
| stderr containment | 3551ms | **231ms** |
| `--strict` | 6263ms | **1666ms** |

That collapse in variance is the bug being fixed. The old failures were the top
of those ranges crossing a budget; the ranges no longer reach it.

**Read the first row carefully.** It did not get faster — the boot *moved*, out
of the test and into the warm-up hook, which vitest does not report as a test
duration. The honest framing is: that case went from ~8s to milliseconds, and the
boot it used to carry is now a hook costing about the same as before. Total work
is unchanged, which the file's wall clock confirms:
`pipeline.test.js` alone went **30.2s → 24.1s** (not slower; the saving is the
removed second boot the old first-test/`-t` path could incur).

The last row is the case triage had **not** identified. It makes two
block-runner-backed CLI invocations back to back, and at 23.1s against its old
**30000** budget it was 77% consumed — thinner than either case the ticket names.
Serialisation alone would not have made it safe: it was still 16.8s serial. This
is why the fix is serialisation **and** measured budgets, not either alone.

## Run counts

Three designs were measured, not one. All three campaigns are shown, including
the one that failed.

| # | Condition | Runs | Result | Wall clock |
|---|---|---|---|---|
| — | Baseline, unmodified tree, file-parallel | 2 | 157/157 both | 125.1s, 128.5s |
| — | Baseline, unmodified tree, `--no-file-parallelism` | 1 | 157/157 | 127.3s |
| 1 | Design A (serialise + per-case budgets), ten consecutive | 10 | 157/157 every run | 119.3–154.3s |
| 1 | Design A, concurrent pair | 2 | 157/157 both | 170.5s, 170.4s |
| — | Design A, `-t "<one pipeline case>"` | 1 | **FAILED** (5s timeout) | — |
| 2 | Design B (+ warm-up hook at 45s), ten consecutive | 10 | **9/10 green**; run 1 failed 97/157 | 121.8–225.9s |
| 3 | Design C (hook at 120s), ten consecutive | **10** | **157/157 every run** | **121.4–127.6s** |
| 3 | Design C, two full suites concurrently | **2** (1 pair) | **157/157 both** | 143.5s, 143.5s |
| 3 | `pipeline.test.js` alone | 1 | 60/60 | 24.1s |
| 3 | `-t` filter checks (2 shapes) | 2 | both pass | 9.1s, 3.7s |

Total ≈ 40 full-suite runs, ~90 minutes of test time. The AC's ten-consecutive
and concurrent-pair criteria are satisfied by campaign **3**, on the final tree.

Design C's wall clock is also the tightest of everything measured (121.4–127.6s,
a 6.2s spread across ten runs), against the baseline's 125.1/128.5/127.3s and
Design B's 121.8–225.9s.

## A regression I introduced and then fixed

Worth recording, because it is the same bug wearing different clothes.

Dropping the global timeout to 5s while leaving the boot on pipeline.test.js's
first test made the **full** suite reliable but broke **focused** runs:

```
npx vitest run tests/pipeline.test.js -t "slices a post-fix finding from the rewritten file"
→ FAILED, 5s timeout
```

A filtered run has no predecessor to have warmed anything, so the case had to pay
the boot itself. I had converted an intermittent false red in full runs into a
deterministic false red in focused runs — and focused runs are a first-class
workflow here (this bead's own history is full of them). The `beforeAll` warm-up
is what fixes it; that case now passes in 9.1s.

Verified after the fix:

| Check | Result |
|---|---|
| `-t "<a pipeline case>"` | passes, 9.1s |
| `-t "<a cli unit case>"` (whole suite) | passes, 3.7s total |

The second confirms the warm-up hook does **not** fire for a file with no
matching tests, so focused runs elsewhere don't pay a pointless boot.

## The hook timeout I raised from 45s to 120s — read this sceptically

The sequence "campaign fails, raise a timeout, campaign passes" is structurally
the same move that produced this bead's four prior occurrences. It deserves the
scrutiny, so here is the full account rather than a summary.

Design B put the warm-up hook on a 45s budget (~3.2x the 13.9s worst boot I had
measured). On run 1 of ten, the hook timed out:

```
pipeline.test.js — Hook timed out in 45000ms.   → 97 passed, 60 failed
```

All 60 failures are that one file: a failed `beforeAll` fails every test under
it. Runs 2–10 were clean.

**What I can and cannot tell you about that run.** That run's wall clock was
225.9s against ~122s for its nine neighbours. Roughly 74s of it is unattributed
(cli 103s + hook 45s + others ~4s ≈ 152s against 226s observed).

`cli.test.js` inside that run took 103,196ms against run 2's 101,507ms — 1.7%
apart. It is tempting to conclude from that there was no machine-wide stall and
the problem was localized to the pipeline file. **That inference is wrong and I
am flagging it rather than deleting it, because it is easy to make.** With
`fileParallelism: false` the files run *sequentially*, so `cli.test.js` occupied
a different wall-clock window than the pipeline file did. A stall lasting a
minute or two would hit one and not the other. Equal `cli.test.js` times say
nothing about conditions during the pipeline boot.

The likeliest explanation for the unattributed 74s: a timed-out hook does not
cancel the boot already in flight. Vitest abandons the promise at 45s, but jsdom
and the `@wordpress/*` tree keep loading in that worker, which cannot exit until
they finish. The 74s is then teardown waiting on abandoned work — an *effect* of
the timeout, not evidence of its cause.

**So what I can state is narrow:** the boot exceeded 45s on that run, and ~74s of
wall clock is unattributed and consistent with abandoned-boot teardown. I
**cannot** distinguish a stall localized to that window from ambient machine load,
and I cannot recover what the boot actually cost. I did not re-instrument to find
out, and that is a real gap in this verification.

**Why 120s is nonetheless the right number, independent of that run.** The
argument is not "it made the campaign green":

- A timeout on this hook cannot make the boot faster. The boot is a known, fixed,
  out-of-scope cost (`README` "Known issues"). The only thing a budget here can
  usefully catch is block-runner genuinely *hanging*, and 120s catches that.
- A hook failure amplifies to 60 red tests, not one. That asymmetry justifies
  being more conservative here than anywhere else in the suite.
- Every other budget in this change was left untouched at 45s/90s and was green
  across all three campaigns. The 120s re-qualifies the hook alone.

If a reviewer disagrees, the cheap experiment is to log `Date.now()` deltas
around the hook body and run ten; that yields a real boot distribution rather
than the single censored observation above.

## What I tried and rejected

**Splitting into vitest `projects` so only the two block-runner files serialise.**
Rejected on measurement, as the ticket required — not assumed. The four files
touching neither block-runner nor a subprocess hold 72 cases totalling ~15ms of
real test time; their cost is entirely worker start-up:

| | Parallel | Serial |
|---|---|---|
| The four cheap files alone | 4.29s | **2.71s** |

They are *faster* serially. There is no parallelism win to preserve, so a
projects split would add configuration (and, per vitest semantics, force
replicating the `.claude/worktrees/**` exclusion per project, which is easy to
drop) to buy a negative amount of wall clock.

**A warm-up hook *instead of* serialising.** This is what comment #37 rejected,
and #37 is right: warming still executes inside the contended opening window, so
it does not fix contention. It fixes *attribution*. The two are complementary and
the final design uses both — I've written that reasoning into the hook's comment
so the next reader doesn't think the correction was re-litigated.

**`isolate: false`** (shared module registry across files in one fork) would
genuinely remove a boot, but trades real test isolation for ~10s on a ~130s run.
Rejected.

**Raising timeouts while keeping file parallelism.** Leaves the variance in place
and merely widens the band.

## Deliberately left undone

- **The ~10s block-runner boot itself.** Out of scope; it is the open performance
  issue in `README.md` and needs a long-lived worker process.
- **`cli.test.js` paying a boot per `spawnSync`.** Structural. Removing it means
  either converting cases to in-process `main(argv)` calls — which would weaken
  what they assert, since the file exists to exercise the real binary — or the
  long-lived worker above.
- **Stale `README "Known issues" #N` cross-references** in other test comments.
  The README's numbering has changed (one open issue remains, now #1), so several
  `#2`/`#3` references no longer resolve. I removed those attached to timeouts I
  deleted; I did not sweep the rest. Unrelated to this bead.
- **`.scratch/**` is not in vitest's `exclude`.** Found by accident: a scratch
  probe file of mine was discovered by the full suite (159 cases instead of 157).
  Harmless today — `.scratch/` is gitignored and normally holds no test files —
  but a real trap. Flagged, not fixed; it is a separate change.
- **ADR 0004's "11–36ms" figure for post-boot in-process calls.** I measured
  2–160ms on this suite's fixtures. The ADR's *conclusion* is unaffected, and
  reworking it is explicitly out of scope, so I recorded the re-measurement in
  `tests/README.md` rather than silently contradicting the ADR or editing it.

## Honest limits of this verification

The unmodified tree **did not reproduce the failure on this machine**: it passed
3/3, and parallel vs serial wall clock differed by under 3s, against triage's
224s vs 119s. So the green campaign shows the fix does not break anything and
that the margins are now wide; it is **not** a demonstration that this machine
reproduced the bug and the fix cured it.

The evidence that the fix targets the real mechanism is the timing model (boot at
first `validate()`, once per process, inside a test's timer), the before/after
**spread** rather than the medians, and the fact that every maximum drops. A
confirming run on the maintainer's machine — which does reproduce — is still
worth having.

## Worktree exclusion

Cannot be run from the main checkout from inside an isolated worktree, so the
condition was reproduced locally: a throwaway
`.claude/worktrees/probe/tests/dummy.test.js` containing a deliberately failing
assertion was created inside this worktree and `npx vitest list` run against it.

- The dummy was **not** discovered.
- Exactly **157** cases were listed.

That exercises the same nested-path shape the main checkout sees. **The maintainer
should still confirm once from the main checkout**, since that is the tree the
exclusion actually protects.

## Review

Ran `/code-review` (Standards + Spec axes). Both reports were acted on:

- Spec axis flagged the `CLI wiring` describe carrying a 90s budget for cases
  measured at 1.1–2.5s → the 90s is now on the single two-boot case only.
- Standards axis flagged `tests/README.md` as contradicted by the diff, the
  measurement narrative being triplicated and drifting between the three sites,
  cost-named constants holding budgets, and the silent divergence from ADR 0004's
  figure → all addressed, with `tests/README.md` now the single source.
