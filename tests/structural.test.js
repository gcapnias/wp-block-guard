import { describe, it, expect } from 'vitest';
import {
  tokenizeDelimiters,
  runStructuralLayer,
  qualifyBlockName,
  buildBlockTree,
  flattenBlockTree,
} from '../src/structural.js';

describe('tokenizeDelimiters', () => {
  it('tokenizes a balanced open/close pair with JSON attrs', () => {
    const tokens = tokenizeDelimiters(
      '<!-- wp:heading {"level":2} -->\n<h2>Hi</h2>\n<!-- /wp:heading -->'
    );
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ blockName: 'heading', closing: false, attrsValid: true });
    expect(tokens[1]).toMatchObject({ blockName: 'heading', closing: true });
  });

  it('marks a self-closing delimiter and does not require a closer', () => {
    const tokens = tokenizeDelimiters('<!-- wp:separator /-->');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ blockName: 'separator', selfClosing: true });
  });

  it('flags invalid JSON attrs without crashing', () => {
    const tokens = tokenizeDelimiters('<!-- wp:heading {level:2} -->');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].attrsValid).toBe(false);
  });

  it('ignores ordinary HTML comments that are not wp: delimiters', () => {
    const tokens = tokenizeDelimiters('<!-- just a comment --><p>text</p>');
    expect(tokens).toHaveLength(0);
  });

  it('supports namespaced block names', () => {
    const tokens = tokenizeDelimiters('<!-- wp:my-plugin/card --><!-- /wp:my-plugin/card -->');
    expect(tokens.map((t) => t.blockName)).toEqual(['my-plugin/card', 'my-plugin/card']);
  });
});

describe('qualifyBlockName', () => {
  it('qualifies a bare core block name to the "core/" namespace', () => {
    expect(qualifyBlockName('heading')).toBe('core/heading');
  });

  it('leaves an already-namespaced non-core block name as-is', () => {
    expect(qualifyBlockName('my-plugin/card')).toBe('my-plugin/card');
  });
});

describe('runStructuralLayer', () => {
  it('returns STRUCTURAL_NO_BLOCKS for content with no wp: delimiters', () => {
    const findings = runStructuralLayer('<p>Hello</p>');
    expect(findings).toEqual([{ code: 'STRUCTURAL_NO_BLOCKS', line: 1 }]);
  });

  it('returns STRUCTURAL_UNBALANCED_DELIMITER for an opener with no closer', () => {
    const findings = runStructuralLayer('<!-- wp:heading -->\n<h2>Hi</h2>');
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('STRUCTURAL_UNBALANCED_DELIMITER');
    // Bare delimiter names (as written by core blocks, e.g. "wp:heading" with
    // no namespace) are qualified to "core/<name>" in the finding, to match
    // the namespacing BLOCK_INVALID findings carry from block-runner.
    expect(findings[0].blockName).toBe('core/heading');
  });

  it('returns STRUCTURAL_MISMATCHED_CLOSER for out-of-order closers', () => {
    const findings = runStructuralLayer(
      '<!-- wp:group -->\n<!-- wp:paragraph -->\n<!-- /wp:group -->\n<!-- /wp:paragraph -->'
    );
    const codes = findings.map((f) => f.code);
    expect(codes).toEqual(['STRUCTURAL_MISMATCHED_CLOSER', 'STRUCTURAL_MISMATCHED_CLOSER']);
    expect(findings.map((f) => f.blockName)).toEqual(['core/group', 'core/paragraph']);
  });

  it('does not alter an already-namespaced block name in a finding', () => {
    const findings = runStructuralLayer('<!-- wp:my-plugin/card -->\n<p>x</p>');
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('STRUCTURAL_UNBALANCED_DELIMITER');
    expect(findings[0].blockName).toBe('my-plugin/card');
  });

  it('returns STRUCTURAL_INVALID_ATTRS_JSON for malformed attribute JSON', () => {
    const findings = runStructuralLayer('<!-- wp:heading {level:2} -->\n<!-- /wp:heading -->');
    expect(findings.map((f) => f.code)).toContain('STRUCTURAL_INVALID_ATTRS_JSON');
  });

  it('returns no findings for balanced, valid delimiters', () => {
    const findings = runStructuralLayer('<!-- wp:heading {"level":2} -->\n<h2>Hi</h2>\n<!-- /wp:heading -->');
    expect(findings).toEqual([]);
  });
});

describe('buildBlockTree', () => {
  const NESTED =
    '<!-- wp:group -->\n' +
    '<div class="wp-block-group">\n' +
    '<!-- wp:heading {"level":2} -->\n' +
    '<h2>Hi</h2>\n' +
    '<!-- /wp:heading -->\n' +
    '</div>\n' +
    '<!-- /wp:group -->';

  it('nests a child block under its parent', () => {
    const roots = buildBlockTree(NESTED);
    expect(roots).toHaveLength(1);
    expect(roots[0].blockName).toBe('core/group');
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].blockName).toBe('core/heading');
  });

  it('spans a block from its opening delimiter through its closing one', () => {
    const roots = buildBlockTree(NESTED);
    expect(NESTED.slice(roots[0].start, roots[0].end)).toBe(NESTED);

    const heading = roots[0].children[0];
    expect(NESTED.slice(heading.start, heading.end)).toBe(
      '<!-- wp:heading {"level":2} -->\n<h2>Hi</h2>\n<!-- /wp:heading -->'
    );
  });

  it('points innerStart just past the opening delimiter', () => {
    const heading = buildBlockTree(NESTED)[0].children[0];
    expect(NESTED.slice(heading.innerStart, heading.end)).toBe(
      '\n<h2>Hi</h2>\n<!-- /wp:heading -->'
    );
  });

  it('treats a self-closing block as a leaf with no inner content', () => {
    const roots = buildBlockTree('<!-- wp:post-title {"level":1} /-->');
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({ blockName: 'core/post-title', innerStart: null, children: [] });
  });

  it('leaves end null for an opener that never closes', () => {
    const roots = buildBlockTree('<!-- wp:heading -->\n<h2>Hi</h2>');
    expect(roots[0].end).toBeNull();
  });

  it('flattens to document order, parents before their children', () => {
    const names = flattenBlockTree(buildBlockTree(NESTED)).map((b) => b.blockName);
    expect(names).toEqual(['core/group', 'core/heading']);
  });
});
