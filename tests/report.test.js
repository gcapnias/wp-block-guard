import { describe, it, expect } from 'vitest';
import { formatHuman } from '../src/report.js';

const ANSI_RE = /\x1b\[\d+m/;

function makeFile({ ok = true, findings = [], fixApplied = false, fixSkippedReason = null } = {}) {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  return {
    file: 'example.html',
    ok,
    fixApplied,
    fixSkippedReason,
    suggestedOutput: null,
    summary: { errors, warnings },
    findings,
  };
}

function makeReport(files) {
  const summary = files.reduce(
    (acc, f) => {
      acc.errors += f.summary.errors;
      acc.warnings += f.summary.warnings;
      if (f.fixApplied) acc.fixed += 1;
      return acc;
    },
    { files: files.length, errors: 0, warnings: 0, fixed: 0 }
  );
  return { ok: summary.errors === 0, summary, files };
}

function errorFinding(overrides = {}) {
  return {
    code: 'BLOCK_INVALID',
    severity: 'error',
    file: 'example.html',
    line: 2,
    blockName: 'core/heading',
    message: 'Block "core/heading" content does not match its parsed attributes.',
    search: null,
    fix: 'Canonicalize this near-miss markup.',
    ...overrides,
  };
}

describe('formatHuman color', () => {
  it('emits no ANSI codes by default (color option omitted)', () => {
    const report = makeReport([makeFile({ ok: false, findings: [errorFinding()] })]);
    const output = formatHuman(report, { strict: false });
    expect(output).not.toMatch(ANSI_RE);
  });

  it('emits no ANSI codes when color: false', () => {
    const report = makeReport([makeFile({ ok: false, findings: [errorFinding()] })]);
    const output = formatHuman(report, { strict: false, color: false });
    expect(output).not.toMatch(ANSI_RE);
  });

  it('emits ANSI codes when color: true', () => {
    const report = makeReport([makeFile({ ok: false, findings: [errorFinding()] })]);
    const output = formatHuman(report, { strict: false, color: true });
    expect(output).toMatch(ANSI_RE);
  });

  it('colors the status line green for PASS and red for FAIL', () => {
    const passReport = makeReport([makeFile({ ok: true, findings: [] })]);
    const passOutput = formatHuman(passReport, { color: true });
    expect(passOutput).toContain('\x1b[32m'); // green

    const failReport = makeReport([makeFile({ ok: false, findings: [errorFinding()] })]);
    const failOutput = formatHuman(failReport, { color: true });
    expect(failOutput).toContain('\x1b[31m'); // red
  });

  it('colors an error finding marker red and a warning finding marker yellow', () => {
    const report = makeReport([
      makeFile({
        ok: false,
        findings: [
          errorFinding(),
          errorFinding({ code: 'BLOCK_MISSING_NEWLINE', severity: 'warning', message: 'warn message' }),
        ],
      }),
    ]);
    const output = formatHuman(report, { color: true });
    expect(output).toMatch(/\x1b\[31m[^\n]*\[BLOCK_INVALID]/);
    expect(output).toMatch(/\x1b\[33m[^\n]*\[BLOCK_MISSING_NEWLINE]/);
  });

  it('colors the fix: line dim/gray', () => {
    const report = makeReport([makeFile({ ok: false, findings: [errorFinding()] })]);
    const output = formatHuman(report, { color: true });
    const fixLine = output.split('\n').find((l) => l.includes('fix:'));
    expect(fixLine).toMatch(/\x1b\[90m/);
  });

  it('tints the error and warning counts in the summary line', () => {
    const report = makeReport([
      makeFile({
        ok: false,
        findings: [errorFinding(), errorFinding({ severity: 'warning', message: 'warn' })],
      }),
    ]);
    const output = formatHuman(report, { color: true });
    const summaryLine = output.split('\n').at(-1);
    expect(summaryLine).toMatch(/\x1b\[31m1 error\(s\)\x1b\[0m/);
    expect(summaryLine).toMatch(/\x1b\[33m1 warning\(s\)\x1b\[0m/);
  });

  it('does not tint a zero error/warning count on an all-clear run', () => {
    // A red "0 error(s)" on a passing run would invert the signal the
    // tinting exists to carry, so zero counts stay plain even with color on.
    const report = makeReport([makeFile({ ok: true, findings: [] })]);
    const output = formatHuman(report, { color: true });
    const summaryLine = output.split('\n').at(-1);
    expect(summaryLine).toBe('1 file(s) checked, 0 error(s), 0 warning(s).');
  });
});

describe('formatHuman search field', () => {
  it('omits the search: line entirely when search is null', () => {
    const report = makeReport([makeFile({ ok: false, findings: [errorFinding({ search: null })] })]);
    const output = formatHuman(report);
    expect(output).not.toMatch(/search:/);
  });

  it('prints a short single-line search verbatim with no trailing ellipsis', () => {
    const report = makeReport([makeFile({ ok: false, findings: [errorFinding({ search: '<h2>Hello</h2>' })] })]);
    const output = formatHuman(report);
    expect(output).toMatch(/search: <h2>Hello<\/h2>$/m);
  });

  it('truncates a long single-line search to ~80 chars with a trailing ellipsis', () => {
    const longLine = '<h2 class="wp-block-heading">' + 'x'.repeat(100) + '</h2>';
    const report = makeReport([makeFile({ ok: false, findings: [errorFinding({ search: longLine })] })]);
    const output = formatHuman(report);
    const searchLine = output.split('\n').find((l) => l.includes('search:'));
    expect(searchLine.endsWith('…')).toBe(true);
    // "search: " prefix + at most 80 chars of content + the ellipsis
    expect(searchLine.length).toBeLessThanOrEqual('      search: '.length + 80 + 1);
  });

  it('shows only the first line of a multi-line search, with a trailing ellipsis', () => {
    const multiLine = '<h2 class="wp-block-heading">Hello</h2>\n<p>World</p>\n<p>More</p>';
    const report = makeReport([makeFile({ ok: false, findings: [errorFinding({ search: multiLine })] })]);
    const output = formatHuman(report);
    const searchLine = output.split('\n').find((l) => l.includes('search:'));
    expect(searchLine).toBe('      search: <h2 class="wp-block-heading">Hello</h2>…');
    expect(output).not.toContain('World');
    expect(output).not.toContain('More');
  });

  it('strips a trailing CR from the first line of a CRLF-delimited search', () => {
    // search is byte-exact, so a CRLF input file leaves a literal \r at the
    // end of the first line. Printed verbatim, that \r would return the
    // cursor to column 0 and the trailing … would overwrite the line start.
    const crlf = '<h2 class="wp-block-heading">Hello</h2>\r\n<p>World</p>';
    const report = makeReport([makeFile({ ok: false, findings: [errorFinding({ search: crlf })] })]);
    const output = formatHuman(report);
    const searchLine = output.split('\n').find((l) => l.includes('search:'));
    expect(searchLine).toBe('      search: <h2 class="wp-block-heading">Hello</h2>…');
    expect(searchLine).not.toContain('\r');
  });

  it('places the search: line after the message and before the fix: line', () => {
    const report = makeReport([
      makeFile({ ok: false, findings: [errorFinding({ search: '<h2>Hello</h2>', fix: 'Do the fix.' })] }),
    ]);
    const output = formatHuman(report);
    const lines = output.split('\n');
    const messageIndex = lines.findIndex((l) => l.includes('[BLOCK_INVALID]'));
    const searchIndex = lines.findIndex((l) => l.includes('search:'));
    const fixIndex = lines.findIndex((l) => l.includes('fix:'));
    expect(messageIndex).toBeLessThan(searchIndex);
    expect(searchIndex).toBeLessThan(fixIndex);
  });
});
