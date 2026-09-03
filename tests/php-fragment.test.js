import { describe, it, expect } from 'vitest';
import { extractPhpHeader, scanForEmbeddedPhp, maskEmbeddedPhp } from '../src/php-fragment.js';

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
    const occurrences = scanForEmbeddedPhp('before <?php echo 1;');
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].token).toBe('<?php');
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
    const body = 'before <?php echo 1;';
    expect(() => maskEmbeddedPhp(body)).not.toThrow();
    expect(maskEmbeddedPhp(body)).toBe(body); // left untouched, per design
  });
});
