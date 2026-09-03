# A finding's `search` is byte-exact or absent, never best-effort

A finding carries `search`, the exact source text an agent should look for in order to
replace it. We populate it only from our own delimiter tokenizer (`tokenizeDelimiters()`
in `src/structural.js`) and from Layer 0's PHP-fragment scan, and emit `null` everywhere
else — notably for `BLOCK_INVALID` and `BLOCK_RUNNER_WARNING`, which are the codes that
fire most often on real input. A future reader will find that surprising, so: the
positions block-runner reports for those findings cannot be used to slice text.

Two independent reasons, both verified against
`tests/fixtures/mastermind-ls/parts/title.html`:

- `item.source.htmlLine` points at the block's **delimiter comment**, never at the markup
  actually at fault, which is the `<div>`/`<p>` on a following line.
- The position can belong to a **different block entirely**. One finding on that fixture
  reports line 3 while its message describes the block at line 6; validating each block in
  isolation confirms the line-3 block is valid. block-runner appears to map the nth
  finding of a block name to the nth occurrence of that name, skipping valid ones.

We chose `null` over a best-effort slice because a wrong `search` is worse than a missing
one: `search` exists so an agent can find-and-replace, and text taken from a misattributed
position points at markup that is not broken. Emitting it would turn a reporting bug into
content corruption. The alternative — deriving positions ourselves by correlating
block-runner findings to our own tokens — was rejected for now because the obvious
correlation key, `(blockName, ordinal)`, reproduces exactly the bug we are working around.

Consequence: `search` delivers no value for `BLOCK_INVALID` until the position bug is
fixed, at which point this ADR should be revisited rather than worked around.
