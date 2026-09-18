# Contributing to wp-block-guard

## Reporting bugs / requesting features

File a [GitHub issue](https://github.com/gcapnias/wp-block-guard/issues). Include the
input markup that triggered the problem (or that you expected to be flagged/fixed) and
the exact CLI invocation and output.

## Making changes

1. Fork the repo and branch off `main`.
2. `npm install`
3. Make your change. If it touches `src/`, add or update a test in `tests/` —
   see [`tests/README.md`](tests/README.md) for how the suite is organized.
4. `npm test` — the full vitest suite must pass.
5. Open a pull request against `main`. Describe what changed and why; link any
   related issue.

## Scope notes

- `src/help.js` is the single source of truth for `--help` text; if you change CLI
  behavior, update it there rather than adding a second description elsewhere.
- `src/findings.js` is the single source of truth for finding codes; new findings need
  an entry there, not just an ad-hoc message string.
- Architectural decisions and their reasoning live in [`docs/adr/`](docs/adr/). If your
  change reverses or amends one, update the relevant ADR rather than leaving it stale.

## License

By contributing, you agree that your contributions will be licensed under this
project's [MIT License](LICENSE).
