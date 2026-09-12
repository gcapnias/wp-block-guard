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
 * never match. On Windows, convert each pattern with fast-glob's own
 * `convertPathToPattern()` helper before handing it to fast-glob — it
 * normalizes `\` to `/` and escapes glob-special characters, which a bare
 * string replace would miss. On every other platform, leave patterns
 * untouched — `\` is a legal filename/glob-escape character there.
 *
 * @param {string[]} patterns raw CLI argv patterns
 * @param {string} [platform] injectable for testing; defaults to process.platform
 * @returns {string[]}
 */
export function normalizePatternsForPlatform(patterns, platform = process.platform) {
  if (platform !== 'win32') return patterns;
  return patterns.map((p) => fg.convertPathToPattern(p));
}

/**
 * Whether formatHuman() should emit ANSI color. Suppressed when stdout is
 * not a TTY (redirected/piped output, e.g. CI logs) or when NO_COLOR is set
 * to any non-empty value (ecosystem convention, https://no-color.org).
 * Isolated from process globals here (injectable params, like
 * normalizePatternsForPlatform above) so tests can assert both states
 * without faking a real TTY.
 *
 * @param {{isTTY?: boolean, noColor?: string}} [env]
 * @returns {boolean}
 */
export function shouldColorize({ isTTY = process.stdout.isTTY, noColor = process.env.NO_COLOR } = {}) {
  return Boolean(isTTY) && !noColor;
}

/**
 * @param {string[]} argv arguments, excluding the node/script entries
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv) {
  const flags = { json: false, strict: false, fix: false, suggest: false, help: false, version: false };
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
      case '--suggest':
        flags.suggest = true;
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

  // --fix and --suggest state opposite intents about writing to disk, so
  // together they are a usage error rather than one silently winning.
  if (flags.fix && flags.suggest) {
    process.stderr.write('--fix and --suggest cannot be combined: --fix writes the file, --suggest returns it.\n\n');
    process.stderr.write(HELP_TEXT);
    return 2;
  }

  // --suggest belongs to the agent workflow. The human report has nowhere
  // sensible to render a whole file, and silently dropping the suggestion
  // would make the flag look like it had worked.
  if (flags.suggest && !flags.json) {
    process.stderr.write('--suggest requires --json: the suggestion is a whole file, which the human report does not render.\n\n');
    process.stderr.write(HELP_TEXT);
    return 2;
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
      results.push(await validateFile(file, { fix: flags.fix, suggest: flags.suggest }));
    } catch (err) {
      results.push({
        file,
        ok: false,
        fixApplied: false,
        fixSkippedReason: null,
        suggestedOutput: null,
        summary: { errors: 1, warnings: 0 },
        findings: [
          {
            code: 'BLOCK_RUNNER_FAILURE',
            severity: 'error',
            file,
            line: 1,
            message: `Unexpected error while validating this file: ${err.message}`,
            search: null,
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
    // --json never reaches this branch at all, so no redundant check for it
    // is needed here.
    process.stdout.write(`${formatHuman(report, { strict: flags.strict, color: shouldColorize() })}\n`);
  }

  if (!report.ok) return 1;
  if (flags.strict && report.summary.warnings > 0) return 1;
  return 0;
}
