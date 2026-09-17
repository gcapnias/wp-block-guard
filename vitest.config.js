import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest's own default, kept deliberately. block-runner's boot is real but
    // is paid by a handful of identifiable places, not by the suite at large:
    // pipeline.test.js pays it once in a warm-up hook, and cli.test.js pays it
    // per spawned child. Those carry their own scoped budgets. A global raise
    // here would hide them, which is how the previous 25000 came to cover
    // tests costing 30ms. Timings: tests/README.md.
    testTimeout: 5000,

    // Run test files one at a time. block-runner boots jsdom + the
    // @wordpress/* tree at its first validate() call, costing ~8-14s per OS
    // process (docs/adr/0004-in-process-block-runner-invocation.md). Under
    // file parallelism every worker that pays that boot starts inside the same
    // opening window and they starve each other, so the same test took 8s on
    // one run and blew its budget on the next — four false-red suites were
    // traced to exactly this (wpbg-f06).
    //
    // Serialising costs nothing measurable. Measured 2026-09-16 on a 12-core
    // machine: full suite 125.1s/128.5s parallel vs 127.3s serial, and the
    // four files touching neither block-runner nor a subprocess are themselves
    // *faster* serially (2.7s) than in parallel (4.3s), because worker startup
    // dwarfs their ~15ms of actual test time. No throughput is being traded
    // away, only variance removed.
    //
    // This also keeps the suite on the safe side of ADR 0004: the adapter's
    // captureStderr() patches a global and is only sound while exactly one
    // block-runner call is in flight.
    fileParallelism: false,

    // .claude/worktrees/* are full nested checkouts (each with their own
    // tests/*.test.js) used for isolated agent work. .scratch/ and
    // .firecrawl/ are the other two gitignored agent workspaces CLAUDE.md
    // invites free writes to (ad-hoc operations, and firecrawl agent output,
    // respectively). Vitest's defaults don't exclude any of the three, so
    // without this a stray test-shaped file dropped into one — e.g. a probe
    // an agent forgot to clean up — gets discovered and run alongside this
    // checkout's own tests.
    exclude: [
      ...configDefaults.exclude,
      '.claude/worktrees/**',
      '.scratch/**',
      '.firecrawl/**',
    ],
  },
});
