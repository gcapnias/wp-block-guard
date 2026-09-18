# Agent-Workflow Output in the Human Report

This tool does not render `--suggest`-only data — `match`, `suggestedOutput`, or anything
else computed for the agent workflow — in the human-readable report.

## Why this is out of scope

`wp-block-guard` has two deliberately separate workflows, recorded in
`docs/adr/0006-two-workflows-fix-writes-suggest-returns.md`:

- **`--fix` is the human workflow.** It rewrites the file in place and reports what it did.
- **`--suggest` is the agent workflow.** It writes nothing and returns the correction for the
  caller to apply as its own edit.

`--suggest` requires `--json`, enforced as a usage error:

```js
// src/cli.js
if (flags.suggest && !flags.json) {
  process.stderr.write('--suggest requires --json: the suggestion is a whole file, which the human report does not render.\n\n');
  // ... exit 2
}
```

And `--json` takes a different output branch entirely, so `formatHuman()` is never called:

```js
// src/cli.js
if (flags.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`${formatHuman(report, { strict: flags.strict, color: shouldColorize() })}\n`);
}
```

The consequence is structural rather than incidental. Any field populated only under
`--suggest` is unreachable from the human report:

```
match non-null  ⟹  --suggest  ⟹  --json  ⟹  JSON branch  ⟹  formatHuman never called
```

A human never runs `--suggest`; they run `--fix`. So there is no user in the human report who
has a `match` to be shown. Adding a rendering for one would produce code no CLI invocation can
execute — which is exactly what happened once already (see Prior requests).

## The trap this file exists to prevent

The intuitive move, on discovering that `match` has no human rendering, is to relax the
`--suggest`-requires-`--json` rule so that it can have one. **That is backwards.** It inverts a
deliberate boundary in order to justify a feature that only seemed necessary because the
boundary was misread.

The rule's own comment gives a narrower rationale — that `suggestedOutput` is a whole file the
human report cannot sensibly display — and it is tempting to argue that this rationale predates
the per-finding `match` field and therefore no longer covers it. That argument is real but
insufficient: the maintainer's intent is that asking for a suggestion is an *agent* act. In
their words:

> "only the agent with `--json` would ask for suggestion, in order to fix a fragment of code."

So the boundary is about **who is asking and why**, not merely about payload size.

## If you want to revisit this

The decision to change is *"should `--suggest` ever produce human-readable output?"* — a
question about the workflow split itself. That is a much larger decision than a report line,
and it should be argued on its own terms, not smuggled in as a rendering enhancement. Anything
that begins "we just need to show X in the human report, so let's allow `--suggest` without
`--json`" has the reasoning inverted.

Note this does **not** apply to `search`, which is populated on every run regardless of
`--suggest` and is correctly rendered in both the human report and the JSON output. The
distinction is not "agent fields are hidden" but "fields that only exist in the agent workflow
have no human-report audience."

## Prior requests

- `wpbg-n9u`: "Surface match in the human report alongside search" — approved as a presence
  indicator (`✎ verified fix available`), fully implemented with 146/146 tests passing, then
  closed `wontfix` when the unreachability was found by running the binary. The branch was
  discarded unmerged. The tests had passed because they called `formatHuman()` directly with a
  constructed report, which no CLI invocation can do.
