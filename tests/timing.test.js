import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { recordTiming } from '../src/timing.js';

// src/timing.js is diagnostic instrumentation, so the property that matters
// most is the one asserted first: with WPBG_TIMING_LOG unset — every ordinary
// run, including every user's — it does nothing at all and touches no disk.

const tmpFiles = [];
const tmpLog = () => {
  const p = path.join(os.tmpdir(), `wpbg-timing-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  tmpFiles.push(p);
  return p;
};

afterEach(() => {
  delete process.env.WPBG_TIMING_LOG;
  delete process.env.WPBG_TIMING_RUN;
  while (tmpFiles.length) {
    const p = tmpFiles.pop();
    try {
      fs.unlinkSync(p);
    } catch {
      // never existed — that is the assertion in the no-op case, not a failure
    }
  }
});

describe('recordTiming', () => {
  it('writes nothing when WPBG_TIMING_LOG is unset', () => {
    const log = tmpLog();
    delete process.env.WPBG_TIMING_LOG;
    recordTiming('boot', 1234);
    expect(fs.existsSync(log)).toBe(false);
  });

  it('appends one JSON record per call when WPBG_TIMING_LOG is set', () => {
    const log = tmpLog();
    process.env.WPBG_TIMING_LOG = log;
    recordTiming('block-runner-import', 1100);
    recordTiming('first-validate', 9500);

    const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const records = lines.map((l) => JSON.parse(l));
    expect(records[0].label).toBe('block-runner-import');
    expect(records[0].ms).toBe(1100);
    expect(records[1].label).toBe('first-validate');
    expect(records[1].ms).toBe(9500);
  });

  it('tags each record with the pid and run id so parent and child are separable', () => {
    const log = tmpLog();
    process.env.WPBG_TIMING_LOG = log;
    process.env.WPBG_TIMING_RUN = 'run-07';
    recordTiming('first-validate', 42);

    const record = JSON.parse(fs.readFileSync(log, 'utf8').trim());
    expect(record.pid).toBe(process.pid);
    expect(record.run).toBe('run-07');
    expect(typeof record.ts).toBe('string');
  });

  it('never throws when the log path is unwritable', () => {
    // Instrumentation must not be able to fail a run it is only observing.
    process.env.WPBG_TIMING_LOG = path.join(os.tmpdir(), 'wpbg-no-such-dir-xyz', 'nested', 'log.jsonl');
    expect(() => recordTiming('boot', 1)).not.toThrow();
  });
});
