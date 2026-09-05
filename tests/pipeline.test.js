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
    expect(result.findings[0]).toMatchObject({
      code: 'PHP_HEADER_STRIPPED',
      severity: 'info',
      search: '<?php /* Title: Example */ ?>',
    });
  });

  it('flags embedded PHP interpolation once (not once per token) and still validates the masked remainder', async () => {
    const result = await validateFile(fx('pattern-with-interpolation.php'));
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain('PHP_HEADER_STRIPPED');
    // Regression test for README "Known issues" #2: one embedded PHP tag
    // used to produce two identical PHP_INTERPOLATION_UNCHECKED findings
    // (the opening and closing tokens counted as separate occurrences).
    expect(codes.filter((c) => c === 'PHP_INTERPOLATION_UNCHECKED')).toHaveLength(1);
    // search is the whole fragment, opener to closer — not just the "<?php" token.
    expect(result.findings.find((f) => f.code === 'PHP_INTERPOLATION_UNCHECKED').search).toBe(
      '<?php echo esc_html( $x ); ?>'
    );
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

describe('validateFile — BLOCK_INVALID positions (wpbg-djb)', () => {
  // block-runner's own source.htmlLine names a *different, valid* block whenever
  // one of the same name precedes the invalid one: it reports lines 3 and 9 for
  // this fixture, both of which are valid. Positions are re-derived instead —
  // see docs/adr/0005-finding-line-points-at-the-markup-at-fault.md.
  it('reports the invalid block, not an earlier valid block of the same name', async () => {
    const result = await validateFile(fx('valid-then-invalid-same-name.html'));
    const invalid = result.findings.filter((f) => f.code === 'BLOCK_INVALID');

    expect(invalid).toHaveLength(2);
    expect(invalid.map((f) => [f.blockName, f.line])).toEqual([
      ['core/heading', 7],
      ['core/paragraph', 13],
    ]);
  });

  it('points line at the markup at fault, not the delimiter comment', async () => {
    const result = await validateFile(fx('valid-then-invalid-same-name.html'));
    const raw = await fs.readFile(fx('valid-then-invalid-same-name.html'), 'utf8');
    const lines = raw.split('\n');

    for (const finding of result.findings.filter((f) => f.code === 'BLOCK_INVALID')) {
      const text = lines[finding.line - 1].trim();
      expect(text.startsWith('<!--')).toBe(false);
      expect(text.startsWith('<')).toBe(true);
    }
  });

  it('resolves every finding in a deeply nested real-world part', async () => {
    const file = path.join(__dirname, 'fixtures', 'mastermind-ls', 'parts', 'title.html');
    const result = await validateFile(file);
    const invalid = result.findings.filter((f) => f.code === 'BLOCK_INVALID');

    expect(invalid.map((f) => [f.blockName, f.line])).toEqual([
      ['core/group', 2],
      ['core/group', 7],
      ['core/paragraph', 9],
      ['core/paragraph', 17],
    ]);
  });
});

describe('validateFile — positions after --fix', () => {
  const tmpFiles = [];

  afterAll(async () => {
    await Promise.all(tmpFiles.map((f) => fs.rm(f, { force: true })));
  });

  // The post-fix re-validate resolves positions against canonicalize's output
  // rather than the original file, so this covers the second call site in
  // src/pipeline.js, not just the first.
  it('locates a residual finding against the rewritten file', async () => {
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-fix-residual-${Date.now()}.html`);
    tmpFiles.push(tmpFile);
    await fs.writeFile(tmpFile, await fs.readFile(fx('unfixable-extra-attribute.html'), 'utf8'), 'utf8');

    const result = await validateFile(tmpFile, { fix: true });
    const residual = result.findings.filter((f) => f.code === 'BLOCK_INVALID');
    expect(residual.length).toBeGreaterThan(0);

    const lines = (await fs.readFile(tmpFile, 'utf8')).split('\n');
    for (const finding of residual) {
      expect(finding.line).toBeGreaterThan(0);
      expect(finding.line).toBeLessThanOrEqual(lines.length);
      // the markup at fault, not the delimiter comment above it
      expect(lines[finding.line - 1].trim().startsWith('<!--')).toBe(false);
      expect(lines[finding.line - 1]).toContain('aria-hidden');
    }
  }, 45000);
});

describe('validateFile — search (wpbg-qlm)', () => {
  const tmpFiles = [];

  afterAll(async () => {
    await Promise.all(tmpFiles.map((f) => fs.rm(f, { force: true })));
  });

  // The contract is byte-exactness: whatever search says, a consumer must be
  // able to find it verbatim in the file it was reported against.
  const expectFindableIn = (raw, findings) => {
    for (const finding of findings) {
      if (finding.search === null) continue;
      expect(raw).toContain(finding.search);
    }
  };

  it('gives every finding a search key, populated or explicitly null', async () => {
    const result = await validateFile(fx('unbalanced-delimiter.html'));
    expect(result.findings.length).toBeGreaterThan(1);
    for (const finding of result.findings) {
      expect(finding).toHaveProperty('search');
    }
    // BLOCK_RUNNER_SKIPPED is about the file, not a span of it.
    expect(result.findings.find((f) => f.code === 'BLOCK_RUNNER_SKIPPED').search).toBeNull();
  });

  it('points a structural finding at the delimiter comment, which is the defect', async () => {
    const result = await validateFile(fx('invalid-attrs-json.html'));
    const finding = result.findings.find((f) => f.code === 'STRUCTURAL_INVALID_ATTRS_JSON');
    expect(finding.search).toBe('<!-- wp:heading {level:2} -->');
    expectFindableIn(await fs.readFile(fx('invalid-attrs-json.html'), 'utf8'), result.findings);
  });

  it('points an unbalanced-delimiter finding at the opener that is never closed', async () => {
    const file = fx('unbalanced-delimiter.html');
    const result = await validateFile(file);
    const finding = result.findings.find((f) => f.code === 'STRUCTURAL_UNBALANCED_DELIMITER');
    expect(finding.search.startsWith('<!-- wp:')).toBe(true);
    expectFindableIn(await fs.readFile(file, 'utf8'), result.findings);
  });

  it('points a BLOCK_INVALID finding at the element at fault, not its delimiter', async () => {
    const result = await validateFile(fx('invalid-heading-missing-class.html'));
    const finding = result.findings.find((f) => f.code === 'BLOCK_INVALID');
    // The delimiter carries the attributes save() is held to; editing it is the
    // wrong repair (docs/adr/0005-finding-line-points-at-the-markup-at-fault.md).
    expect(finding.search).toBe('<h2>Hello World</h2>');
  });

  it('picks the right occurrence when a valid block of the same name precedes it', async () => {
    const file = fx('valid-then-invalid-same-name.html');
    const result = await validateFile(file);
    const invalid = result.findings.filter((f) => f.code === 'BLOCK_INVALID');
    expect(invalid.map((f) => f.search)).toEqual([
      '<h2>Invalid heading second</h2>',
      '<p>Invalid paragraph second</p>',
    ]);
    expectFindableIn(await fs.readFile(file, 'utf8'), result.findings);
  });

  it('slices from the pre-mask body, so PHP inside a delimiter survives into search', async () => {
    // The only shape where slicing from the masked body differs from the
    // original: maskEmbeddedPhp blanks the interpolation to spaces, and the
    // structural layer tokenizes that masked text.
    const file = fx('interpolated-delimiter-attrs.php');
    const result = await validateFile(file);
    const finding = result.findings.find((f) => f.code === 'STRUCTURAL_INVALID_ATTRS_JSON');
    expect(finding.search).toBe('<!-- wp:heading {"level":<?php echo 2; ?>} -->');
    expect(finding.search).not.toMatch(/  /); // no blanked-out run where the PHP was
    expectFindableIn(await fs.readFile(file, 'utf8'), result.findings);
  });

  it('slices a post-fix finding from the rewritten file, not the original', async () => {
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-search-residual-${Date.now()}.html`);
    tmpFiles.push(tmpFile);
    await fs.writeFile(tmpFile, await fs.readFile(fx('unfixable-extra-attribute.html'), 'utf8'), 'utf8');

    const result = await validateFile(tmpFile, { fix: true });
    const residual = result.findings.filter((f) => f.code === 'BLOCK_INVALID');
    expect(residual.length).toBeGreaterThan(0);
    // --fix reflows the whole document, so text sliced out of the pre-fix
    // content would not be found in what is now on disk.
    expectFindableIn(await fs.readFile(tmpFile, 'utf8'), result.findings);
  }, 45000);
});
