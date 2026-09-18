# Normalize blockName to full namespace in findings, regardless of source layer

Gutenberg's own delimiter grammar omits the `core/` namespace when *writing* core
blocks (`<!-- wp:heading -->`), but block-runner's Layer 2 findings always report
`blockName` fully-namespaced (`core/heading`). Layer 1's tokenizer parses the bare
text as written, so without correction its findings would report `heading` for the
same block block-runner calls `core/heading` — an inconsistency an agent matching on
`blockName` across findings from different layers would otherwise have to work around
per-layer. We chose to normalize at the boundary instead: the tokenizer/balance-stack
keep matching openers and closers by the exact bare text written in the source (this
must not change, or nesting checks break), but `qualifyBlockName()` in
`src/structural.js` prefixes `core/` only when a name is surfaced in a finding. The
alternative — leaving Layer 1 findings bare and documenting the discrepancy — was
rejected because it pushes namespace-reconciliation work onto every consumer of the
JSON output instead of doing it once.
