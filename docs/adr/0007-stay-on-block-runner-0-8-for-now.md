# Stay on block-runner 0.8.x for now

Status: proposed 2026-09-19

This assessment recommends staying on 0.8.x; maintainer sign-off is required
before changing the dependency or support policy. Revisit when the maintainer
explicitly accepts the canonicalization contract changes and the Node support
policy is updated.

## Context

This repository uses block-runner as Layer 2 of its validate/fix pipeline. The
published dependency range is `^0.8.0`, and the repository's package contract
currently declares `engines.node: ">=20"`.

Block-runner 0.9.0--0.9.7 add source-bound authoring, registered-block and
plugin workflows, and native style adapters. Version 0.9.7 also adds
`php-parser@3.7.0` and narrows its own Node engine range to
`^20.19.0 || ^22.13.0 || >=24.0.0`.

## Decision

Stay on `block-runner` 0.8.x for now. Do not change `package.json`,
`package-lock.json`, or `engines.node` as part of this assessment.

The existing suite is not behavior-compatible with 0.9.7. With 0.9.7
actually installed, 156 of 161 tests passed. Four pipeline tests failed
because 0.9.7's `canonicalize()` repairs the fixture that 0.8.x leaves as a
residual invalid block; the tests intentionally assert the residual finding
and a `null` match when canonicalization does not resolve the finding. The
same three residual tests passed against 0.8.0. This is a contract change for
the wrapper's current findings and suggestion behavior, not a version-only
upgrade.

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

Reconsider 0.9.x when all of the following are true:

1. The maintainer approves the changed canonicalization semantics and the
   wrapper's residual/suggestion tests are deliberately updated or replaced.
2. The maintainer decides whether this published CLI package should narrow its
   Node support to `^20.19.0 || ^22.13.0 || >=24.0.0`; that support-policy
   change must land separately.
3. A fresh full-suite run on the chosen 0.9.x release confirms the stderr
   capture, PHP masking, line/search mapping, and fix/suggest contracts.

## Consequences

The repository keeps its current validated behavior and broad declared Node
floor. It does not receive 0.9.x's unrelated authoring capabilities, and it
will need a deliberate migration when the canonicalization and Node-policy
decisions are made.
