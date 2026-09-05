import fs from 'node:fs/promises';
import { extractPhpHeader, scanForEmbeddedPhp, maskEmbeddedPhp } from './php-fragment.js';
import { runStructuralLayer, BLOCKING_STRUCTURAL_CODES } from './structural.js';
import { validateMarkup, fixMarkup } from './block-runner-adapter.js';
import { makeFinding } from './findings.js';
import { resolveItemLines } from './block-locator.js';

/**
 * Turn block-runner's report items into findings, with positions re-derived
 * from our own tokenizer rather than taken from `item.source.htmlLine`, which
 * routinely names a different, valid block (see src/block-locator.js).
 *
 * Falls back to block-runner's own line wherever the mapping is not certain,
 * so this is never worse than reporting nothing.
 *
 * @param {Array<object>} items
 * @param {string} content the markup handed to block-runner
 * @param {string} filePath
 * @param {number} headerLines lines consumed by a stripped PHP header
 */
async function findingsForItems(items, content, filePath, headerLines) {
  const resolved = await resolveItemLines({ content, items, validateMarkup });

  return items.map((item, index) => {
    const code = item.status === 'warning' ? 'BLOCK_RUNNER_WARNING' : 'BLOCK_INVALID';
    const fallback = item.source && item.source.htmlLine ? item.source.htmlLine : null;
    const line = resolved[index] ? resolved[index].line : fallback;

    return makeFinding(code, {
      file: filePath,
      line: line == null ? undefined : line + headerLines,
      blockName: item.block,
      detail: item.reason,
    });
  });
}

/**
 * Run the full three-layer pipeline (PHP-fragment flagging, structural
 * pre-check, block-runner save()-diff) against one file.
 *
 * @param {string} filePath
 * @param {{ fix?: boolean }} [options]
 */
export async function validateFile(filePath, options = {}) {
  const { fix = false } = options;
  const raw = await fs.readFile(filePath, 'utf8');
  const isPhp = /\.php$/i.test(filePath);

  const findings = [];
  let header = '';
  let headerLines = 0;
  let body = raw;
  let hasEmbeddedPhp = false;

  // --- Layer 0: PHP fragment extraction and flagging ---
  if (isPhp) {
    const extracted = extractPhpHeader(raw);
    header = extracted.header || '';
    headerLines = extracted.headerLines;
    body = extracted.body;

    if (header) {
      findings.push(makeFinding('PHP_HEADER_STRIPPED', { file: filePath, line: 1 }));
    }

    const embedded = scanForEmbeddedPhp(body);
    if (embedded.length > 0) {
      hasEmbeddedPhp = true;
      for (const occurrence of embedded) {
        findings.push(
          makeFinding('PHP_INTERPOLATION_UNCHECKED', {
            file: filePath,
            line: occurrence.line + headerLines,
          })
        );
      }
      body = maskEmbeddedPhp(body);
    }
  }

  // --- Layer 1: structural delimiter pre-check ---
  const structuralFindings = runStructuralLayer(body);
  for (const sf of structuralFindings) {
    findings.push(
      makeFinding(sf.code, {
        file: filePath,
        line: sf.line + headerLines,
        blockName: sf.blockName,
        detail: sf.detail,
      })
    );
  }
  const hasBlockingStructuralErrors = structuralFindings.some((f) => BLOCKING_STRUCTURAL_CODES.includes(f.code));

  // --- Layer 2: block-runner save()-diff validation ---
  if (hasBlockingStructuralErrors) {
    findings.push(
      makeFinding('BLOCK_RUNNER_SKIPPED', {
        file: filePath,
        line: 1,
        detail:
          'Skipped block-runner validation because the structural pre-check found unbalanced or malformed delimiters; fix those first.',
      })
    );
  } else {
    const result = await validateMarkup(body);
    if (!result.ok) {
      findings.push(
        makeFinding('BLOCK_RUNNER_FAILURE', {
          file: filePath,
          line: 1,
          detail: result.error,
        })
      );
    } else {
      findings.push(...(await findingsForItems(result.data.items || [], body, filePath, headerLines)));
    }
  }

  // --- Optional: --fix, only when safe (see design doc §3, Layer 2 bullet on `fix`) ---
  let fixApplied = false;
  let fixSkippedReason = null;
  if (fix) {
    const errorCount = findings.filter((f) => f.severity === 'error').length;
    const onlyBlockRunnerFindings = findings.every((f) =>
      ['PHP_HEADER_STRIPPED', 'BLOCK_INVALID', 'BLOCK_RUNNER_WARNING'].includes(f.code)
    );

    if (hasEmbeddedPhp) {
      fixSkippedReason = 'Contains embedded PHP interpolation; not safely auto-fixable.';
    } else if (hasBlockingStructuralErrors) {
      fixSkippedReason = 'Contains structural delimiter errors; not safely auto-fixable.';
    } else if (errorCount === 0) {
      fixSkippedReason = null; // nothing to fix, not worth reporting as "skipped"
    } else if (!onlyBlockRunnerFindings) {
      fixSkippedReason = 'Contains findings outside block-runner\'s scope; not safely auto-fixable.';
    } else {
      const fixedBody = await fixMarkup(body);
      if (fixedBody != null) {
        await fs.writeFile(filePath, header + fixedBody, 'utf8');
        fixApplied = true;
        body = fixedBody;

        // Re-validate the fixed content so the returned result reflects
        // reality, not the pre-fix findings: block-runner's own findings
        // (BLOCK_INVALID / BLOCK_RUNNER_WARNING) are stale once the file has
        // actually been rewritten.
        const staleCodes = ['BLOCK_INVALID', 'BLOCK_RUNNER_WARNING', 'BLOCK_RUNNER_FAILURE'];
        for (let i = findings.length - 1; i >= 0; i--) {
          if (staleCodes.includes(findings[i].code)) findings.splice(i, 1);
        }

        const revalidated = await validateMarkup(body);
        if (!revalidated.ok) {
          findings.push(
            makeFinding('BLOCK_RUNNER_FAILURE', {
              file: filePath,
              line: 1,
              detail: revalidated.error,
            })
          );
        } else {
          findings.push(...(await findingsForItems(revalidated.data.items || [], body, filePath, headerLines)));
        }
      } else {
        fixSkippedReason = 'block-runner "fix" did not produce output.';
      }
    }
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;

  return {
    file: filePath,
    ok: errorCount === 0,
    fixApplied,
    fixSkippedReason,
    findings,
    summary: { errors: errorCount, warnings: warningCount },
  };
}
