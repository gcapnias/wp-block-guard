import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateFile, conformToSource } from '../src/index.js';
import { makeFinding } from '../src/findings.js';

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

describe('validateFile — --fix line-ending fidelity (wpbg-8j7)', () => {
  const tmpFiles = [];

  afterAll(async () => {
    await Promise.all(tmpFiles.map((f) => fs.rm(f, { force: true })));
  });

  // Writes an input with an exact byte-level line-ending convention rather
  // than copying a fixture. core.autocrlf rewrites checked-in text files on
  // checkout and every fixture here is committed as LF, so a "CRLF fixture"
  // silently becomes an LF one on a fresh clone or in CI — see the same
  // pattern in the --suggest describe block above.
  const writeWithEol = async (name, eol, { trailingNewline }) => {
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-fix-eol-${name}-${Date.now()}.html`);
    tmpFiles.push(tmpFile);
    const lines = ['<!-- wp:heading -->', '<h2>Hello World</h2>', '<!-- /wp:heading -->'];
    await fs.writeFile(tmpFile, lines.join(eol) + (trailingNewline ? eol : ''), 'utf8');
    return tmpFile;
  };

  // The brief's acceptance criteria name all four combinations explicitly
  // ("LF-with-trailing-newline, LF-without, CRLF-with-trailing-newline,
  // CRLF-without"). Each test below asserts both axes together (EOL
  // convention and trailing-newline state), so a fix that gets one axis
  // right and the other wrong for a given combination cannot pass silently.

  it('preserves CRLF with a trailing newline', async () => {
    const tmpFile = await writeWithEol('crlf-nl', '\r\n', { trailingNewline: true });
    const result = await validateFile(tmpFile, { fix: true });
    expect(result.fixApplied).toBe(true);

    const written = await fs.readFile(tmpFile, 'utf8');
    expect(written).toMatch(/\r\n/);
    expect(written.match(/(?<!\r)\n/g)).toBeNull();
    expect(written).toMatch(/\r\n$/);
  }, 45000);

  it('preserves CRLF without a trailing newline', async () => {
    const tmpFile = await writeWithEol('crlf-nonl', '\r\n', { trailingNewline: false });
    const result = await validateFile(tmpFile, { fix: true });
    expect(result.fixApplied).toBe(true);

    const written = await fs.readFile(tmpFile, 'utf8');
    expect(written).toMatch(/\r\n/);
    expect(written.match(/(?<!\r)\n/g)).toBeNull();
    expect(written).not.toMatch(/\r?\n$/);
  }, 45000);

  it('preserves LF with a trailing newline', async () => {
    const tmpFile = await writeWithEol('lf-nl', '\n', { trailingNewline: true });
    const result = await validateFile(tmpFile, { fix: true });
    expect(result.fixApplied).toBe(true);

    const written = await fs.readFile(tmpFile, 'utf8');
    expect(written).not.toMatch(/\r/);
    expect(written).toMatch(/\n$/);
  }, 45000);

  it('preserves LF without a trailing newline', async () => {
    const tmpFile = await writeWithEol('lf-nonl', '\n', { trailingNewline: false });
    const result = await validateFile(tmpFile, { fix: true });
    expect(result.fixApplied).toBe(true);

    const written = await fs.readFile(tmpFile, 'utf8');
    expect(written).not.toMatch(/\r/);
    expect(written).not.toMatch(/\n$/);
  }, 45000);

  // The one shape where conforming and not conforming would actually diverge:
  // a --fix run that leaves a residual finding standing (block-runner cannot
  // resolve it) on a CRLF input, where the finding's resolved span crosses a
  // line boundary. A single-line span (e.g. unfixable-extra-attribute.html's)
  // contains no EOL at all, so it would pass identically whether `body` is
  // the conformed CRLF string or the unconformed LF `fixedBody` — a vacuous
  // test. This fixture nests a paragraph inside the offending group so the
  // resolved span for the group's BLOCK_INVALID runs across three lines,
  // making the CRLF/LF distinction actually load-bearing.
  //
  // Verified directly (not assumed): reverting the write path to reassign
  // `body = fixedBody` instead of the conformed string makes this test fail
  // (`search` comes back with LF, `written` has CRLF, no match) — so this is
  // not decoration.
  it('emits a byte-exact search for a residual, multi-line finding on a CRLF input after --fix', async () => {
    const markup = [
      '<!-- wp:group {"className":"word-cloud-bg","layout":{"type":"default"}} -->',
      '<div class="wp-block-group word-cloud-bg" aria-hidden="true"><!-- wp:paragraph -->',
      '<p>Hi</p>',
      '<!-- /wp:paragraph --></div>',
      '<!-- /wp:group -->',
      '',
    ].join('\n');
    const crlf = markup.replace(/\n/g, '\r\n');
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-fix-eol-residual-${Date.now()}.html`);
    tmpFiles.push(tmpFile);
    await fs.writeFile(tmpFile, crlf, 'utf8');

    const result = await validateFile(tmpFile, { fix: true });
    const residual = result.findings.filter((f) => f.code === 'BLOCK_INVALID');
    expect(residual.length).toBeGreaterThan(0);

    const written = await fs.readFile(tmpFile, 'utf8');
    expect(written).toMatch(/\r\n/);
    for (const finding of residual) {
      expect(finding.search).not.toBeNull();
      // A finding whose span crosses a line boundary must carry CRLF here,
      // or the CRLF/LF distinction wouldn't be exercised at all.
      expect(finding.search).toMatch(/\r\n/);
      expect(written).toContain(finding.search);
    }
  }, 45000);
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

  it('places search between message and fix, which is the agent-facing JSON shape', () => {
    // JSON.stringify preserves insertion order, so field order is part of the
    // contract an agent reads, not just cosmetics.
    expect(Object.keys(makeFinding('BLOCK_INVALID', { file: 'f.html', line: 2, detail: 'd' }))).toEqual([
      'code',
      'severity',
      'file',
      'line',
      'blockName',
      'message',
      'search',
      'fix',
    ]);
  });

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

describe('validateFile — --suggest', () => {
  const tmpFiles = [];

  afterAll(async () => {
    await Promise.all(tmpFiles.map((f) => fs.rm(f, { force: true })));
  });

  // Writes an input with an exact byte-level line-ending convention rather
  // than copying a fixture. core.autocrlf rewrites checked-in text files on
  // checkout and every fixture here is committed as LF, so a fixture's
  // on-disk endings are a property of the machine, not of the repo — a
  // "CRLF fixture" silently becomes an LF one on a fresh clone.
  const writeWithEol = async (name, eol, { trailingNewline }) => {
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-suggest-${name}-${Date.now()}.html`);
    tmpFiles.push(tmpFile);
    const lines = ['<!-- wp:heading -->', '<h2>Hello World</h2>', '<!-- /wp:heading -->'];
    await fs.writeFile(tmpFile, lines.join(eol) + (trailingNewline ? eol : ''), 'utf8');
    return tmpFile;
  };

  const copyToTmp = async (fixture, suffix = 'html') => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-suggest-${unique}.${suffix}`);
    tmpFiles.push(tmpFile);
    await fs.copyFile(fx(fixture), tmpFile);
    return tmpFile;
  };

  it('returns the fix and leaves the file byte-identical', async () => {
    const tmpFile = await copyToTmp('invalid-heading-missing-class.html');
    const before = await fs.readFile(tmpFile); // Buffer, deliberately not utf8

    const result = await validateFile(tmpFile, { suggest: true });

    // The criterion is the bytes, not the exit code: a suggestion path that
    // wrote the file would still report findings and still look "correct".
    expect(Buffer.compare(await fs.readFile(tmpFile), before)).toBe(0);
    expect(result.fixApplied).toBe(false);
    expect(result.suggestedOutput).toContain('wp-block-heading');
  });

  it('reports the same findings and ok as a plain run of the same file', async () => {
    const tmpFile = await copyToTmp('invalid-heading-missing-class.html');

    const plain = await validateFile(tmpFile);
    const suggested = await validateFile(tmpFile, { suggest: true });

    // Findings describe the file on disk, which --suggest has not touched.
    // Reporting the *candidate's* findings would return ok:true for a file
    // still broken on disk, and make the agent's confirming re-run pointless.
    expect(suggested.findings).toEqual(plain.findings);
    expect(suggested.ok).toBe(plain.ok);
    expect(suggested.ok).toBe(false);
    expect(suggested.summary).toEqual(plain.summary);
  }, 45000);

  it('yields no suggestion for a clean file, rather than a copy of the input', async () => {
    const result = await validateFile(fx('valid-heading.html'), { suggest: true });
    expect(result.ok).toBe(true);
    expect(result.suggestedOutput).toBeNull();
    expect(result.fixSkippedReason).toBeNull();
  });

  it('includes a stripped PHP header in the suggestion', async () => {
    // The one criterion no other test catches: the suggestion is
    // `header + body`, and returning the body alone passes everything else.
    const tmpFile = await copyToTmp('pattern-with-header-invalid-heading.php', 'php');
    const result = await validateFile(tmpFile, { suggest: true });

    expect(result.suggestedOutput).toMatch(/^<\?php/);
    expect(result.suggestedOutput).toContain('Title: Example With Near-Miss Heading');
    expect(result.suggestedOutput).toContain('wp-block-heading');
    // Whole file, exactly once — not a header re-attached twice.
    expect(result.suggestedOutput.split('<?php').length - 1).toBe(1);
  });

  it('still suggests, and still reports the finding, when the fix cannot resolve it', async () => {
    // Parity with --fix in the direction that matters: --fix *writes* this
    // file and leaves the finding standing, so withholding a suggestion here
    // would be stricter than --fix rather than equal to it. Verifying that
    // applying a suggestion clears a finding is wpbg-lsf's design, not this
    // bead's.
    const tmpFile = await copyToTmp('unfixable-extra-attribute.html');
    const result = await validateFile(tmpFile, { suggest: true });

    expect(result.suggestedOutput).not.toBeNull();
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'BLOCK_INVALID')).toBe(true);
    expect(result.fixSkippedReason).toBeNull();
  });

  it('skips suggesting for blocking structural errors, reusing the --fix reason text', async () => {
    const tmpFile = await copyToTmp('unbalanced-delimiter.html');

    const suggested = await validateFile(tmpFile, { suggest: true });
    const fixed = await validateFile(tmpFile, { fix: true });

    expect(suggested.suggestedOutput).toBeNull();
    expect(suggested.fixSkippedReason).toMatch(/structural/i);
    // Same gate, same words: the skip reasons are a shared contract, not
    // per-flag prose.
    expect(suggested.fixSkippedReason).toBe(fixed.fixSkippedReason);
  }, 45000);

  it('skips suggesting for embedded PHP, reusing the --fix reason text', async () => {
    const tmpFile = await copyToTmp('pattern-with-interpolation.php', 'php');

    const suggested = await validateFile(tmpFile, { suggest: true });
    const fixed = await validateFile(tmpFile, { fix: true });

    expect(suggested.suggestedOutput).toBeNull();
    expect(suggested.fixSkippedReason).toMatch(/embedded PHP/i);
    expect(suggested.fixSkippedReason).toBe(fixed.fixSkippedReason);
  }, 45000);

  it('preserves a CRLF input’s line endings in the suggestion', async () => {
    const tmpFile = await writeWithEol('crlf', '\r\n', { trailingNewline: true });
    const result = await validateFile(tmpFile, { suggest: true });

    expect(result.suggestedOutput).not.toBeNull();
    // Canonicalization returns LF throughout regardless of the input, so
    // without re-conforming, an agent applying this would author a
    // whole-file line-ending change it never intended.
    expect(result.suggestedOutput).toMatch(/\r\n/);
    expect(result.suggestedOutput.match(/(?<!\r)\n/g)).toBeNull();
  });

  it('preserves an LF input’s line endings in the suggestion', async () => {
    const tmpFile = await writeWithEol('lf', '\n', { trailingNewline: true });
    const result = await validateFile(tmpFile, { suggest: true });

    expect(result.suggestedOutput).not.toBeNull();
    expect(result.suggestedOutput).not.toMatch(/\r/);
  });

  it('preserves a trailing newline the input had', async () => {
    const tmpFile = await writeWithEol('endnl', '\n', { trailingNewline: true });
    const result = await validateFile(tmpFile, { suggest: true });
    expect(result.suggestedOutput).toMatch(/\n$/);
  });

  it('does not add a trailing newline the input lacked', async () => {
    const tmpFile = await writeWithEol('nonl', '\n', { trailingNewline: false });
    const result = await validateFile(tmpFile, { suggest: true });
    expect(result.suggestedOutput).not.toBeNull();
    expect(result.suggestedOutput).not.toMatch(/\n$/);
  });
});

describe('conformToSource', () => {
  it('leaves a suggestion already matching its source untouched', () => {
    expect(conformToSource('a\nb\n', 'x\ny\n')).toBe('a\nb\n');
  });

  it('converts to CRLF when the source is predominantly CRLF', () => {
    expect(conformToSource('a\nb', 'x\r\ny\r\nz')).toBe('a\r\nb');
  });

  it('does not double up on a suggestion that is already CRLF', () => {
    expect(conformToSource('a\r\nb', 'x\r\ny')).toBe('a\r\nb');
  });

  it('strips a trailing newline the source did not have', () => {
    expect(conformToSource('a\nb\n', 'x\ny')).toBe('a\nb');
  });

  it('uses the source convention for a trailing newline it adds', () => {
    expect(conformToSource('a\r\nb', 'x\r\ny\r\n')).toBe('a\r\nb\r\n');
  });
});
