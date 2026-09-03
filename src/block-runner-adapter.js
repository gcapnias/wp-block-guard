// Layer 2 — invoke the installed block-runner package directly.
//
// archive/2026-09-03-wp-gutenberg-validator-cli-design.md §3 ("Layer 2") found
// that `npx block-runner ...` costs ~12s per call, almost entirely npx's own
// resolution overhead, not block-runner's work. This adapter resolves the
// package's own bin script via its package.json ("bin" field is not part of
// its public "exports" map, so a deep import is not permitted — resolving
// "block-runner/package.json", which *is* exported, and joining its directory
// with the declared bin path is the robust, cross-platform way to find it)
// and spawns it with `process.execPath` directly, skipping npm/npx entirely.
//
// `validate` uses stdin ("-") with --json, which was empirically confirmed to
// work cleanly. `fix` is done via temp files with --out, mirroring the exact
// invocation shape that was empirically tested (stdin+stdout was not verified
// for `fix`, since --json on `fix` returns a JSON report instead of markup —
// see the design doc's flags table — so temp files are the verified path).

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);

let cachedCliPath = null;

function resolveBlockRunnerCli() {
  if (cachedCliPath) return cachedCliPath;
  const pkgJsonPath = require.resolve('block-runner/package.json');
  const pkg = require('block-runner/package.json');
  const binField = pkg.bin;
  const binRelative = typeof binField === 'string' ? binField : binField && binField['block-runner'];
  if (!binRelative) {
    throw new Error('Could not determine block-runner\'s bin entry from its package.json.');
  }
  cachedCliPath = path.join(path.dirname(pkgJsonPath), binRelative);
  return cachedCliPath;
}

function runCli(args, { input } = {}) {
  return new Promise((resolve) => {
    let cliPath;
    try {
      cliPath = resolveBlockRunnerCli();
    } catch (err) {
      resolve({ ok: false, exitCode: null, stdout: '', stderr: '', error: err.message });
      return;
    }
    const child = spawn(process.execPath, [cliPath, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      resolve({ ok: false, exitCode: null, stdout, stderr, error: `Failed to launch block-runner: ${err.message}` });
    });
    child.on('close', (exitCode) => {
      resolve({ ok: true, exitCode, stdout, stderr, error: null });
    });
    if (input != null) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

/**
 * Validate a markup string against headless Gutenberg via block-runner.
 * @param {string} markup
 * @returns {Promise<{ ok: boolean, exitCode: number|null, data: object|null, error: string|null, stderr: string }>}
 */
export async function validateMarkup(markup) {
  const result = await runCli(['validate', '-', '--json'], { input: markup });
  if (!result.ok) {
    return { ok: false, exitCode: result.exitCode, data: null, error: result.error, stderr: result.stderr };
  }
  // block-runner's documented exit codes: 0 clean, 1 findings present,
  // 2 usage/I-O error, 3 headless-Gutenberg boot failure. Only 0/1 carry a
  // JSON report on stdout.
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return {
      ok: false,
      exitCode: result.exitCode,
      data: null,
      error: `block-runner exited with code ${result.exitCode}${result.stderr ? `: ${result.stderr.trim()}` : ''}`,
      stderr: result.stderr,
    };
  }
  try {
    const data = JSON.parse(result.stdout);
    return { ok: true, exitCode: result.exitCode, data, error: null, stderr: result.stderr };
  } catch (err) {
    return {
      ok: false,
      exitCode: result.exitCode,
      data: null,
      error: `block-runner produced non-JSON output: ${err.message}`,
      stderr: result.stderr,
    };
  }
}

/**
 * Canonicalize near-miss markup via block-runner's `fix` command.
 * @param {string} markup
 * @returns {Promise<string|null>} the fixed markup, or null on failure
 */
export async function fixMarkup(markup) {
  const tmpDir = os.tmpdir();
  const token = crypto.randomBytes(6).toString('hex');
  const inPath = path.join(tmpDir, `wp-block-guard-${token}.in.html`);
  const outPath = path.join(tmpDir, `wp-block-guard-${token}.out.html`);
  try {
    await fs.writeFile(inPath, markup, 'utf8');
    const result = await runCli(['fix', inPath, '--out', outPath]);
    if (!result.ok || (result.exitCode !== 0 && result.exitCode !== 1)) {
      return null;
    }
    const fixed = await fs.readFile(outPath, 'utf8');
    return fixed;
  } catch {
    return null;
  } finally {
    await fs.rm(inPath, { force: true }).catch(() => {});
    await fs.rm(outPath, { force: true }).catch(() => {});
  }
}
