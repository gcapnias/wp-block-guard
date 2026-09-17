// Diagnostic instrumentation for block-runner's two start-up costs.
//
// This exists because the suite's boot timeout budgets were previously set
// from a worst *observed* case recorded by an ad-hoc probe, which left them
// unreproducible: the numbers in tests/README.md could not be re-derived
// without redoing the probe by hand, and two of them contradicted each other
// (wpbg-3z1). Shipping the instrument rather than deleting it means the
// distribution behind those budgets can be re-measured on demand, on any
// machine, with one command.
//
// Off unless WPBG_TIMING_LOG names a file. That gate matters more than it
// looks: this module is imported by the block-runner adapter, which is on the
// path of every real validation, so the no-op case is the one that runs in
// production and it must touch nothing.
//
// Records go to a JSONL file, one line per append, because both this process
// and every CLI child spawned by tests/cli.test.js write to the same log.
// spawnSync passes no `env`, so children inherit WPBG_TIMING_LOG and land in
// the same file for free; `pid` is what separates the parent's in-process boot
// from a child's.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Append one timing record, or do nothing if instrumentation is off.
 *
 * Never throws: this observes a run, so it must not be able to fail one.
 *
 * @param {string} label what was measured (e.g. 'block-runner-import')
 * @param {number} ms measured duration in milliseconds
 */
export function recordTiming(label, ms) {
  const logPath = process.env.WPBG_TIMING_LOG;
  if (!logPath) return;
  try {
    const record = {
      ts: new Date().toISOString(),
      run: process.env.WPBG_TIMING_RUN ?? null,
      pid: process.pid,
      // Which *kind* of process this is — a vitest worker, or a spawned
      // wp-block-guard child. Both import block-runner, and without this they
      // are indistinguishable in the log: a worker's import-phase stall then
      // reads as a CLI child's, which is exactly the misreading that cost
      // wpbg-3z1 an afternoon. A worker's import is governed by no test
      // timeout at all, so the two belong to different analyses.
      proc: path.basename(process.argv[1] ?? ''),
      label,
      ms,
    };
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
  } catch {
    // A broken log path is a broken diagnostic, not a broken run.
  }
}

/**
 * Module-evaluation timestamp, used as the anchor for measuring how long the
 * `block-runner` import itself takes. See the ordering note in
 * src/block-runner-adapter.js.
 *
 * The measurement is only sound while src/block-runner-adapter.js is the sole
 * module in the *production* graph that imports this one: anything importing
 * it earlier moves this anchor and silently inflates the figure. Test files
 * may import it freely — they exercise recordTiming() directly and never reach
 * the adapter — but a new `src/` import is a real hazard.
 *
 * The figure is self-checking in practice: the anchor is right only if the
 * recorded import cost lands near block-runner's known ~1s module evaluation.
 * A near-zero reading means something imported this module first.
 */
export const TIMING_MODULE_LOADED_AT = Date.now();
