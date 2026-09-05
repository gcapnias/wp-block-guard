import { describe, it, expect } from 'vitest';
import { resolveItemLines } from '../src/block-locator.js';

// A stub standing in for block-runner: a shallow block counts as invalid when
// its markup contains BAD. Lets the mapping logic be tested without paying the
// jsdom + Gutenberg boot.
const stub = (isInvalid = (markup) => markup.includes('BAD')) => {
  const calls = [];
  const validateMarkup = async (markup) => {
    calls.push(markup);
    return {
      ok: true,
      data: {
        summary: { blocks: 1, valid: isInvalid(markup) ? 0 : 1, invalid: isInvalid(markup) ? 1 : 0 },
        items: isInvalid(markup) ? [{ block: 'x', status: 'invalid', reason: 'r' }] : [],
      },
    };
  };
  return { validateMarkup, calls };
};

const item = (block) => ({ block, status: 'invalid', reason: 'r', source: { htmlLine: 1 } });

// Resolved entries carry byte offsets; render them as the text they select, so
// an assertion says what a consumer would actually get to search for.
const sliced = (content, resolved) =>
  resolved.map((r) => (r === null ? null : { line: r.line, text: content.slice(r.start, r.end) }));

const TWO_HEADINGS =
  '<!-- wp:heading -->\n' + //      line 1, delimiter
  '<h2>fine</h2>\n' + //            line 2
  '<!-- /wp:heading -->\n' + //     line 3
  '<!-- wp:heading -->\n' + //      line 4
  '<h2>BAD</h2>\n' + //             line 5
  '<!-- /wp:heading -->'; //        line 6

describe('resolveItemLines', () => {
  it('returns an empty result for no items', async () => {
    const { validateMarkup } = stub();
    expect(await resolveItemLines({ content: TWO_HEADINGS, items: [], validateMarkup })).toEqual([]);
  });

  it('picks the invalid block when a valid one of the same name precedes it', async () => {
    const { validateMarkup, calls } = stub();
    const resolved = await resolveItemLines({
      content: TWO_HEADINGS,
      items: [item('core/heading')],
      validateMarkup,
    });

    expect(sliced(TWO_HEADINGS, resolved)).toEqual([{ line: 5, text: '<h2>BAD</h2>' }]);
    expect(calls).toHaveLength(2); // ambiguous name: both candidates asked
  });

  it('forces the mapping without validating when every candidate is a finding', async () => {
    const { validateMarkup, calls } = stub();
    const resolved = await resolveItemLines({
      content: TWO_HEADINGS,
      items: [item('core/heading'), item('core/heading')],
      validateMarkup,
    });

    expect(sliced(TWO_HEADINGS, resolved)).toEqual([
      { line: 2, text: '<h2>fine</h2>' },
      { line: 5, text: '<h2>BAD</h2>' },
    ]);
    expect(calls).toHaveLength(0); // nothing ambiguous, so nothing to ask
  });

  it('falls back when an item is not a plain invalid verdict', async () => {
    const { validateMarkup } = stub();
    const items = [{ block: 'core/heading', status: 'warning', reason: 'r' }];
    expect(await resolveItemLines({ content: TWO_HEADINGS, items, validateMarkup })).toEqual([null]);
  });

  it('falls back when there are fewer blocks of a name than findings for it', async () => {
    const { validateMarkup } = stub();
    const items = [item('core/heading'), item('core/heading'), item('core/heading')];
    expect(await resolveItemLines({ content: TWO_HEADINGS, items, validateMarkup })).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('falls back when the verdicts do not account for every finding', async () => {
    // Nothing looks invalid to the stub, so no candidate is selected and the
    // count cannot match the single item.
    const { validateMarkup } = stub(() => false);
    expect(
      await resolveItemLines({ content: TWO_HEADINGS, items: [item('core/heading')], validateMarkup })
    ).toEqual([null]);
  });

  it('falls back when a shallow span does not reduce to exactly one block', async () => {
    const validateMarkup = async () => ({
      ok: true,
      data: { summary: { blocks: 2, valid: 1, invalid: 1 }, items: [{ status: 'invalid' }] },
    });
    expect(
      await resolveItemLines({ content: TWO_HEADINGS, items: [item('core/heading')], validateMarkup })
    ).toEqual([null]);
  });

  it('falls back when the validator itself fails', async () => {
    const validateMarkup = async () => ({ ok: false, data: null });
    expect(
      await resolveItemLines({ content: TWO_HEADINGS, items: [item('core/heading')], validateMarkup })
    ).toEqual([null]);
  });

  it('ignores an unclosed block rather than guessing its span', async () => {
    const { validateMarkup } = stub();
    const content = '<!-- wp:heading -->\n<h2>BAD</h2>';
    expect(
      await resolveItemLines({ content, items: [item('core/heading')], validateMarkup })
    ).toEqual([null]);
  });

  it('reports a self-closing block at its delimiter, having no inner markup', async () => {
    const { validateMarkup } = stub((m) => m.includes('post-title'));
    const content = '<!-- wp:paragraph -->\n<p>x</p>\n<!-- /wp:paragraph -->\n<!-- wp:post-title /-->';
    const resolved = await resolveItemLines({
      content,
      items: [item('core/post-title')],
      validateMarkup,
    });
    expect(sliced(content, resolved)).toEqual([{ line: 4, text: '<!-- wp:post-title /-->' }]);
  });

  it('spans the element at fault, not the delimiters around it', async () => {
    const { validateMarkup } = stub();
    const content = '<!-- wp:heading {"level":2} -->\n  <h2>BAD</h2>\n<!-- /wp:heading -->\n';
    const resolved = await resolveItemLines({
      content,
      items: [item('core/heading')],
      validateMarkup,
    });
    // Leading indentation and the trailing newline are trimmed; the delimiter,
    // which carries the attributes save() is held to, is not part of the span.
    expect(sliced(content, resolved)).toEqual([{ line: 2, text: '<h2>BAD</h2>' }]);
  });

  it('spans a nested block whole, children included, so the text is contiguous', async () => {
    const content =
      '<!-- wp:group -->\n' +
      '<div class="wp-block-group">BAD\n' +
      '<!-- wp:paragraph -->\n' +
      '<p>inner</p>\n' +
      '<!-- /wp:paragraph -->\n' +
      '</div>\n' +
      '<!-- /wp:group -->';
    const { validateMarkup } = stub((m) => m.includes('BAD'));
    const resolved = await resolveItemLines({
      content,
      items: [item('core/group')],
      validateMarkup,
    });
    const [entry] = sliced(content, resolved);
    expect(entry.line).toBe(2);
    // Whatever the span is, it must be findable verbatim in the source — which
    // rules out the children-removed form used for validation.
    expect(content).toContain(entry.text);
    expect(entry.text).toContain('<!-- wp:paragraph -->');
  });

  it('falls back to the whole block when there is no inner markup to point at', async () => {
    const { validateMarkup } = stub((m) => m.includes('spacer'));
    const content = '<!-- wp:spacer -->\n\n<!-- /wp:spacer -->';
    const resolved = await resolveItemLines({
      content,
      items: [item('core/spacer')],
      validateMarkup,
    });
    expect(sliced(content, resolved)).toEqual([{ line: 1, text: content }]);
  });
});
