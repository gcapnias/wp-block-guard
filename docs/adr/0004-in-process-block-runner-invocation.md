# Layer 2 calls block-runner in-process, not as a subprocess

Layer 2 imports block-runner's library API (`validate`, `canonicalize`) and calls it inside
our own process, rather than spawning its CLI. The reason is not per-file speed — a
single-file run is no faster — but that booting jsdom and the `@wordpress/*` tree costs
~10s and `src/cli.js` validates files in a loop. As a subprocess that boot repeated for
every file: one file took 11.3s, two took 20.6s, a 68-file theme took roughly ten minutes.
In-process the boot happens once and each file after the first costs 11-36ms.

Recording it because the alternative looks strictly safer and a reader may well try to
restore it.

## What the subprocess gave us, and what it now costs

A child process provided two things for free that we now handle by hand:

- **Output isolation.** block-runner writes to stderr directly: `canonicalize()` emits
  ~14KB of jsdom/React block-definition dump for every block it cannot repair
  (`validate()` emits nothing). The subprocess pipe swallowed all of it. In-process it
  lands on our own stderr, so `captureStderr()` in `src/block-runner-adapter.js` patches
  `process.stderr.write` around each call — dropped on success, preserved on a thrown
  error, where it is usually the only explanation of the failure.
- **Crash isolation.** A block-runner segfault or unhandled rejection used to be a
  non-zero exit code we could report. Now it can take our process down with it.

`captureStderr()` patching a global is only sound because `src/pipeline.js` awaits one file
at a time, so exactly one block-runner call is ever in flight. **If file processing is ever
made concurrent, that patch breaks and must be replaced first** — concurrent calls would
interleave into one buffer and restore the stream out from under each other.

The subprocess also carried a real correctness advantage we did *not* lose: its output and
the library's were compared byte-for-byte on the same input and are identical, trailing
newline included.

## Considered and rejected

**Keep spawning, accept the per-file cost.** Rejected: the tool's stated use is a
pre-publish gate over a theme, and ten minutes for 68 files makes that unusable.

**Spawn once and keep a long-lived worker the CLI talks to.** This is the only approach
that also removes the remaining ~10s fixed boot, and it keeps process isolation. Rejected
for now as a much larger change — it needs a protocol, lifecycle management, and a
staleness story. It remains the right answer to the fixed cost, which is still an open
issue in `README.md`.

## Consequence, and one thing this unblocked

The in-process shape is what makes repeated block-runner calls cheap, which invalidated the
cost argument recorded against per-block correction — see
`docs/adr/0003-no-corrected-markup-in-findings.md`.

Note also that this change was originally written to make `bun build --compile` viable,
because a spawned process cannot read a binary's embedded virtual filesystem. That goal is
blocked upstream and unmet. The adapter shape is justified entirely by the reason above,
not by the one that motivated writing it.
