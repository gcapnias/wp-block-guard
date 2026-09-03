import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateFile } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures', 'wp-block-guard');
const fx = (name) => path.join(FIXTURES, name);

describe('validateFile — clean cases', () => {
  it('validates a clean core/heading block with no findings', async () => {
    const result = await validateFile(fx('valid-heading.html'));
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.summary).toEqual({ errors: 0, warnings: 0 });
  });
});

describe('validateFile — block-runner save()-diff', () => {
  it('flags a heading missing wp-block-heading class as BLOCK_INVALID', async () => {
    const result = await validateFile(fx('invalid-heading-missing-class.html'));
    expect(result.ok).toBe(false);
    expect(result.summary).toEqual({ errors: 1, warnings: 0 });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      code: 'BLOCK_INVALID',
      severity: 'error',
      blockName: 'core/heading',
    });
    expect(result.findings[0].fix).toBeTruthy();
  });
});

describe('validateFile — structural pre-check', () => {
  it('flags an unbalanced delimiter and skips block-runner', async () => {
    const result = await validateFile(fx('unbalanced-delimiter.html'));
    expect(result.ok).toBe(false);
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain('STRUCTURAL_UNBALANCED_DELIMITER');
    expect(codes).toContain('BLOCK_RUNNER_SKIPPED');
    expect(codes).not.toContain('BLOCK_INVALID');
  });

  it('flags out-of-order closing comments as STRUCTURAL_MISMATCHED_CLOSER', async () => {
    const result = await validateFile(fx('mismatched-closer.html'));
    expect(result.ok).toBe(false);
    const codes = result.findings.map((f) => f.code);
    expect(codes.filter((c) => c === 'STRUCTURAL_MISMATCHED_CLOSER')).toHaveLength(2);
    expect(codes).toContain('BLOCK_RUNNER_SKIPPED');
  });

  it('flags out-of-order closers 3+ levels deep (wp:group > wp:columns > wp:column)', async () => {
    // Gap-closing test for TESTS.md "Known gaps": the existing
    // mismatched-closer.html fixture only covers a 2-level "swap two
    // closers" shape. This one nests group > columns > column and closes
    // columns before column (innermost), then column against the wrong
    // reopened frame — two independent mismatches, deeper nesting.
    const result = await validateFile(fx('deeply-nested-mismatched-closer.html'));
    expect(result.ok).toBe(false);
    const codes = result.findings.map((f) => f.code);
    expect(codes.filter((c) => c === 'STRUCTURAL_MISMATCHED_CLOSER')).toHaveLength(2);
    expect(codes).toContain('BLOCK_RUNNER_SKIPPED');
    expect(codes).not.toContain('BLOCK_INVALID');

    const mismatches = result.findings.filter((f) => f.code === 'STRUCTURAL_MISMATCHED_CLOSER');
    expect(mismatches.map((f) => f.blockName)).toEqual(['core/columns', 'core/column']);
  });

  it('flags malformed attribute JSON as STRUCTURAL_INVALID_ATTRS_JSON', async () => {
    const result = await validateFile(fx('invalid-attrs-json.html'));
    expect(result.ok).toBe(false);
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain('STRUCTURAL_INVALID_ATTRS_JSON');
    expect(codes).toContain('BLOCK_RUNNER_SKIPPED');
  });

  it('flags content with zero delimiters as STRUCTURAL_NO_BLOCKS (warning, still ok)', async () => {
    const result = await validateFile(fx('no-blocks.html'));
    expect(result.findings).toEqual([
      expect.objectContaining({ code: 'STRUCTURAL_NO_BLOCKS', severity: 'warning' }),
    ]);
    expect(result.summary).toEqual({ errors: 0, warnings: 1 });
    expect(result.ok).toBe(true);
  });
});

describe('validateFile — PHP fragments', () => {
  it('strips a leading <?php header and validates the rest cleanly', async () => {
    const result = await validateFile(fx('pattern-with-header.php'));
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ code: 'PHP_HEADER_STRIPPED', severity: 'info' });
  });

  it('flags embedded PHP interpolation once (not once per token) and still validates the masked remainder', async () => {
    const result = await validateFile(fx('pattern-with-interpolation.php'));
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain('PHP_HEADER_STRIPPED');
    // Regression test for README "Known issues" #2: one embedded PHP tag
    // used to produce two identical PHP_INTERPOLATION_UNCHECKED findings
    // (the opening and closing tokens counted as separate occurrences).
    expect(codes.filter((c) => c === 'PHP_INTERPOLATION_UNCHECKED')).toHaveLength(1);
    // No structural or block-runner errors should leak through from the masked region.
    expect(codes).not.toContain('STRUCTURAL_UNBALANCED_DELIMITER');
    expect(codes).not.toContain('BLOCK_INVALID');
    expect(result.summary.errors).toBe(0);
    expect(result.ok).toBe(true);
  });
});

describe('validateFile — --fix', () => {
  const tmpFiles = [];

  afterAll(async () => {
    await Promise.all(tmpFiles.map((f) => fs.rm(f, { force: true })));
  });

  it('fixes a near-miss block in place without mutating the checked-in fixture', async () => {
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-fix-test-${Date.now()}.html`);
    tmpFiles.push(tmpFile);
    const original = await fs.readFile(fx('invalid-heading-missing-class.html'), 'utf8');
    await fs.writeFile(tmpFile, original, 'utf8');

    const result = await validateFile(tmpFile, { fix: true });
    expect(result.fixApplied).toBe(true);
    expect(result.fixSkippedReason).toBeNull();

    // Regression test for README "Known issues" #1: the pipeline used to
    // return the stale pre-fix findings/ok:false/exit-1-worthy result even
    // though the file on disk was already correctly fixed. The SAME result
    // object returned by the fixing call must reflect the fixed content.
    expect(result.ok).toBe(true);
    expect(result.findings.some((f) => f.code === 'BLOCK_INVALID')).toBe(false);
    expect(result.summary).toEqual({ errors: 0, warnings: 0 });

    const fixedContent = await fs.readFile(tmpFile, 'utf8');
    expect(fixedContent).toContain('wp-block-heading');

    // The checked-in fixture itself must be untouched.
    const stillOriginal = await fs.readFile(fx('invalid-heading-missing-class.html'), 'utf8');
    expect(stillOriginal).toBe(original);

    const revalidated = await validateFile(tmpFile);
    expect(revalidated.ok).toBe(true);
    expect(revalidated.findings).toEqual([]);
  }, 45000); // 3 block-runner spawns happen in this test (~10s each steady-state, see README "Known issues" #4)

  it('fixes a file with multiple BLOCK_INVALID findings, correcting all of them', async () => {
    // Regression/gap-closing test for TESTS.md "Known gaps": --fix was
    // previously only tested against a single-finding fixture. This fixture
    // has two separate wp:heading blocks, each missing wp-block-heading.
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-fix-multi-test-${Date.now()}.html`);
    tmpFiles.push(tmpFile);
    const original = await fs.readFile(fx('two-invalid-headings.html'), 'utf8');
    await fs.writeFile(tmpFile, original, 'utf8');

    const result = await validateFile(tmpFile, { fix: true });
    expect(result.fixApplied).toBe(true);
    expect(result.fixSkippedReason).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.summary).toEqual({ errors: 0, warnings: 0 });

    const fixedContent = await fs.readFile(tmpFile, 'utf8');
    expect(fixedContent.match(/wp-block-heading/g)).toHaveLength(2);

    // The checked-in fixture itself must be untouched.
    const stillOriginal = await fs.readFile(fx('two-invalid-headings.html'), 'utf8');
    expect(stillOriginal).toBe(original);

    const revalidated = await validateFile(tmpFile);
    expect(revalidated.ok).toBe(true);
    expect(revalidated.findings).toEqual([]);
  }, 45000); // 3 block-runner spawns happen in this test (~10s each steady-state, see README "Known issues" #4)

  it('skips fixing files with blocking structural errors', async () => {
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-fix-skip-${Date.now()}.html`);
    tmpFiles.push(tmpFile);
    const original = await fs.readFile(fx('unbalanced-delimiter.html'), 'utf8');
    await fs.writeFile(tmpFile, original, 'utf8');

    const result = await validateFile(tmpFile, { fix: true });
    expect(result.fixApplied).toBe(false);
    expect(result.fixSkippedReason).toMatch(/structural/i);

    const unchanged = await fs.readFile(tmpFile, 'utf8');
    expect(unchanged).toBe(original);
  });
});

describe('block-runner stderr containment', () => {
  const tmpFiles = [];
  afterAll(async () => {
    for (const f of tmpFiles) await fs.rm(f, { force: true }).catch(() => {});
  });

  // Regression test for the in-process adapter: block-runner's canonicalize()
  // writes ~14KB of jsdom/React block-definition dump per invalid block. The
  // old subprocess pipe discarded that; calling it in-process puts it on our
  // own stderr unless captureStderr() intercepts it.
  //
  // Deliberately spawned as a child process. Asserting on the adapter's return
  // value would only prove the plumbing: the leak lands on the real stderr
  // stream, which vitest's own reporter owns, so it cannot be observed from
  // inside the test process.
  // The fixture must be a block canonicalize CANNOT repair: a repairable
  // near-miss produces no dump, so the test would pass whether or not the
  // capture works. Measured on this fixture: 14393 bytes without it, 0 with.
  it('does not leak block-runner output to stderr on a --fix run', async () => {
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-stderr-${Date.now()}.html`);
    tmpFiles.push(tmpFile);
    await fs.writeFile(tmpFile, await fs.readFile(fx('unfixable-extra-attribute.html'), 'utf8'), 'utf8');

    const cli = path.join(__dirname, '..', 'bin', 'wp-block-guard.js');
    const { stderr } = await new Promise((resolve) => {
      const child = spawn(process.execPath, [cli, tmpFile, '--fix', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('close', () => resolve({ stdout: out, stderr: err }));
    });

    expect(stderr).toBe('');
  }, 45000);
});
