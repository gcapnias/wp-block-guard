import { createRequire } from 'node:module';
import fg from 'fast-glob';
import { validateFile } from './pipeline.js';
import { buildReport, formatHuman } from './report.js';
import { HELP_TEXT } from './help.js';

const require = createRequire(import.meta.url);

const MARKUP_FILE_RE = /\.(html?|php)$/i;

/**
 * fast-glob treats `\` as a glob-escape character, not a path separator, so
 * Windows-style backslash patterns (e.g. `.\tests\foo.html`) get mangled and
 * never match. On Windows, normalize `\` to `/` in each pattern before
 * handing it to fast-glob. On every other platform, leave patterns
 * untouched — `\` is a legal filename/glob-escape character there.
 *
 * @param {string[]} patterns raw CLI argv patterns
 * @param {string} [platform] injectable for testing; defaults to process.platform
 * @returns {string[]}
 */
export function normalizePatternsForPlatform(patterns, platform = process.platform) {
  if (platform !== 'win32') return patterns;
  return patterns.map((p) => p.split('\\').join('/'));
}

/**
 * @param {string[]} argv arguments, excluding the node/script entries
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv) {
  const flags = { json: false, strict: false, fix: false, help: false, version: false };
  const patterns = [];

  for (const arg of argv) {
    switch (arg) {
      case '--json':
        flags.json = true;
        break;
      case '--strict':
        flags.strict = true;
        break;
      case '--fix':
        flags.fix = true;
        break;
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '-v':
      case '--version':
        flags.version = true;
        break;
      default:
        if (arg.startsWith('-')) {
          process.stderr.write(`Unknown option: ${arg}\n\n`);
          process.stderr.write(HELP_TEXT);
          return 2;
        }
        patterns.push(arg);
    }
  }

  if (flags.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  if (flags.version) {
    const pkg = require('../package.json');
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  if (patterns.length === 0) {
    process.stderr.write(HELP_TEXT);
    return 2;
  }

  let files;
  try {
    files = await fg(normalizePatternsForPlatform(patterns), { onlyFiles: true, dot: false, unique: true });
  } catch (err) {
    process.stderr.write(`Error resolving file patterns: ${err.message}\n`);
    return 2;
  }
  files = files.filter((f) => MARKUP_FILE_RE.test(f)).sort();

  if (files.length === 0) {
    const message = `No matching .html or .php files found for: ${patterns.join(', ')}`;
    if (flags.json) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: message, patterns }, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    return 2;
  }

  const results = [];
  for (const file of files) {
    try {
      results.push(await validateFile(file, { fix: flags.fix }));
    } catch (err) {
      results.push({
        file,
        ok: false,
        fixApplied: false,
        fixSkippedReason: null,
        summary: { errors: 1, warnings: 0 },
        findings: [
          {
            code: 'BLOCK_RUNNER_FAILURE',
            severity: 'error',
            file,
            line: 1,
            message: `Unexpected error while validating this file: ${err.message}`,
            fix: 'Check that the file is readable and re-run.',
          },
        ],
      });
    }
  }

  const report = buildReport(results);

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatHuman(report, { strict: flags.strict })}\n`);
  }

  if (!report.ok) return 1;
  if (flags.strict && report.summary.warnings > 0) return 1;
  return 0;
}
