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
 * `search` is sliced from the same re-derived span as `line`, out of
 * `sourceContent` rather than `content` so that a PHP-masked body never
 * reaches the output. It is `null` on the fallback path: a position we do not
 * trust must not be turned into text to find and replace
 * (`docs/adr/0002-search-is-byte-exact-or-absent.md`).
 *
 * @param {Array<object>} items
 * @param {string} content the markup handed to block-runner
 * @param {string} sourceContent the same markup before PHP masking, to slice from
 * @param {string} filePath
 * @param {number} headerLines lines consumed by a stripped PHP header
 */
async function findingsForItems(items, content, sourceContent, filePath, headerLines) {
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
      search: resolved[index] ? sourceContent.slice(resolved[index].start, resolved[index].end) : null,
    });
  });
}

/**
 * Re-conform a suggestion to the line-ending conventions of the file it was
 * derived from.
 *
 * Canonicalization preserves neither: measured on a CRLF input it returns LF
 * throughout, and it drops the input's trailing newline. An agent applying a
 * suggestion writes it back verbatim, so without this it would author a
 * whole-file line-ending change plus a newline-at-EOF loss it never intended
 * — noise attributable to this tool in a file the agent did not otherwise
 * reformat.
 *
 * The `--fix` write path uses this too (wpbg-8j7): it loses both the trailing
 * newline and the source line-ending convention in exactly the same way, so
 * the write is wrapped with the same call rather than a second normalizer.
 *
 * @param {string} suggestion canonicalized whole-file content
 * @param {string} raw the input file exactly as read from disk
 * @returns {string}
 */
export function conformToSource(suggestion, raw) {
  // Majority wins for a file that mixes both, since a find-and-replace
  // against it is likeliest to be written in its prevailing convention.
  const crlfCount = (raw.match(/\r\n/g) || []).length;
  const lfCount = (raw.match(/(?<!\r)\n/g) || []).length;
  const eol = crlfCount > lfCount ? '\r\n' : '\n';

  let out = suggestion.replace(/\r\n/g, '\n');
  if (eol === '\r\n') out = out.replace(/\n/g, '\r\n');

  // Both directions. Appending unconditionally would add a newline to a file
  // that never had one, which is the same class of unrequested edit.
  const rawEndsWithNewline = /\n$/.test(raw);
  const outEndsWithNewline = /\n$/.test(out);
  if (rawEndsWithNewline && !outEndsWithNewline) out += eol;
  else if (!rawEndsWithNewline && outEndsWithNewline) out = out.replace(/\r?\n$/, '');

  return out;
}

/**
 * Run the full three-layer pipeline (PHP-fragment flagging, structural
 * pre-check, block-runner save()-diff) against one file.
 *
 * @param {string} filePath
 * @param {{ fix?: boolean, suggest?: boolean }} [options]
 */
export async function validateFile(filePath, options = {}) {
  const { fix = false, suggest = false } = options;
  const raw = await fs.readFile(filePath, 'utf8');
  const isPhp = /\.php$/i.test(filePath);

  const findings = [];
  let header = '';
  let headerLines = 0;
  let body = raw;
  // The same content before PHP masking. Masking blanks PHP to spaces, so a
  // `search` sliced from `body` would not be byte-exact where a fragment sits
  // inside markup we report on — a delimiter comment's attribute JSON, say.
  // Masking is length-preserving, so one set of offsets indexes both.
  let unmaskedBody = raw;
  let hasEmbeddedPhp = false;

  // --- Layer 0: PHP fragment extraction and flagging ---
  if (isPhp) {
    const extracted = extractPhpHeader(raw);
    header = extracted.header || '';
    headerLines = extracted.headerLines;
    body = extracted.body;
    unmaskedBody = extracted.body;

    if (header) {
      findings.push(
        // The header text itself, without the blank lines the extraction
        // regex also consumed.
        makeFinding('PHP_HEADER_STRIPPED', { file: filePath, line: 1, search: header.replace(/\s+$/, '') })
      );
    }

    const embedded = scanForEmbeddedPhp(body);
    if (embedded.length > 0) {
      hasEmbeddedPhp = true;
      for (const occurrence of embedded) {
        findings.push(
          makeFinding('PHP_INTERPOLATION_UNCHECKED', {
            file: filePath,
            line: occurrence.line + headerLines,
            search: occurrence.text,
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
        // Sliced from the unmasked body: the structural layer tokenizes the
        // masked one, but the offsets are shared and the output must not carry
        // blanked-out PHP.
        search: sf.start == null ? null : unmaskedBody.slice(sf.start, sf.end),
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
      findings.push(...(await findingsForItems(result.data.items || [], body, unmaskedBody, filePath, headerLines)));
    }
  }

  // --- Optional: --fix / --suggest, only when safe (see design doc §3, Layer 2 bullet on `fix`) ---
  // Both request the same canonicalization and share this gating; they differ
  // only in whether the result is written to disk or handed back.
  let fixApplied = false;
  let fixSkippedReason = null;
  let suggestedOutput = null;
  if (fix || suggest) {
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
      if (fixedBody == null) {
        fixSkippedReason = 'block-runner "fix" did not produce output.';
      } else if (suggest) {
        // The agent workflow: hand back exactly what --fix would have written
        // and leave the file alone. Deliberately no re-validate — the one in
        // the branch below exists only to refresh findings the write made
        // stale, and nothing was written here. So findings, `ok`, and the exit
        // code keep describing the file on disk, which is what an agent needs:
        // it has not applied the suggestion yet, and its confirming re-run
        // would be meaningless if this call already reported the file clean.
        suggestedOutput = conformToSource(header + fixedBody, raw);
      } else {
        // Conform the body alone, not `header + fixedBody`: conformToSource
        // rewrites EOLs inside its whole input, including the header, which
        // would shift `header.length` and misalign a slice back out of it.
        // `header` is already a slice of `raw` (see extractPhpHeader), so it
        // already carries the file's native EOLs untouched; only `fixedBody`
        // needs re-conforming. `body` is then reassigned to the conformed
        // string, not `fixedBody`, so the re-validate below and the write to
        // disk share one string — block-runner's item offsets, and the
        // `search` text findingsForItems slices from it, must index the same
        // bytes that end up on disk (docs/adr/0002-search-is-byte-exact-or-absent.md).
        const conformedBody = conformToSource(fixedBody, raw);
        await fs.writeFile(filePath, header + conformedBody, 'utf8');
        fixApplied = true;
        body = conformedBody;

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
          // No masking on this path — --fix is skipped outright for a file with
          // embedded PHP — so the rewritten body is its own unmasked source.
          findings.push(
            ...(await findingsForItems(revalidated.data.items || [], body, body, filePath, headerLines))
          );
        }
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
    suggestedOutput,
    findings,
    summary: { errors: errorCount, warnings: warningCount },
  };
}
