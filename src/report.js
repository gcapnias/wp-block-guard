/**
 * @param {Array<ReturnType<typeof import('./pipeline.js').validateFile> extends Promise<infer T> ? T : never>} fileResults
 */
export function buildReport(fileResults) {
  const summary = fileResults.reduce(
    (acc, r) => {
      acc.errors += r.summary.errors;
      acc.warnings += r.summary.warnings;
      if (r.fixApplied) acc.fixed += 1;
      return acc;
    },
    { files: fileResults.length, errors: 0, warnings: 0, fixed: 0 }
  );
  return {
    ok: summary.errors === 0,
    summary,
    files: fileResults,
  };
}

const MARKERS = { error: '✗', warning: '⚠', info: 'ℹ' };

// Hand-rolled ANSI escapes — no color/table dependency in this repo, and the
// approved design (wpbg-dpw) says not to add one for this.
const ANSI = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
};

// severity -> color, matching the MARKERS keys above.
const SEVERITY_COLOR = { error: ANSI.red, warning: ANSI.yellow, info: ANSI.cyan };

const SEARCH_LINE_CAP = 80;

/**
 * `search` can be a large multi-line block-markup blob (some spans are 20+
 * lines). Printing it verbatim would recreate the "almost unreadable"
 * problem this ticket exists to fix, so only the first line is shown,
 * truncated to a ~80 char cap, with a trailing `…` when truncated or when
 * the value was multi-line.
 *
 * @param {string} search
 * @returns {string}
 */
function truncateSearch(search) {
  const newlineIndex = search.indexOf('\n');
  const isMultiLine = newlineIndex !== -1;
  // `search` is byte-exact, so a CRLF file's first line ends in a literal
  // `\r` here — printed as-is, that CR would return the cursor to column 0
  // and let the trailing `…` overwrite the start of the line. Strip it.
  const firstLine = (isMultiLine ? search.slice(0, newlineIndex) : search).replace(/\r$/, '');
  const isTooLong = firstLine.length > SEARCH_LINE_CAP;
  const shown = isTooLong ? firstLine.slice(0, SEARCH_LINE_CAP) : firstLine;
  return isTooLong || isMultiLine ? `${shown}…` : shown;
}

/**
 * @param {ReturnType<typeof buildReport>} report
 * @param {{strict?: boolean, color?: boolean}} [options]
 *   `color` is computed by the caller (src/cli.js) from TTY/`NO_COLOR`/
 *   `--json` state — this function stays a pure function of its inputs and
 *   never reads process.stdout or process.env itself, so tests can assert
 *   both states without faking a TTY.
 */
export function formatHuman(report, { strict = false, color = false } = {}) {
  const paint = (code, text) => (color ? `${code}${text}${ANSI.reset}` : text);
  const lines = [];
  for (const file of report.files) {
    const passes = file.ok && !(strict && file.summary.warnings > 0);
    const status = passes ? 'PASS' : 'FAIL';
    const statusMark = passes ? '✔' : '✗';
    const statusColor = passes ? ANSI.green : ANSI.red;
    lines.push(
      `${paint(statusColor, statusMark)} ${paint(statusColor, status)}: ${file.file}${file.fixApplied ? ' (fixed)' : ''}`
    );
    for (const finding of file.findings) {
      const marker = MARKERS[finding.severity] || '-';
      const severityColor = SEVERITY_COLOR[finding.severity] || ANSI.gray;
      const loc = finding.line ? `:${finding.line}` : '';
      lines.push(
        `   ${paint(severityColor, marker)} ${paint(severityColor, `[${finding.code}]`)}${loc} ${finding.message}`
      );
      if (finding.search != null) {
        lines.push(`      search: ${truncateSearch(finding.search)}`);
      }
      if (finding.fix) lines.push(paint(ANSI.gray, `      fix: ${finding.fix}`));
    }
    if (file.fixSkippedReason) {
      lines.push(`   (fix skipped: ${file.fixSkippedReason})`);
    }
  }
  lines.push('');
  // Only tint the counts when they're nonzero — a red "0 error(s)" on an
  // all-clear run would invert the signal the tinting exists to carry.
  const errorCount =
    report.summary.errors > 0
      ? paint(ANSI.red, `${report.summary.errors} error(s)`)
      : `${report.summary.errors} error(s)`;
  const warningCount =
    report.summary.warnings > 0
      ? paint(ANSI.yellow, `${report.summary.warnings} warning(s)`)
      : `${report.summary.warnings} warning(s)`;
  lines.push(
    `${report.summary.files} file(s) checked, ${errorCount}, ${warningCount}` +
      (report.summary.fixed ? `, ${report.summary.fixed} file(s) fixed.` : '.')
  );
  return lines.join('\n');
}
