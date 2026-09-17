// Summarise a boot-timing campaign into the distributions the suite's timeout
// budgets are set from (wpbg-3z1). Reads the JSONL written by src/timing.js.
//
//   npm run analyse:boot -- .scratch/boot-measure/timings.jsonl
//
// Three kinds of process appear in a log, and conflating any two of them
// produces a wrong answer:
//
//   pipeline worker  the vitest worker running pipeline.test.js. Pays the one
//                    in-process boot, in the warm-up hook, then ~141 cheap
//                    steady-state calls. Identified by having a boot AND
//                    steady-state calls.
//   cli worker       the vitest worker running cli.test.js. Imports src/cli.js
//                    for its unit tests and so pays a block-runner *import* —
//                    during vitest's file-import phase, governed by no test
//                    timeout at all. Never boots.
//   CLI child        a wp-block-guard process spawned by a test. May or may
//                    not boot, depending on whether the fixture reaches
//                    Layer 2.
//
// Records written since wpbg-3z1 carry `proc`, which settles this directly.
// Older logs do not, so they are classified positionally — see below — and the
// result is checked against the counts the suite structurally produces.
import fs from 'node:fs';

const [, , logPath = '.scratch/boot-measure/timings.jsonl'] = process.argv;
const records = fs
  .readFileSync(logPath, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const runs = [...new Set(records.map((r) => r.run))].sort();

// Per run, the suite produces: 1 pipeline worker, 1 cli worker, 20 CLI spawns
// from cli.test.js (11 of which boot) and 1 from pipeline.test.js (which
// boots) — so 12 boots and 9 non-booting CLI children. These are asserted, not
// assumed: a deviation means the positional classification below has gone
// wrong, or the suite's shape has changed, and either way the numbers must not
// be published until it is understood.
const EXPECTED = { boots: 12, noBootChildren: 9, workerImports: 1 };

// Floor for a genuine block-runner module evaluation. The import figure is
// measured from src/timing.js's own module-eval timestamp, which is only the
// right anchor while nothing imports it before the adapter does (see the note
// on TIMING_MODULE_LOADED_AT). If something did, the delta collapses toward
// zero — so a reading well under block-runner's ~0.8s floor is not a fast
// import, it is a broken anchor, and the numbers must not be published.
const MIN_CREDIBLE_IMPORT_MS = 300;

function classify(run) {
  const rs = records.filter((r) => r.run === run);
  const byPid = new Map();
  for (const r of rs) {
    if (!byPid.has(r.pid)) byPid.set(r.pid, []);
    byPid.get(r.pid).push(r);
  }

  // A pid does not uniquely identify a process: Windows recycles pids, and
  // over 20 measured runs it did so three times *within a single run*,
  // silently merging two CLI children into one entry and losing a boot sample.
  // Every process emits exactly one `block-runner-import` record, first, so
  // that record is the process boundary — split on it rather than trusting the
  // pid.
  const instances = [];
  for (const [pid, recs] of byPid) {
    let current = null;
    for (const r of recs) {
      if (r.label === 'block-runner-import' || current === null) {
        current = [];
        instances.push([pid, current]);
      }
      current.push(r);
    }
  }

  const procs = instances.map(([pid, recs]) => ({
    pid,
    recs,
    firstTs: new Date(recs[0].ts).getTime(),
    boot: recs.find((r) => r.label === 'first-validate')?.ms,
    import: recs.find((r) => r.label === 'block-runner-import')?.ms,
    steady: recs.filter((r) => r.label === 'steady-state-call').length,
    // Present only in logs written after wpbg-3z1 added it.
    proc: recs[0].proc,
  }));

  const isCliChild = (p) =>
    p.proc ? p.proc.startsWith('wp-block-guard') : null;

  // The pipeline worker is the only process with both a boot and a long tail
  // of steady-state calls; every CLI child validates once or twice and exits.
  const pipelineWorker = procs.filter((p) => p.steady > 10).sort((a, b) => b.steady - a.steady)[0];

  const rest = procs.filter((p) => p !== pipelineWorker);

  // The cli worker: identified by `proc` where available. Otherwise it is the
  // earliest import-only process in the run — it imports during vitest's
  // collection phase, before any test body has had a chance to spawn anything.
  let cliWorker;
  const tagged = rest.filter((p) => isCliChild(p) === false);
  if (tagged.length) {
    cliWorker = tagged.sort((a, b) => a.firstTs - b.firstTs)[0];
  } else {
    cliWorker = rest.filter((p) => p.boot === undefined).sort((a, b) => a.firstTs - b.firstTs)[0];
  }

  const children = rest.filter((p) => p !== cliWorker);
  return { pipelineWorker, cliWorker, children };
}

const stats = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, min: s[0], p50: q(0.5), p90: q(0.9), max: s[s.length - 1] };
};

const fmt = (st) =>
  st
    ? `n=${String(st.n).padStart(4)} min=${(st.min / 1000).toFixed(2)}s p50=${(st.p50 / 1000).toFixed(2)}s ` +
      `p90=${(st.p90 / 1000).toFixed(2)}s max=${(st.max / 1000).toFixed(2)}s`
    : 'no samples';

const buckets = {
  'in-process boot (pipeline worker)': [],
  'child boot (spawned CLI)': [],
  'in-process import (pipeline worker)': [],
  'child import (spawned CLI)': [],
  'cli-worker import (no test budget governs this)': [],
  'steady-state call': [],
};

const anomalies = [];

for (const run of runs) {
  const { pipelineWorker, cliWorker, children } = classify(run);

  if (pipelineWorker?.boot !== undefined) buckets['in-process boot (pipeline worker)'].push(pipelineWorker.boot);
  if (pipelineWorker?.import !== undefined) buckets['in-process import (pipeline worker)'].push(pipelineWorker.import);
  if (cliWorker?.import !== undefined) buckets['cli-worker import (no test budget governs this)'].push(cliWorker.import);

  for (const c of children) {
    if (c.boot !== undefined) buckets['child boot (spawned CLI)'].push(c.boot);
    if (c.import !== undefined) buckets['child import (spawned CLI)'].push(c.import);
  }
  buckets['steady-state call'].push(...records.filter((r) => r.run === run && r.label === 'steady-state-call').map((r) => r.ms));

  const boots = children.filter((c) => c.boot !== undefined).length;
  const noBoot = children.filter((c) => c.boot === undefined).length;
  if (boots !== EXPECTED.boots || noBoot !== EXPECTED.noBootChildren) {
    anomalies.push(`${run}: ${boots} child boots (expected ${EXPECTED.boots}), ${noBoot} non-booting children (expected ${EXPECTED.noBootChildren})`);
  }

  const workerImports = cliWorker?.import === undefined ? 0 : 1;
  if (workerImports !== EXPECTED.workerImports) {
    anomalies.push(`${run}: ${workerImports} cli-worker imports (expected ${EXPECTED.workerImports})`);
  }

  const tooFast = [pipelineWorker, cliWorker, ...children]
    .filter((p) => p?.import !== undefined && p.import < MIN_CREDIBLE_IMPORT_MS);
  if (tooFast.length) {
    anomalies.push(
      `${run}: ${tooFast.length} import reading(s) below ${MIN_CREDIBLE_IMPORT_MS}ms ` +
        `(min ${Math.min(...tooFast.map((p) => p.import))}ms) — anchor in src/timing.js is probably broken`,
    );
  }
}

console.log(`runs: ${runs.length}   records: ${records.length}\n`);
for (const [name, xs] of Object.entries(buckets)) {
  console.log(`${name.padEnd(48)} ${fmt(stats(xs))}`);
}

console.log('\nper-run worst child boot / in-process boot / cli-worker import (s):');
for (const run of runs) {
  const { pipelineWorker, cliWorker, children } = classify(run);
  const boots = children.filter((c) => c.boot !== undefined).map((c) => c.boot);
  const s = (x) => (x === undefined || Number.isNaN(x) ? '—' : (x / 1000).toFixed(2));
  console.log(
    `  ${run}  child=${s(Math.max(...boots)).padStart(6)}  in-proc=${s(pipelineWorker?.boot).padStart(6)}` +
      `  cli-worker-import=${s(cliWorker?.import).padStart(6)}`,
  );
}

if (anomalies.length) {
  console.log('\n!! CLASSIFICATION CHECK FAILED — do not publish these numbers:');
  for (const a of anomalies) console.log(`   ${a}`);
  process.exitCode = 1;
} else {
  console.log(
    `\nclassification check passed: every run has ${EXPECTED.boots} child boots, ` +
      `${EXPECTED.noBootChildren} non-booting children, ${EXPECTED.workerImports} cli-worker import, ` +
      `and no import reading below ${MIN_CREDIBLE_IMPORT_MS}ms.`,
  );
}
