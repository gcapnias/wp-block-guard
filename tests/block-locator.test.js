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

    expect(resolved).toEqual([{ line: 5 }]);
    expect(calls).toHaveLength(2); // ambiguous name: both candidates asked
  });

  it('forces the mapping without validating when every candidate is a finding', async () => {
    const { validateMarkup, calls } = stub();
    const resolved = await resolveItemLines({
      content: TWO_HEADINGS,
      items: [item('core/heading'), item('core/heading')],
      validateMarkup,
    });

    expect(resolved).toEqual([{ line: 2 }, { line: 5 }]);
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
    expect(resolved).toEqual([{ line: 4 }]);
  });
});
