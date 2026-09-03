// Layer 2 — invoke the installed block-runner package directly.
//
// archive/2026-09-03-wp-gutenberg-validator-cli-design.md §3 ("Layer 2") found
// that `npx block-runner ...` costs ~12s per call, almost entirely npx's own
// resolution overhead, not block-runner's work. An earlier version of this
// adapter avoided that by resolving block-runner's own CLI script (via its
// package.json's "bin" field) and spawning it as a child process directly.
//
// handoff/2026-09-03-bun-compile-wp-block-guard-handoff.md found that
// spawning a subprocess is *also* incompatible with `bun build --compile`:
// a compiled binary embeds its dependencies (including block-runner's CLI
// script) in a virtual filesystem that a spawned OS process cannot open.
// block-runner already ships a real in-process library API
// (`exports: { ".": "./dist/index.js" }`), so this adapter now imports and
// calls that directly — no subprocess, no npx, and no bunfs incompatibility.
//
// `validate(markup, options?)` and `canonicalize(markup, options?)` both
// return a `Promise<BlockRunnerReport>` (see node_modules/block-runner/dist/
// index.d.ts) with the same `{ ok, command, summary, items, output? }` shape
// the CLI's own `--json` output serializes. `items[].status/block/reason/
// source.htmlLine` match exactly what this file (and src/pipeline.js) already
// expected. The CLI's `fix` verb has no `fix()` library export; its in-process
// equivalent is `canonicalize()`, whose fixed markup is exposed on the
// report's `output` field (confirmed empirically — see the "canonicalize
// output field" note below).

import { validate, canonicalize } from 'block-runner';

/**
 * Run `fn` with block-runner's own stderr output captured rather than left to
 * land on this process's stderr.
 *
 * Calling block-runner in-process removed the subprocess pipe that used to
 * swallow this. It matters only for `canonicalize()`, which writes ~14KB of
 * jsdom/React block-definition dump per invalid block; `validate()` writes
 * nothing. Measured, not assumed — and every byte routes through
 * `process.stderr.write`, which is why patching it is sufficient.
 *
 * This patches a global, which is safe here only because `src/pipeline.js`
 * awaits one file at a time, so exactly one block-runner call is ever in
 * flight. Revisit if file processing ever becomes concurrent.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ ok: true, value: T, captured: string } | { ok: false, error: Error, captured: string }>}
 */
async function captureStderr(fn) {
  const chunks = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  try {
    return { ok: true, value: await fn(), captured: chunks.join('') };
  } catch (err) {
    return { ok: false, error: err, captured: chunks.join('') };
  } finally {
    process.stderr.write = realWrite;
  }
}

/**
 * Validate a markup string against headless Gutenberg via block-runner.
 * @param {string} markup
 * @returns {Promise<{ ok: boolean, exitCode: number|null, data: object|null, error: string|null, stderr: string }>}
 */
export async function validateMarkup(markup) {
  const run = await captureStderr(() => validate(markup));
  if (!run.ok) {
    // Captured output is returned on `stderr` rather than discarded: a thrown
    // validate is exactly the case where block-runner's own output is the only
    // explanation of what went wrong.
    return {
      ok: false,
      exitCode: null,
      data: null,
      error: `block-runner validation failed: ${run.error.message}`,
      stderr: run.captured,
    };
  }
  const report = run.value;
  // block-runner's CLI exit codes: 0 clean, 1 findings present. The
  // library call has no real process exit code, so synthesize the
  // equivalent from `report.ok` for anything that still inspects it.
  return { ok: true, exitCode: report.ok ? 0 : 1, data: report, error: null, stderr: '' };
}

/**
 * Canonicalize near-miss markup via block-runner's `canonicalize()` (the
 * library equivalent of the CLI's `fix` command).
 * @param {string} markup
 * @returns {Promise<string|null>} the fixed markup, or null on failure
 */
export async function fixMarkup(markup) {
  const run = await captureStderr(() => canonicalize(markup));
  if (!run.ok) {
    // This function's contract is `string | null`, so there is no field to
    // hand the captured output back on. Write it through to the real stderr
    // instead of dropping it — a thrown canonicalize is precisely when it
    // explains the failure.
    if (run.captured) process.stderr.write(run.captured);
    return null;
  }
  // Confirmed empirically (node .scratch probe against
  // tests/fixtures/wp-block-guard/invalid-heading-missing-class.html):
  // the fixed markup string is exposed on `report.output`, not
  // `report.markup`/`report.result`.
  const report = run.value;
  if (!report || typeof report.output !== 'string') return null;
  return report.output;
}
