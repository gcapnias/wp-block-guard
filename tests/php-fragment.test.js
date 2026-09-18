import { describe, it, expect } from 'vitest';
import {
  extractPhpHeader,
  scanForEmbeddedPhp,
  maskEmbeddedPhp,
  findTrailingPhpSection,
  maskTrailingPhp,
} from '../src/php-fragment.js';

describe('extractPhpHeader', () => {
  it('extracts a leading <?php ... ?> header and reports its line count', () => {
    const content = '<?php /* Title: Example */ ?>\n<!-- wp:heading -->\n<h2>Hi</h2>\n<!-- /wp:heading -->';
    const { header, body, headerLines } = extractPhpHeader(content);
    expect(header).toBe('<?php /* Title: Example */ ?>\n');
    expect(headerLines).toBe(1);
    expect(body).toBe('<!-- wp:heading -->\n<h2>Hi</h2>\n<!-- /wp:heading -->');
  });

  it('returns a null header when content has no leading PHP tag', () => {
    const content = '<!-- wp:heading -->\n<h2>Hi</h2>\n<!-- /wp:heading -->';
    const { header, body, headerLines } = extractPhpHeader(content);
    expect(header).toBeNull();
    expect(headerLines).toBe(0);
    expect(body).toBe(content);
  });
});

describe('scanForEmbeddedPhp', () => {
  it('finds no occurrences in plain markup', () => {
    expect(scanForEmbeddedPhp('<p>Hello</p>')).toEqual([]);
  });

  it('reports exactly one occurrence per embedded PHP tag, not one per token', () => {
    // Regression test for README "Known issues" #2: the opening "<?php" and
    // closing "?>" tokens of a single tag used to be counted as two separate
    // occurrences.
    const body = '<p>Hello <?php echo esc_html( $x ); ?> World</p>';
    const occurrences = scanForEmbeddedPhp(body);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].token).toBe('<?php');
    expect(occurrences[0].line).toBe(1);
  });

  it('recognizes short-echo tags as a single occurrence', () => {
    const occurrences = scanForEmbeddedPhp('<p><?= $x ?></p>');
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].token).toBe('<?=');
  });

  it('reports each of several embedded tags once', () => {
    const occurrences = scanForEmbeddedPhp('<?php echo 1; ?> and <?= 2 ?>');
    expect(occurrences).toHaveLength(2);
  });

  it('still reports an unterminated opener (no matching "?>") once', () => {
    // This function's own contract is unchanged by wpbg-zxg: it still
    // surfaces an unclosed opener as one occurrence. It is the *caller*
    // (src/pipeline.js) that now treats this differently — filtering it out
    // of the PHP_INTERPOLATION_UNCHECKED list and reporting it once as
    // PHP_TRAILING_SECTION instead, via findTrailingPhpSection below.
    const occurrences = scanForEmbeddedPhp('before <?php echo 1;');
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].token).toBe('<?php');
  });
});

describe('findTrailingPhpSection', () => {
  it('returns null when there is no PHP tag at all', () => {
    expect(findTrailingPhpSection('<p>Hello</p>')).toBeNull();
  });

  it('returns null when every PHP tag is properly closed', () => {
    expect(findTrailingPhpSection('<p>Hello <?php echo 1; ?> World</p>')).toBeNull();
  });

  it('finds an opener with no closer at all before EOF', () => {
    const body = '<!-- wp:heading --><h2>Hi</h2><!-- /wp:heading -->\n<?php\n$x = 1;\n';
    const found = findTrailingPhpSection(body);
    expect(found).not.toBeNull();
    expect(found.token).toBe('<?php');
    expect(found.line).toBe(2);
  });

  it('is not fooled by a "?>" inside a double-quoted string literal', () => {
    // This is exactly the case token-counting was rejected for: a naive
    // opener/closer count would see this "?>" as the closer and stop looking.
    const body = '<?php\nfunction foo() {\n  return "?>";\n}\n$x = "<!-- wp:heading -->";\n';
    const found = findTrailingPhpSection(body);
    expect(found).not.toBeNull();
    expect(found.token).toBe('<?php');
    expect(found.index).toBe(0);
  });

  it('is not fooled by a "?>" inside a single-quoted string literal', () => {
    const body = "<?php\n$x = '?>';\necho $x;\n";
    const found = findTrailingPhpSection(body);
    expect(found).not.toBeNull();
  });

  it('is not fooled by a "?>" inside a block comment', () => {
    const body = '<?php\n/* closes with ?> right here */\necho 1;\n';
    const found = findTrailingPhpSection(body);
    expect(found).not.toBeNull();
  });

  it('treats "?>" inside a line comment as a real closer, per PHP semantics', () => {
    const body = '<?php\n// a comment ?>\n<!-- wp:heading --><h2>Hi</h2><!-- /wp:heading -->';
    expect(findTrailingPhpSection(body)).toBeNull();
  });

  it('is not fooled by a "?>" inside a heredoc body', () => {
    const body = "<?php\n$x = <<<EOT\nsome text ?> more text\nEOT;\necho $x;\n";
    const found = findTrailingPhpSection(body);
    expect(found).not.toBeNull();
  });

  it('recognizes a real "?>" closer and finds the later unclosed opener', () => {
    const body = '<?php /* Title: Example */ ?>\n<!-- wp:heading --><h2>Hi</h2><!-- /wp:heading -->\n<?php\n$x = 1;\n';
    const found = findTrailingPhpSection(body);
    expect(found).not.toBeNull();
    expect(found.line).toBe(3);
  });

  it('is a no-op case for a short-echo tag with a matching closer', () => {
    expect(findTrailingPhpSection('<p><?= $x ?></p>')).toBeNull();
  });

  it('finds an unclosed short-echo tag', () => {
    const found = findTrailingPhpSection('<p>Hi</p>\n<?=');
    expect(found).not.toBeNull();
    expect(found.token).toBe('<?=');
  });
});

describe('maskTrailingPhp', () => {
  it('blanks from the given index through EOF, preserving newlines', () => {
    const body = 'before\n<?php\n  echo 1;\n';
    const masked = maskTrailingPhp(body, body.indexOf('<?php'));
    expect(masked.length).toBe(body.length);
    expect(masked.split('\n')).toHaveLength(body.split('\n').length);
    expect(masked.startsWith('before\n')).toBe(true);
    expect(/^\s*$/.test(masked.slice(body.indexOf('<?php')).replace(/\n/g, ''))).toBe(true);
  });
});

describe('maskEmbeddedPhp', () => {
  it('replaces PHP tag regions with same-shaped whitespace, preserving newlines', () => {
    const body = 'A <?php echo 1; ?> B';
    const masked = maskEmbeddedPhp(body);
    expect(masked).toBe('A ' + ' '.repeat('<?php echo 1; ?>'.length) + ' B');
    expect(masked.length).toBe(body.length);
  });

  it('preserves line numbers of content after a multi-line PHP block', () => {
    const body = 'before\n<?php\n  echo 1;\n?>\nafter';
    const masked = maskEmbeddedPhp(body);
    expect(masked.split('\n')).toHaveLength(5);
    expect(masked.split('\n')[4]).toBe('after');
  });

  it('does not crash when a PHP tag is unterminated', () => {
    // maskEmbeddedPhp only masks balanced "<?...?>" regions; it still leaves
    // an unclosed opener untouched (see its docstring). Masking that tail is
    // findTrailingPhpSection/maskTrailingPhp's job (wpbg-zxg) — a separate
    // call the pipeline makes afterward, not this function's job.
    const body = 'before <?php echo 1;';
    expect(() => maskEmbeddedPhp(body)).not.toThrow();
    expect(maskEmbeddedPhp(body)).toBe(body);
  });
});
