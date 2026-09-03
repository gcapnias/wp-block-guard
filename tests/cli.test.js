import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'wp-block-guard.js');
const FIXTURES = path.join(__dirname, 'fixtures', 'wp-block-guard');
// fast-glob requires forward-slash patterns even on Windows; path.join would
// emit backslashes there and silently fail to match any file.
const fx = (name) => path.join(FIXTURES, name).split(path.sep).join('/');

function run(args) {
  const result = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('CLI wiring', () => {
  it('exits 0 and emits a clean JSON report for a valid file', () => {
    const { status, stdout } = run([fx('valid-heading.html'), '--json']);
    expect(status).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(true);
    expect(report.summary).toEqual({ files: 1, errors: 0, warnings: 0, fixed: 0 });
    expect(report.files).toHaveLength(1);
    expect(report.files[0].findings).toEqual([]);
  });

  it('exits 1 and reports a BLOCK_INVALID finding for a broken file', () => {
    const { status, stdout } = run([fx('invalid-heading-missing-class.html'), '--json']);
    expect(status).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(false);
    expect(report.files[0].findings[0]).toMatchObject({ code: 'BLOCK_INVALID', blockName: 'core/heading' });
  });

  it('--strict turns a warning-only file into a failing exit code', () => {
    const plain = run([fx('no-blocks.html'), '--json']);
    expect(plain.status).toBe(0);

    const strict = run([fx('no-blocks.html'), '--strict', '--json']);
    expect(strict.status).toBe(1);
    const report = JSON.parse(strict.stdout);
    expect(report.ok).toBe(true); // still no errors
    expect(report.summary.warnings).toBe(1);
  }, 30000); // 2 block-runner-backed CLI invocations (~10s each steady-state, see README "Known issues" #4)

  it('--strict human output does not print PASS for a file whose warnings caused exit 1', () => {
    // Regression test for README "Known issues" #3: formatHuman used to check
    // only the error-only `file.ok` flag, so a warning-only file still showed
    // "PASS" even though --strict flipped the process exit code to 1.
    const { status, stdout } = run([fx('no-blocks.html'), '--strict']);
    expect(status).toBe(1);
    expect(stdout).not.toMatch(/PASS/);
    expect(stdout).toMatch(/FAIL/);
  });

  it('exits 2 with no arguments (usage error) and prints help to stderr', () => {
    const { status, stderr } = run([]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/wp-block-guard/i);
  });

  it('exits 2 when no files match the given pattern', () => {
    const { status, stdout } = run([fx('does-not-exist-*.html'), '--json']);
    expect(status).toBe(2);
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(false);
  });

  it('--version prints the package version and exits 0', () => {
    const { status, stdout } = run(['--version']);
    expect(status).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('multi-file JSON output is in alphabetical path order regardless of argument order', () => {
    // Regression/confirmation test for README "Known issues": file paths are
    // sorted alphabetically in src/cli.js (`files.filter(...).sort()`) before
    // processing, so files[] order is deterministic — just not argument
    // order. These three fixtures all trip a blocking structural error, so
    // Layer 2 (block-runner) is skipped and the run stays fast.
    const alphabetical = ['invalid-attrs-json.html', 'mismatched-closer.html', 'unbalanced-delimiter.html'];
    const { status, stdout } = run([...alphabetical].reverse().map(fx).concat('--json'));
    expect(status).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.files.map((f) => path.basename(f.file))).toEqual(alphabetical);
  });
});
