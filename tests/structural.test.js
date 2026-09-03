import { describe, it, expect } from 'vitest';
import { tokenizeDelimiters, runStructuralLayer } from '../src/structural.js';

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

describe('runStructuralLayer', () => {
  it('returns STRUCTURAL_NO_BLOCKS for content with no wp: delimiters', () => {
    const findings = runStructuralLayer('<p>Hello</p>');
    expect(findings).toEqual([{ code: 'STRUCTURAL_NO_BLOCKS', line: 1 }]);
  });

  it('returns STRUCTURAL_UNBALANCED_DELIMITER for an opener with no closer', () => {
    const findings = runStructuralLayer('<!-- wp:heading -->\n<h2>Hi</h2>');
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('STRUCTURAL_UNBALANCED_DELIMITER');
    expect(findings[0].blockName).toBe('heading');
  });

  it('returns STRUCTURAL_MISMATCHED_CLOSER for out-of-order closers', () => {
    const findings = runStructuralLayer(
      '<!-- wp:group -->\n<!-- wp:paragraph -->\n<!-- /wp:group -->\n<!-- /wp:paragraph -->'
    );
    const codes = findings.map((f) => f.code);
    expect(codes).toEqual(['STRUCTURAL_MISMATCHED_CLOSER', 'STRUCTURAL_MISMATCHED_CLOSER']);
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
