# Bun-compile implementation report: `src/block-runner-adapter.js` rewrite

Implementation report for carrying out the "Concrete implementation plan"
(steps 1-3, 5-7) from `handoff/2026-09-03-bun-compile-wp-block-guard-handoff.md`.
This document records what changed, what was verified, the performance
measurements taken, and — the most important finding — that `bun build
--compile` does **not** currently produce a working binary for this project,
despite the in-process library rewrite itself being correct and working under
both plain Node and plain `bun run`.

## 1. Task recap

The handoff's verdict was: the existing `src/block-runner-adapter.js`
resolves `block-runner`'s CLI script off disk and spawns it as a subprocess
via `node:child_process.spawn`. That mechanism cannot survive `bun build
--compile`, because a compiled binary embeds its dependencies (including
block-runner's CLI script) in a virtual filesystem (`$bunfs`/`B:\~BUN\...`)
that a spawned OS process cannot open. The recommended fix (mitigation "a",
ruled in) was to stop spawning a subprocess and instead import block-runner's
real in-process library API — `import { validate, canonicalize } from
'block-runner'` — since block-runner already exports one. The task was to
implement that rewrite, prove it with the existing test suite, add a
`compile` npm script, and — if Bun was available — actually compile and
smoke-test the resulting executable.

## 2. What changed

### `src/block-runner-adapter.js` — full rewrite

**Old mechanism:** `resolveBlockRunnerCli()` used `require.resolve('block-runner/package.json')`
to find block-runner's install directory, read its `package.json` `bin` field,
and joined the two into a path to `dist/cli.js`. `runCli()` then spawned
`process.execPath` against that path via `node:child_process.spawn`, piping
markup over stdin for `validate --json`, and used temp files (`node:os.tmpdir()`
+ `node:crypto.randomBytes()` for unique names) with `--out` for `fix`.

**New mechanism:** direct in-process calls, `import { validate, canonicalize }
from 'block-runner'`. `node:child_process`, `node:os`, `node:crypto`, and
`node:module`'s `createRequire` are no longer used anywhere in the file and
were removed; only `block-runner` itself is imported.

### Confirmed exact API shape (read directly from `node_modules/block-runner/dist/index.d.ts`)

```ts
declare function canonicalize(markup: string, options?: CanonicalizeOptions): Promise<BlockRunnerReport>;
declare function validate(markup: string, options?: ValidateOptions): Promise<BlockRunnerReport>;

interface BlockRunnerReport {
  ok: boolean;
  command: CommandName;
  summary: ReportSummary;
  items: ReportItem[];
  hint?: string;
  output?: string;
  sidecarCss?: string;
}
interface ReportItem {
  block?: string;
  status: ReportStatus; // 'valid' | 'invalid' | 'warning'
  reason: string;
  source?: SourceLocation;
  rule?: string;
  details?: unknown;
}
interface SourceLocation {
  path?: string;
  selector?: string;
  htmlLine?: number;
  htmlColumn?: number;
  offset?: number;
}
```

This matches `src/pipeline.js`'s existing usage exactly: `result.data.items`,
`item.status`, `item.block`, `item.reason`, `item.source.htmlLine` all line up
field-for-field with `BlockRunnerReport`/`ReportItem`/`SourceLocation`. No
field-name drift.

**The fixed-markup field on `canonicalize()`'s return value was NOT confirmed
from the `.d.ts` alone** — the handoff explicitly flagged this as unconfirmed,
and the type only declares `output?: string` with a generic doc comment
("Advisory guidance only" applies to `hint`, not `output` — the type doesn't
actually document what `output` is for). This was resolved **empirically**: a
throwaway script (`node .scratch/probe-canonicalize.mjs`, deleted after use,
not part of the commit) called `canonicalize()` on the exact markup from
`tests/fixtures/wp-block-guard/invalid-heading-missing-class.html` and logged
the full returned object. Result:

```json
{
  "ok": true,
  "command": "fix",
  "summary": { "blocks": 1, "valid": 1, "invalid": 0, "warnings": 0 },
  "items": [],
  "output": "<!-- wp:heading -->\n<h2 class=\"wp-block-heading\">Hello World</h2>\n<!-- /wp:heading -->"
}
```

`report.output` is the fixed markup string. `fixMarkup()` now reads
`report.output` directly (with a `typeof report.output !== 'string'` guard
returning `null`, matching the function's existing "fixed markup, or `null`
on failure" contract).

One cosmetic delta worth flagging for anyone touching this later: the probed
`report.output` had no trailing newline, whereas the old CLI's `--out`
temp-file write path may have produced one. `src/pipeline.js` does `header +
fixedBody` when writing the fixed file back to disk; the existing `--fix`
regression test only asserts `toContain('wp-block-heading')`, so this delta
is unverified in either direction but did not cause any test failure.

### Preserved external contract

`validateMarkup(markup)` still returns `{ ok, exitCode, data, error, stderr }`
and `fixMarkup(markup)` still returns a fixed-markup string or `null` — no
changes to `src/pipeline.js` or `src/cli.js` were needed. Since a library call
has no real process exit code, `exitCode` is now synthesized: `0` when
`report.ok` is `true`, `1` when it's `false`, `null` on a thrown error.
`stderr` is always `''` (nothing in the codebase reads it outside the adapter
itself — confirmed via `grep -rn "exitCode\|stderr" src tests`). `data` is
the raw `BlockRunnerReport`, which is what `pipeline.js` already expected.

### Other files changed

- **`package.json`** — added `"compile": "bun build --compile ./bin/wp-block-guard.js --outfile bin/wp-block-guard.exe"`.
  (Initially written with `--outfile wp-block-guard.exe` at the repo root; corrected
  mid-task to place the artifact under `bin/` instead, per a scope correction — the
  script, `.gitignore` entry, and all smoke tests below reflect the corrected path.)
- **`.gitignore`** — added `bin/*.exe` so the compiled artifact is never accidentally committed.
- **`README.md`** — rewrote the "Layer 2 — block-runner invocation" section to describe
  the in-process library call instead of the CLI spawn; added a new "Compiling a standalone
  executable (Bun)" section documenting `npm run compile` and its current broken status
  (see §5 below); fixed one stale reference in the Architecture file-tree block and one
  in the `--fix` options-table row that both still said "block-runner CLI"/"`block-runner fix`".
- **`vitest.config.js`** — updated the comment justifying the 20s test timeout (it referenced
  "block-runner spawns a real headless-Gutenberg process," which is no longer accurate now
  that there's no subprocess; the actual reason — booting jsdom + `@wordpress/*` in-process
  is slow regardless of subprocess vs. in-process — is unchanged, so the timeout value itself
  was left at `20000` as instructed). No test-suite-affecting change.

## 3. Test suite results

`npx vitest run`, after the rewrite:

```
 Test Files  4 passed (4)
      Tests  37 passed (37)
   Duration  55.28s (first run) / 57.26s (re-run after further edits)
```

All 37 existing tests pass unmodified, including the exact scenarios called
out in the task: valid heading (clean), invalid heading missing a class
(`BLOCK_INVALID`), unbalanced delimiters (`STRUCTURAL_UNBALANCED_DELIMITER` +
`BLOCK_RUNNER_SKIPPED`), and PHP interpolation (`PHP_INTERPOLATION_UNCHECKED`).
The `--fix` pipeline tests (which exercise `canonicalize()`/`fixMarkup()`
end-to-end via a temp file, never mutating the checked-in fixture) also pass,
confirming the `report.output` field mapping is correct in practice, not just
in the standalone probe script.

No test files were modified. No fixtures were modified.

## 4. Performance findings

The original motivation (README "Known issues") measured the old
subprocess-spawning adapter at ~10.2-10.5s per invocation, steady-state.
Three fresh, separate `node bin/wp-block-guard.js tests/fixtures/wp-block-guard/valid-heading.html --json`
invocations (new process each time, no warm cache reuse) with the new
in-process adapter:

| Run | `real` | `user` | `sys` |
| --- | --- | --- | --- |
| 1 | 10.646s | 0.061s | 0.031s |
| 2 | 13.505s | 0.030s | 0.000s |
| 3 | 11.001s | 0.015s | 0.031s |

**The gap did not close — the new numbers (~10.6-13.5s) are in the same
ballpark as the ~10.2-10.5s baseline, arguably slightly worse.** This is not
surprising in retrospect and is not evidence the rewrite is wrong: `user`
time is consistently under 0.1s across all three runs, meaning almost none of
the wall-clock time is CPU work in the measured process — it is dominated by
something I/O-bound, almost certainly loading the `jsdom` +
`@wordpress/blocks`/`@wordpress/block-editor`/`@wordpress/block-library`
(and their own transitive trees, including React) module graph off disk on a
cold-per-process basis.

The old adapter's ~10.2-10.5s already excluded `npx`'s own ~12s resolution
overhead (that was the whole point of spawning `process.execPath` directly
instead) — so the old number was already "one process's worth of jsdom +
`@wordpress/*` module load," happening inside the spawned child. The new
adapter does exactly the same module load, just inside the parent process
instead of a child. Removing the subprocess boundary removes a `spawn()`
call and IPC-over-stdio, which is genuinely cheap (single-digit
milliseconds) relative to a multi-hundred-module dependency tree load from
disk — so there was never a large win available here. The bottleneck this
task's motivating "Known issues" entry actually describes is **the cost of
booting the jsdom/`@wordpress/*` stack from a cold process**, not the cost of
spawning a subprocess to do so — and a fresh `node`/`bun` process pays that
module-load cost on every invocation regardless of in-process vs.
subprocess. Fixing this for real would require either (a) a long-lived
server process the CLI talks to instead of a fresh process per invocation, or
(b) `bun build --compile`'s promised startup-time win from bytecode
compilation/embedding (see the community benchmark cited in the handoff,
Finding 5) — which is exactly what step 6 below was supposed to let us
measure, and could not, because the compiled binary does not run (§5).

No measurable improvement should be claimed from this rewrite on the
performance axis; its value is entirely the Bun-compile-compatibility goal
the handoff identified, not speed under plain Node.

## 5. Bun compile results

`bun --version` → `1.4.0`, available on this machine.

**`bun run bin/wp-block-guard.js validate tests/fixtures/wp-block-guard/valid-heading.html`
(uncompiled, plain Bun runtime) works correctly** — exit 0, `PASS` output
identical to the Node run. This confirms Open Question #1 from the handoff
("does `import { validate } from 'block-runner'` run correctly under Bun") in
the affirmative: the in-process rewrite, block-runner's internal jsdom
bootstrap ordering, and its React-under-Bun dependency stack all function
correctly under Bun's plain (non-compiled) runtime.

**`npm run compile` (`bun build --compile ./bin/wp-block-guard.js --outfile bin/wp-block-guard.exe`)
succeeds** — `[144-158ms] bundle 1202 modules`, `[384-409ms] compile
bin/wp-block-guard.exe`. Resulting binary size: **99,510,784 bytes (~94.9
MiB / ~99.5 MB)**.

**The compiled binary does not work — it fails to even start.** Every
invocation tried, including `--help` (which does no validation work at all),
fails identically:

```
error: Cannot find module '../data/patch.json' from 'B:\~BUN\root\wp-block-guard.exe'

Bun v1.4.0 (Windows x64)
```

This confirms it is a total boot failure, not a validate-path-specific
failure: `src/block-runner-adapter.js` imports `block-runner` (and therefore
`jsdom`) at module top level, so the failure happens before `argv` is even
parsed by `src/cli.js`.

**Root cause, traced:**

```
node_modules/css-tree/lib/data-patch.js:
  import { createRequire } from 'module';
  const require = createRequire(import.meta.url);
  const patch = require('../data/patch.json');
```

`css-tree` (`node_modules/css-tree`, version 3.2.1) is a transitive
dependency reached via `block-runner → jsdom → @asamuzakjp/dom-selector →
css-tree` (confirmed via `npm ls css-tree`; three separate jsdom-side
packages resolve to the same deduped `css-tree@3.2.1`). Under plain Node,
`require('../data/patch.json')` inside `data-patch.js` resolves fine — it is
a relative CJS require from within the package's own file, which bypasses the
package's `exports` map restriction (that restriction only applies to
requires/imports from *outside* the package). Under `bun build --compile`,
this same call fails, because the `require` being called is not the
bundler-visible global `require` — it is a fresh function returned by
`createRequire(import.meta.url)`. Bun's `--compile` bundler statically
analyzes literal `require('...')`/`import` calls to decide what to embed in
the binary's virtual filesystem; a call routed through a
runtime-constructed `require` function is exactly the kind of indirection
that static analysis cannot see through, so `patch.json` never gets embedded,
and the fallback runtime resolution then tries (and fails) to find a real
file at a path relative to `import.meta.url`, which inside the compiled
binary resolves against Bun's virtual `$bunfs`/`B:\~BUN\root\...` path space,
not a real disk location.

This is precisely the class of risk the handoff's Open Question #2 predicted
("bundling can surface issues... that don't appear under plain `bun run`" —
"jsdom in particular has historically shipped some data files") and is
distinct from, and additional to, Open Question #1 (which resolved cleanly).
**No workaround was attempted** — a real fix would require either a Bun
bundler plugin to handle this specific `createRequire`-indirected JSON
require pattern, or patching/pinning `css-tree`/`@asamuzakjp/dom-selector` to
avoid the pattern, both of which are beyond this task's scope and are a
judgment call for whoever picks this up next, not something to paper over
here.

**Smoke test against fixtures:** could not be meaningfully completed, because
the binary fails before reaching any validation code, on every fixture and
every flag combination tried (`validate`, `--help`). The one successful
"comparison" available is confirming the failure is `--compile`-specific:
`bun run bin/wp-block-guard.js` (uncompiled) succeeds against
`valid-heading.html`; the compiled `.exe` fails identically whether pointed
at `valid-heading.html` or `invalid-heading-missing-class.html`, in ~0.36s
(fast failure, consistent with an import-time crash rather than any actual
validation work being attempted).

The compiled `.exe` was deleted from the worktree after each test run and is
not part of the commit; `bin/*.exe` is gitignored.

## 6. Blockers / surprises / judgment calls

- **Real blocker, not papered over:** `bun build --compile` does not produce
  a working binary for this project today, due to `css-tree`'s
  `createRequire(import.meta.url)` + relative JSON require pattern, three
  levels down block-runner's dependency tree (`block-runner → jsdom →
  @asamuzakjp/dom-selector → css-tree`). This directly matches the handoff's
  own framing of Open Question #2 as the one thing that "must be empirically
  verified before committing to this path" — it turned out not to work, and
  that is the headline finding of this implementation pass. The in-process
  library rewrite itself (the part actually asked for in steps 1-3) is
  correct and proven under both Node and plain Bun; the compile step is
  where the remaining gap lives.
- **Judgment call — `exitCode`/`stderr` synthesis:** `validateMarkup()`'s
  return shape has no real process exit code to report once there's no
  subprocess. `exitCode: report.ok ? 0 : 1` (matching block-runner's own
  documented CLI exit-code convention for clean/findings-present) and
  `stderr: ''` were chosen since nothing outside the adapter reads either
  field — confirmed by grepping all of `src/` and `tests/` for `exitCode`
  and `stderr` usage before making this call.
- **Judgment call — outfile path:** the `compile` script was initially
  written per the handoff's literal text (`--outfile wp-block-guard.exe`,
  repo root). This was corrected mid-task to `--outfile bin/wp-block-guard.exe`
  per an explicit scope correction from the requester, and `.gitignore` /
  smoke tests were re-run against the corrected path — the numbers and paths
  in this report reflect the corrected location throughout.
- **Performance:** see §4 — flagged proactively since it was the originally
  stated motivation for the whole investigation and the improvement did not
  materialize the way a "removed a subprocess spawn" framing might suggest.

## 7. Files changed

- `src/block-runner-adapter.js` — full rewrite (subprocess spawn → in-process library calls).
- `package.json` — added `compile` script.
- `.gitignore` — added `bin/*.exe`.
- `README.md` — Layer 2 section rewrite, new "Compiling a standalone executable (Bun)" section,
  two stale-reference fixes (Architecture file-tree line, `--fix` options-table row).
- `vitest.config.js` — comment-only update (timeout value unchanged).
- `handoff/2026-09-03-bun-compile-implementation-report.md` — this report (new file).

No changes to `TESTS.md`, `archive/`, `tests/fixtures/mastermind-ls/`, or `tests/fixtures/derived/`.

## 8. Commits

See this worktree's git log for the commit(s) made alongside this report.
