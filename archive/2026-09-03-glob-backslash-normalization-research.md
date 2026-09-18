# Windows backslash-glob normalization: is there a library that already solves this?

Research for wpbg-q7k follow-up. Question: does an established library (glob
library, CLI-parsing framework, or path utility) already solve backslash vs.
forward-slash pattern normalization for `fast-glob`, making the hand-rolled
`normalizePatternsForPlatform()` fix in `src/cli.js` unnecessary?

## Bottom line

The merged fix is fine as written. This is a known, documented, unresolved
ambiguity in `fast-glob` itself (backslash as path separator vs. glob-escape
character on Windows) — not a gap any library abstracts away. No library swap
removes the need for normalization; at most, one line can be swapped for
fast-glob's own built-in helper.

## Findings

### 1. fast-glob itself

`fast-glob`'s README has a documented FAQ: **"How to write patterns on
Windows?"** — it says patterns must use forward slashes, and it ships a
built-in helper for exactly this purpose: `fg.convertPathToPattern()`.

[GitHub issue #262](https://github.com/mrmlnc/fast-glob/issues/262) confirms
the maintainer treats backslash-as-separator-vs-escape as a genuine,
unresolved tension on Windows — not user error, and not something planned to
be silently fixed inside the library's default matching behavior.

`fg.convertPathToPattern()` does the same slash conversion as a bare
`.split('\\').join('/')`, **plus** it escapes glob-special characters
(`(`, `)`, `[`, `]`) before converting separators — something the manual
split does not handle.

Sources:
- https://github.com/mrmlnc/fast-glob#how-to-write-patterns-on-windows
- https://github.com/mrmlnc/fast-glob/issues/262
- https://github.com/mrmlnc/fast-glob/blob/master/src/utils/path.ts
- https://github.com/mrmlnc/fast-glob/blob/master/src/index.ts

### 2. Alternative glob libraries

- **`globby`** (sindresorhus, built on fast-glob): forwards patterns straight
  into fast-glob with zero pre-processing. Switching from `fast-glob` to
  `globby` would change nothing for this bug.
  https://github.com/sindresorhus/globby/blob/main/index.js
- **`glob`** (isaacs/npm `glob`): also requires forward-slash patterns; has a
  `windowsPathsNoEscape` option that changes escape semantics on Windows but
  doesn't auto-normalize arbitrary backslash input the way this CLI needs.
  https://github.com/isaacs/node-glob/blob/main/README.md
- **`tiny-glob`**: same forward-slash-only requirement; open issue tracking
  the same class of problem.
  https://github.com/terkelg/tiny-glob/issues/40

None of these solve the problem "for free" — every one of them expects
forward-slash patterns and expects the caller to normalize first.

### 3. `slash` (sindresorhus/slash)

`slash` is literally `path.replace(/\\/g, '/')` plus a guard for `\\?\`
extended-length Windows paths. It is a one-line wrapper around the exact
idiom already written in `src/cli.js`. Pulling in a dependency to wrap one
regex is not a meaningful improvement over the inline version.

https://github.com/sindresorhus/slash/blob/main/index.js

### 4. CLI argument-parsing frameworks (yargs, commander)

Not the right layer for this. This is a glob-resolution concern, not an
argv-parsing one. `yargs`' `.normalize()` option just calls Node's
platform-native `path.normalize()`, which **keeps backslashes on win32** —
it would not fix this bug at all.

https://github.com/yargs/yargs/blob/main/docs/advanced.md

### 5. Dependency check / recommendation

`fast-glob` is already a direct dependency of this repo (used via `fg` in
`src/cli.js`). Since it ships `fg.convertPathToPattern()`, the low-risk
improvement is to swap the manual `.split('\\').join('/')` in
`normalizePatternsForPlatform()` for that built-in — it's already a
dependency, so this adds no new dependency, and it additionally escapes
glob-special characters that the bare split misses. This is only a
meaningful win if patterns can ever contain those characters (e.g. built
programmatically rather than hand-typed on the CLI), but it's free
correctness, so worth doing regardless.

No other library swap (globby, glob, tiny-glob, slash, yargs/commander) buys
anything here.
