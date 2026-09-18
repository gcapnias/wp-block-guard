import { describe, it, expect, afterAll, beforeAll } from 'vitest';
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

// Budgets, not costs. Both numbers below are 240s, and that equality is the
// point: they cover the same block-runner boot, so wpbg-3z1 raised the child
// budget to the hook's rather than lowering the hook to the child's. The old
// 120s-vs-45s split claimed one boot was worth 2.7x the other.
//
// Measured directly over 20 full-suite runs (wpbg-3z1, 2026-09-17, 12-core
// Windows machine; instrument is src/timing.js, tables in tests/README.md):
//   in-process boot  n=20   6.7-9.9s   (p50 7.7s)
//   child boot       n=240  6.6-87.6s  (p50 7.6s, p90 10.0s)
//
// The 87.6s is the number that sets these budgets, and it is worth knowing
// how it was obtained. Every stall on record before wpbg-3z1 was *censored*:
// a 45s budget killed the run, so all anyone could say was ">45s". Raising
// the budgets first, then measuring, caught one intact — a single child that
// paid 87.6s on an otherwise-green run whose wall clock was 246s against a
// 132s median. So 240s is ~2.7x the worst boot ever actually observed, rather
// than a multiple of a number that a timeout had truncated.
//
// Why the headroom is large, in order of weight:
//   1. The cost asymmetry is lopsided. A false red is expensive and has been
//      paid repeatedly — four suites traced to it in wpbg-f06, each needing
//      investigation before a merge could proceed. A hang caught at 240s
//      rather than 120s costs two extra minutes, once, on a failure that is
//      catastrophic and obvious either way.
//   2. A timeout here cannot make a known start-up cost faster. Its only
//      useful job is catching block-runner genuinely *hanging*, and a 240s
//      budget catches a hang just as surely as a 45s one. A tight number buys
//      a false red, not a faster signal.
//   3. For the hook specifically: a *hook* failure fails every test in the
//      file (~60 of them), not one. That amplification means this budget must
//      be conservative in a way a per-test budget need not be — an argument
//      that stands on its own, independent of any measurement. It carries
//      most of the weight for BOOT_BUDGET_MS, whose n=20 in-process samples
//      never exceeded 9.9s and so cannot justify 240s on their own.
const BOOT_BUDGET_MS = 240000; // in-process boot, paid by the warm-up hook
const SUBPROCESS_BOOT_BUDGET_MS = 240000; // boot inside a spawned CLI child

// Pay block-runner's boot here, in a hook, so that no individual test's budget
// absorbs it. block-runner loads jsdom + the @wordpress/* tree lazily, at its
// first validate() call rather than at import, so without this the cost lands
// inside whichever test happens to run first — which is what made the first
// case in this file blow a 25s budget under load (wpbg-f06).
//
// Doing it here rather than leaving it on the first test buys order
// independence, and that is not cosmetic: `vitest -t "<one case>"` runs a
// single case with no predecessor to have warmed anything, so every case in
// the file has to be able to pay the boot or none of them can be run alone.
// Inserting a new test above the old first one had the same effect.
//
// This is NOT a re-litigation of wpbg-f06 comment #37, which rejected a
// warm-up hook. That objection was that warming still executes inside the
// parallel run's contended opening window, so it does not fix *contention* —
// correct, and it is why vitest.config.js sets fileParallelism: false. The
// window is gone; this hook fixes *attribution*, which is a different problem.
// The two are complementary.
//
// valid-heading.html specifically: a fixture with a blocking structural error
// would skip Layer 2 entirely and warm nothing. Asserts nothing on purpose —
// it is infrastructure, not a test. Timings in tests/README.md.
beforeAll(async () => {
  await validateFile(fx('valid-heading.html'));
}, BOOT_BUDGET_MS);

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

describe('validateFile — PHP trailing section (wpbg-zxg)', () => {
  it('masks a trailing unclosed <?php to EOF and still validates the real markup above it', async () => {
    // Case A: today (pre-fix) a false STRUCTURAL_UNBALANCED_DELIMITER fires
    // on the "<!-- wp:paragraph -->" *string literal* inside the trailing
    // PHP, which cascades into BLOCK_RUNNER_SKIPPED and hides the genuinely
    // invalid core/heading above. Verified via CLI --json before writing
    // this assertion.
    const result = await validateFile(fx('trailing-php-after-markup.php'));
    const codes = result.findings.map((f) => f.code);

    expect(codes).toContain('PHP_TRAILING_SECTION');
    expect(codes).not.toContain('STRUCTURAL_UNBALANCED_DELIMITER');
    expect(codes).not.toContain('BLOCK_RUNNER_SKIPPED');

    const trailing = result.findings.find((f) => f.code === 'PHP_TRAILING_SECTION');
    expect(trailing.message).toBe(
      'File ends in an unclosed "<?php" section; everything from here to EOF is PHP and was not validated as markup.'
    );
    expect(trailing.search).toBe('<?php');
    expect(trailing.fix).toBe(
      'This is normal PHP. If block markup was meant to follow, close the section with "?>" first.'
    );

    const invalid = result.findings.find((f) => f.code === 'BLOCK_INVALID');
    expect(invalid).toBeDefined();
    expect(invalid.blockName).toBe('core/heading');
    expect(result.ok).toBe(false);
  });

  it('declines --fix/--suggest for a trailing PHP section, reusing the embedded-PHP skip reason (match stays null)', async () => {
    // Acceptance criterion: a future gate change must not silently start
    // "fixing" past a trailing PHP section without a deliberate decision to
    // do so (wpbg-lsf's suggest && !hasEmbeddedPhp gate covers this case
    // too, since the trailing section sets hasEmbeddedPhp).
    const suggested = await validateFile(fx('trailing-php-after-markup.php'), { suggest: true });
    expect(suggested.suggestedOutput).toBeNull();
    expect(suggested.fixSkippedReason).toMatch(/embedded PHP/i);

    const invalid = suggested.findings.find((f) => f.code === 'BLOCK_INVALID');
    expect(invalid).toBeDefined();
    expect(invalid.match).toBeNull();
  });

  it('passes clean, exit-0-shaped, for a file that is entirely PHP with no block markup', async () => {
    // Case B: the functions.php shape. Must not emit STRUCTURAL_NO_BLOCKS —
    // its "stored as unconverted Classic/HTML" message would be false for a
    // file containing no HTML at all; PHP_TRAILING_SECTION alone explains
    // the empty body.
    const result = await validateFile(fx('trailing-php-entire-file.php'));
    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({ errors: 0, warnings: 1 });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      code: 'PHP_TRAILING_SECTION',
      severity: 'warning',
      message: 'File is entirely PHP; no block markup to validate.',
    });
  });

  it('does not mistake a "?>" inside a PHP string literal for the real closer', async () => {
    // The exact case token-counting was rejected for: a naive opener/closer
    // count would treat the quoted "?>" as the real closer and go on to
    // (falsely) validate the "<!-- wp:heading -->" string as markup.
    const result = await validateFile(fx('trailing-php-quoted-closer.php'));
    expect(result.ok).toBe(true);
    const codes = result.findings.map((f) => f.code);
    expect(codes).toEqual(['PHP_TRAILING_SECTION']);
    expect(codes).not.toContain('PHP_HEADER_STRIPPED');
    expect(codes).not.toContain('STRUCTURAL_UNBALANCED_DELIMITER');
    expect(result.findings[0].message).toBe('File is entirely PHP; no block markup to validate.');
  });

  it('still reports STRUCTURAL_NO_BLOCKS for real blockless HTML that happens to precede a trailing PHP section', async () => {
    // Code-review regression: the suppression must be scoped to "the file is
    // entirely PHP", not "a trailing section exists anywhere in the file" —
    // otherwise a file with genuine, unconverted HTML ahead of an unrelated
    // trailing PHP section would have its real STRUCTURAL_NO_BLOCKS finding
    // silently swallowed too.
    const result = await validateFile(fx('trailing-php-after-no-blocks.php'));
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain('PHP_TRAILING_SECTION');
    expect(codes).toContain('STRUCTURAL_NO_BLOCKS');
    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({ errors: 0, warnings: 2 });
  });

  it('still reports an unclosed short-echo tag at EOF with no content after it (case C)', async () => {
    // Regression fixture for the one shape that must NOT start reporting
    // once this ticket's fix lands: an unclosed opener with nothing after
    // it. It already passed before this change (as PHP_INTERPOLATION_UNCHECKED);
    // the decided design (wpbg-zxg) reassigns it to PHP_TRAILING_SECTION
    // instead of a second code, but the outcome — clean pass, exit 0, no
    // structural error, no BLOCK_RUNNER_SKIPPED — is unchanged.
    const result = await validateFile(fx('trailing-short-echo-no-content.php'));
    expect(result.ok).toBe(true);
    const codes = result.findings.map((f) => f.code);
    expect(codes).toEqual(['PHP_TRAILING_SECTION']);
    expect(codes).not.toContain('STRUCTURAL_UNBALANCED_DELIMITER');
    expect(codes).not.toContain('BLOCK_RUNNER_SKIPPED');
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
  });

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
  });

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
  });

  it('preserves CRLF without a trailing newline', async () => {
    const tmpFile = await writeWithEol('crlf-nonl', '\r\n', { trailingNewline: false });
    const result = await validateFile(tmpFile, { fix: true });
    expect(result.fixApplied).toBe(true);

    const written = await fs.readFile(tmpFile, 'utf8');
    expect(written).toMatch(/\r\n/);
    expect(written.match(/(?<!\r)\n/g)).toBeNull();
    expect(written).not.toMatch(/\r?\n$/);
  });

  it('preserves LF with a trailing newline', async () => {
    const tmpFile = await writeWithEol('lf-nl', '\n', { trailingNewline: true });
    const result = await validateFile(tmpFile, { fix: true });
    expect(result.fixApplied).toBe(true);

    const written = await fs.readFile(tmpFile, 'utf8');
    expect(written).not.toMatch(/\r/);
    expect(written).toMatch(/\n$/);
  });

  it('preserves LF without a trailing newline', async () => {
    const tmpFile = await writeWithEol('lf-nonl', '\n', { trailingNewline: false });
    const result = await validateFile(tmpFile, { fix: true });
    expect(result.fixApplied).toBe(true);

    const written = await fs.readFile(tmpFile, 'utf8');
    expect(written).not.toMatch(/\r/);
    expect(written).not.toMatch(/\n$/);
  });

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
  //
  // The only case in this file that needs a raised budget: spawning the CLI
  // means a second OS process, which pays the 8.3-13.0s block-runner boot over
  // again rather than reusing the one this worker has
  // already paid for — the warm-up hook at the top of this file cannot reach
  // into a child process. It is therefore the one case here that still needs a
  // raised budget. See tests/README.md for the measurements behind the number.
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
  }, SUBPROCESS_BOOT_BUDGET_MS);
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
  });
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

  it('places search (then match) between message and fix, which is the agent-facing JSON shape', () => {
    // JSON.stringify preserves insertion order, so field order is part of the
    // contract an agent reads, not just cosmetics. match (wpbg-lsf) sits right
    // after search, before fix.
    expect(Object.keys(makeFinding('BLOCK_INVALID', { file: 'f.html', line: 2, detail: 'd' }))).toEqual([
      'code',
      'severity',
      'file',
      'line',
      'blockName',
      'message',
      'search',
      'match',
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
  });
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

  it('reports the same findings and ok as a plain run of the same file, aside from match', async () => {
    const tmpFile = await copyToTmp('invalid-heading-missing-class.html');

    const plain = await validateFile(tmpFile);
    const suggested = await validateFile(tmpFile, { suggest: true });

    // Findings describe the file on disk, which --suggest has not touched.
    // Reporting the *candidate's* findings would return ok:true for a file
    // still broken on disk, and make the agent's confirming re-run pointless.
    // match (wpbg-lsf) is the one deliberate exception: it is only ever
    // computed under --suggest (the whole point is that the cost is opt-in),
    // so it is null on the plain run and populated on the --suggest run for
    // this fixture's leaf BLOCK_INVALID finding.
    const stripMatch = (findings) => findings.map(({ match, ...rest }) => rest);
    expect(stripMatch(suggested.findings)).toEqual(stripMatch(plain.findings));
    expect(plain.findings.every((f) => f.match === null)).toBe(true);
    expect(suggested.findings.some((f) => f.code === 'BLOCK_INVALID' && f.match !== null)).toBe(true);
    expect(suggested.ok).toBe(plain.ok);
    expect(suggested.ok).toBe(false);
    expect(suggested.summary).toEqual(plain.summary);
  });

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
  });

  it('skips suggesting for embedded PHP, reusing the --fix reason text', async () => {
    const tmpFile = await copyToTmp('pattern-with-interpolation.php', 'php');

    const suggested = await validateFile(tmpFile, { suggest: true });
    const fixed = await validateFile(tmpFile, { fix: true });

    expect(suggested.suggestedOutput).toBeNull();
    expect(suggested.fixSkippedReason).toMatch(/embedded PHP/i);
    expect(suggested.fixSkippedReason).toBe(fixed.fixSkippedReason);
  });

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

describe('validateFile — --suggest match (wpbg-lsf)', () => {
  const tmpFiles = [];

  afterAll(async () => {
    await Promise.all(tmpFiles.map((f) => fs.rm(f, { force: true })));
  });

  const copyToTmp = async (fixture, suffix = 'html') => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-match-${unique}.${suffix}`);
    tmpFiles.push(tmpFile);
    await fs.copyFile(fx(fixture), tmpFile);
    return tmpFile;
  };

  // Constructs both line-ending inputs byte-by-byte at runtime rather than
  // relying on a checked-in fixture's on-disk endings — every fixture here is
  // committed as LF (core.autocrlf, no .gitattributes), so a fixture's
  // apparent CRLF-ness is a property of the checkout, not the repo. Mirrors
  // the pattern already used in the --suggest describe block above.
  // The heading's own inner content spans two lines (`Hello` / `World`) so
  // the resolved span itself crosses a line boundary — a single-line span
  // contains no EOL at all, and would pass this assertion regardless of
  // whether match's line endings were conformed (the same trap wpbg-8j7's
  // test 5 found for `search`).
  const writeWithEol = async (name, eol) => {
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-match-${name}-${Date.now()}.html`);
    tmpFiles.push(tmpFile);
    const lines = ['<!-- wp:heading {"level":2} -->', '<h2>Hello', 'World</h2>', '<!-- /wp:heading -->'];
    await fs.writeFile(tmpFile, lines.join(eol) + eol, 'utf8');
    return tmpFile;
  };

  it('is null for every finding on a plain (non-suggest) run', async () => {
    const result = await validateFile(fx('invalid-heading-missing-class.html'));
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(finding).toHaveProperty('match', null);
    }
  });

  it('leaves search unchanged from a plain run', async () => {
    const plain = await validateFile(fx('invalid-heading-missing-class.html'));
    const suggested = await validateFile(fx('invalid-heading-missing-class.html'), { suggest: true });
    expect(suggested.findings.map((f) => f.search)).toEqual(plain.findings.map((f) => f.search));
  });

  it('gives a verified correction: replacing search with match produces a file that validates clean', async () => {
    const tmpFile = await copyToTmp('invalid-heading-missing-class.html');
    const result = await validateFile(tmpFile, { suggest: true });

    const finding = result.findings.find((f) => f.code === 'BLOCK_INVALID');
    expect(finding.search).not.toBeNull();
    expect(finding.match).not.toBeNull();

    const raw = await fs.readFile(tmpFile, 'utf8');
    expect(raw).toContain(finding.search);
    const repaired = raw.replace(finding.search, finding.match);

    const repairedFile = path.join(os.tmpdir(), `wp-block-guard-match-repaired-${Date.now()}.html`);
    tmpFiles.push(repairedFile);
    await fs.writeFile(repairedFile, repaired, 'utf8');

    const revalidated = await validateFile(repairedFile);
    expect(revalidated.ok).toBe(true);
    expect(revalidated.findings).toEqual([]);
  });

  it('is null for a block with children, even though the parent is invalid', async () => {
    const result = await validateFile(fx('invalid-parent-valid-child.html'), { suggest: true });
    const finding = result.findings.find((f) => f.code === 'BLOCK_INVALID');
    expect(finding).toBeDefined();
    expect(finding.blockName).toBe('core/group');
    expect(finding.match).toBeNull();
  });

  it('is null when the correction does not resolve the finding', async () => {
    const result = await validateFile(fx('unfixable-extra-attribute.html'), { suggest: true });
    const finding = result.findings.find((f) => f.code === 'BLOCK_INVALID');
    expect(finding).toBeDefined();
    expect(finding.match).toBeNull();
  });

  it('is null for a leaf BLOCK_INVALID even when embedded PHP elsewhere blocks --suggest', async () => {
    // pattern-with-interpolation.php (used by the --suggest describe block
    // above for the *skip reason* itself) produces no BLOCK_INVALID finding
    // at all — both its findings are PHP_HEADER_STRIPPED and
    // PHP_INTERPOLATION_UNCHECKED, which get match: null unconditionally
    // because they aren't BLOCK_INVALID. Asserting match === null against
    // that fixture would pass whether or not the suggest && !hasEmbeddedPhp
    // gate in src/pipeline.js exists at all — the same vacuous-test trap
    // wpbg-8j7's report caught for one of its own line-ending tests. This
    // fixture instead combines a genuinely fixable leaf BLOCK_INVALID (a
    // heading missing its class) with embedded PHP interpolation elsewhere
    // in the body, confirmed by running it through the CLI first: it yields
    // BLOCK_INVALID at the heading, with fixSkippedReason naming embedded PHP.
    const tmpFile = path.join(os.tmpdir(), `wp-block-guard-match-embedded-php-${Date.now()}.php`);
    tmpFiles.push(tmpFile);
    const content = [
      '<?php /* Title: Example */ ?>',
      '<!-- wp:heading {"level":2} -->',
      '<h2>Hello World</h2>',
      '<!-- /wp:heading -->',
      '<!-- wp:paragraph -->',
      '<p><?php echo esc_html( $x ); ?></p>',
      '<!-- /wp:paragraph -->',
    ].join('\n');
    await fs.writeFile(tmpFile, content, 'utf8');

    const result = await validateFile(tmpFile, { suggest: true });
    expect(result.fixSkippedReason).toMatch(/embedded PHP/i);
    const invalid = result.findings.find((f) => f.code === 'BLOCK_INVALID');
    expect(invalid).toBeDefined();
    expect(invalid.blockName).toBe('core/heading');
    // The gate matters here: resolveMatch slices the leaf's blockMarkup from
    // the *unmasked* sourceContent, so without the suggest && !hasEmbeddedPhp
    // gate it would hand raw, unmasked content (including this file's own
    // untouched PHP tag elsewhere in the body) to canonicalize — the one
    // thing this feature exists to never do unverified.
    expect(invalid.match).toBeNull();
  });

  it('matches the CRLF input file’s line-ending convention', async () => {
    const tmpFile = await writeWithEol('crlf', '\r\n');
    const result = await validateFile(tmpFile, { suggest: true });
    const finding = result.findings.find((f) => f.code === 'BLOCK_INVALID');

    expect(finding.match).not.toBeNull();
    expect(finding.match).toMatch(/\r\n/);
    expect(finding.match.match(/(?<!\r)\n/g)).toBeNull();
    // No spurious trailing newline: match is a spliceable inner span, not a
    // whole line.
    expect(finding.match).not.toMatch(/\r?\n$/);
  });

  it('matches the LF input file’s line-ending convention', async () => {
    const tmpFile = await writeWithEol('lf', '\n');
    const result = await validateFile(tmpFile, { suggest: true });
    const finding = result.findings.find((f) => f.code === 'BLOCK_INVALID');

    expect(finding.match).not.toBeNull();
    expect(finding.match).not.toMatch(/\r/);
    expect(finding.match).not.toMatch(/\r?\n$/);
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
