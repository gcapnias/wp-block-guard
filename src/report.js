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

export function formatHuman(report, { strict = false } = {}) {
  const lines = [];
  for (const file of report.files) {
    const passes = file.ok && !(strict && file.summary.warnings > 0);
    const status = passes ? 'PASS' : 'FAIL';
    const statusMark = passes ? '✔' : '✗';
    lines.push(`${statusMark} ${status}: ${file.file}${file.fixApplied ? ' (fixed)' : ''}`);
    for (const finding of file.findings) {
      const marker = MARKERS[finding.severity] || '-';
      const loc = finding.line ? `:${finding.line}` : '';
      lines.push(`   ${marker} [${finding.code}]${loc} ${finding.message}`);
      if (finding.fix) lines.push(`      fix: ${finding.fix}`);
    }
    if (file.fixSkippedReason) {
      lines.push(`   (fix skipped: ${file.fixSkippedReason})`);
    }
  }
  lines.push('');
  lines.push(
    `${report.summary.files} file(s) checked, ${report.summary.errors} error(s), ${report.summary.warnings} warning(s)` +
      (report.summary.fixed ? `, ${report.summary.fixed} file(s) fixed.` : '.')
  );
  return lines.join('\n');
}
