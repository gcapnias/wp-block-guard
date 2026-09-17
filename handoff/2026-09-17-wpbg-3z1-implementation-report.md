# wpbg-3z1 — boot timeout budgets set from a measured distribution

**Date:** 2026-09-17
**Branch:** `wpbg-3z1-boot-budgets` (off `develop`)
**Machine:** 12-core Windows 11, Node 24.19.0, vitest 4.1.11
**Worked in the main checkout, not a worktree** — an acceptance criterion required ten
green runs from the main checkout, which a worktree run cannot evidence.

## What the bead asked, and the one-line answer

The suite carried two budgets for the same block-runner boot: 120s for the in-process
warm-up hook, 45s for the same boot inside a spawned CLI child. Both could not be right.

**Resolved upward. All three boot budgets are now 240s** (480s for the two-boot case),
set from 240 measured child boots whose worst case — captured intact for the first time —
was 87.63s.

## What was built

**`src/timing.js`** — env-gated instrumentation. Off unless `WPBG_TIMING_LOG` names a
file; with it set, appends one JSONL record per measured event. Shipped rather than
deleted, because the problem being fixed was precisely that the previous numbers could not
be re-derived. Records `pid`, `proc`, and a run id. Four tests, the first of which asserts
the property that matters in production: with the env var unset it does nothing and touches
no disk. It also cannot throw — instrumentation must not fail a run it is only observing.

**`src/block-runner-adapter.js`** — instrumented at both seams. Note the import order is
load-bearing and commented as such: `./timing.js` is imported immediately before
`block-runner` so its module-evaluation timestamp brackets exactly the cost being measured.

**`scripts/measure-boot.sh`, `scripts/analyse-boot-timings.mjs`** — `npm run measure:boot`
and `npm run analyse:boot`. Deliberately not left in `.scratch/`, which `CLAUDE.md`
declares deletable at any time; leaving the analysis there would have shipped an instrument
nobody could interpret.

## Why measuring inside the child, not by subtraction

The first design was to derive child boot as `spawn_duration − median_no_boot_spawn`. That
was dropped before any data was collected: with `fileParallelism: false`, the no-boot cases
occupy a different wall-clock window than the boot-paying ones, so a stall lasting a minute
hits one set and not the other. It is the same inference wpbg-f06 comment #39 explicitly
withdrew. Measuring at the seam means the in-process boot and the child boot come from one
instrument on one code path — which is also the strongest available answer to "both numbers
cannot be right".

## The measurements

Two campaigns of ten full-suite runs, 3540 records. Full tables in `tests/README.md`.

| Series | n | min | p50 | p90 | max |
|---|---|---|---|---|---|
| In-process boot | 20 | 6.68s | 7.7s | 9.6s | 9.91s |
| Child boot | 240 | 6.61s | 7.6s | 10.0s | **87.63s** |
| Import, CLI child | 420 | 0.80s | 0.89s | 1.10s | 2.68s |
| Import, cli.test.js worker | 20 | 0.89s | 1.02s | 1.21s | **25.52s** |
| Steady-state call | 2820 | 0ms | 0ms | 10ms | 140ms |

### Campaign 1 (budgets raised to 600s): no stall at all

Ten green runs, worst boot 17.78s. **This is the single most important negative result in
the bead**: ten runs did not reproduce the condition the budgets exist for. Setting
constants from that body alone (3–5x of 17.78s → 53–89s) would have ratified roughly the
45s already observed to be insufficient. The first answer, 120s, was set here.

### Campaign 2 (final constants, ten confirmation runs): one stall caught intact

Ten green runs — and run-01 stalled: **87.63s** on one child boot, with a **25.52s** worker
import in the same run, 246s wall clock against a 132s median.

Every stall previously on record was censored: a 45s budget killed the run, so all anyone
could say was ">45s". Raising the budgets *first* is what made this one measurable. It is
also why the 120s from campaign 1 was raised again to 240s — 120s would have left ~1.35x
headroom over it, thinner than the 2.1x this repo already calls the shape that causes false
reds.

## The mistake worth recording

An early draft of these numbers was wrong, and the way it was wrong is worth knowing.

`src/timing.js` originally recorded only a pid. Three kinds of process appear in a log: the
`pipeline.test.js` worker, the `cli.test.js` worker, and spawned CLI children. The
`cli.test.js` worker imports `src/cli.js` for its unit tests, which pulls in block-runner —
so it pays an import and **looked like a CLI child**.

This surfaced as an arithmetic contradiction rather than a hunch: a 25.52s import appeared
in a process that had no boot, so it should have been a case on the 5s default, which
should have gone red — yet the run passed 161/161. A probe confirmed vitest *does* fail
synchronous `spawnSync` bodies that overrun, which ruled out the easy explanation. The real
one: that import happens in vitest's **file-import phase, which no test timeout governs**.

Two things came out of it:

- The instrument now records `proc`, and `scripts/analyse-boot-timings.mjs` **asserts** the
  shape of every run (12 child boots, 9 non-booting children, 1 worker import) and exits
  non-zero rather than printing numbers it cannot vouch for.
- That assertion immediately caught a second defect: **a pid does not identify a process.**
  Windows recycled a pid *within* a single run three times across the 20 runs, merging two
  children in the log. The analysis now splits on the import record, which every process
  emits exactly once.

Both campaigns were reclassified from the existing logs; no re-runs were needed.

## What this settles about wpbg-f06's unnamed failure

wpbg-f06's post-merge campaign saw 1 red in 5 with `import 17.98s`, but the failing case
name went uncaptured. An import-phase stall **cannot** fail a test. So that failure cannot
have been the import; it must have been a boot that stalled in the same window and blew its
45s budget. The 2026-09-17 stall has exactly that shape — worker import and child boot
stalling together — with the boot surviving only because the budget had been raised.

Worth noting honestly: the stall was not uniform. The child that took 87.63s to boot had a
perfectly normal 1.36s import.

## On the I/O hypothesis

Recorded in `tests/README.md` as a **hypothesis consistent with the data, not a confirmed
cause**, per the triage decision to relax that criterion. `Date.now()` deltas measure
duration, not cause, and cannot distinguish an I/O stall from CPU contention. One stall in
20 runs also bounds what can be claimed about frequency.

## Acceptance criteria

- [x] Boot duration measured directly, in-process and in a child, at the same seam
- [x] Distribution over ≥10 runs reported (20 runs, 3540 records), raw logs preserved
- [x] Every boot constant carries its measured cost and headroom factor
- [x] The 120s-vs-45s inconsistency resolved — all boot budgets are 240s
- [x] `tests/README.md`, `vitest.config.js` and both test files updated; no stale figure
- [x] Ten consecutive green runs from the main checkout (campaign 2, final constants)
- [x] I/O-stall hypothesis recorded as a hypothesis
- [x] This report, and a comment on the bead

**One caveat on the ten-run criterion, stated plainly.** Campaign 2 ran at 120s/240s; the
constants then went to 240s/480s. Those runs were not repeated, because raising a timeout
cannot produce a failure a lower one did not — nothing in the suite asserts on elapsed
time, so 10/10 green at 120s is a fortiori evidence for 240s. The runs also had
instrumentation enabled, a superset of the shipped configuration. A reader who wants the
criterion met literally at the final numbers should re-run `npm run measure:boot`.

## Follow-up filed

**wpbg-6nl** — the no-boot CLI cases still pay a block-runner import (2.68s worst of 420)
against the 5s default, ~1.35x. Filed mid-investigation with a misattributed piece of
evidence, since corrected on the bead: the 25.52s stall was the worker's, not a child's.
The margin claim survives; the urgency is lower than first stated.

## Out of scope, untouched

The ~10s start-up cost itself, ADR 0004, `fileParallelism: false`, the warm-up hook's
existence, proving the I/O cause, and block-runner's version (wpbg-w1e).

## Note for anyone comparing against wpbg-f06

The suite is 161 tests, not 157 — this bead added four (`tests/timing.test.js`).
