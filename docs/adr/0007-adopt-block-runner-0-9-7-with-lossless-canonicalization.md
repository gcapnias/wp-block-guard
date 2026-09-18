# Adopt block-runner 0.9.7 while preserving lossless canonicalization

Status: accepted 2026-09-19

The maintainer approved block-runner 0.9.7's Node support policy on 2026-09-19.

## Context

This repository uses block-runner as Layer 2 of its validate/fix pipeline.

Block-runner 0.9.0--0.9.7 add source-bound authoring, registered-block and
plugin workflows, and native style adapters. Version 0.9.7 also adds
`php-parser@3.7.0` and narrows its own Node engine range to
`^20.19.0 || ^22.13.0 || >=24.0.0`.

## Decision

Adopt `block-runner` 0.9.7 and set this package's published Node support range
to `^20.19.0 || ^22.13.0 || >=24.0.0`, matching upstream.

0.9.7 can rebuild invalid blocks from parsed attributes. Its warning says that
original styling may differ, so treating that output as an unattended fix
would violate this wrapper's lossless canonicalization contract. The adapter
therefore declines every warning-bearing canonicalization result: `--fix`
leaves the file untouched and `--suggest` returns no candidate. Ordinary
warning-free near-miss canonicalization remains available.

The fifth full-suite failure was an environment issue: this checkout inherits
`NO_COLOR=1`, while the isolated `shouldColorize` unit test expects that
variable to be unset. Running that test with `NO_COLOR` empty passes.

The 0.9.7 adapter's stderr containment remains compatible: the existing child
process regression test passed, so `captureStderr()` still prevents
`canonicalize()`'s block-definition dump from leaking to the CLI's stderr.

The new `php-parser` does not overlap Layer 0. In 0.9.7 it is loaded only by
the authoring compiler to parse generated `block.php` source. This repository's
PHP-fragment layer detects embedded PHP, masks it with same-shaped whitespace,
and reports `PHP_INTERPOLATION_UNCHECKED` before validation; it is not an AST
parser. The dependency therefore does not replace or duplicate the current
flag-and-mask job.

The authoring and plugin workflows are outside this repository's validate/fix
surface. Defer them rather than adopting their APIs incidentally; a useful
future adoption would need its own ticket, scope, and acceptance tests.

## Revisit trigger

Revisit the warning gate if block-runner adds a stable structured signal that
distinguishes lossy rebuilds from other warnings. Until then, rejecting all
warning-bearing canonicalization results is the safe default.

## Consequences

The repository receives 0.9.7's validation improvements without silently
dropping authored attributes. It does not adopt 0.9.x's unrelated authoring
capabilities.
