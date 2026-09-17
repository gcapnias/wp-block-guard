#!/usr/bin/env bash
# Re-measure block-runner's start-up costs (wpbg-3z1).
#
#   npm run measure:boot            # 10 runs into .scratch/boot-measure
#   npm run measure:boot -- 20 tag  # 20 runs into .scratch/<tag>
#   npm run analyse:boot -- .scratch/boot-measure/timings.jsonl
#
# Runs the full suite N times with src/timing.js instrumentation enabled, so
# every block-runner import and every first validate() — in this process and in
# each CLI child that tests/cli.test.js spawns — is recorded to one JSONL file.
#
# This exists so the boot timeout budgets in tests/pipeline.test.js and
# tests/cli.test.js can be re-derived rather than trusted. They were previously
# set from an ad-hoc probe whose numbers nobody could reproduce, and two of them
# contradicted each other.
#
# Run it from the main checkout on an otherwise idle machine, and expect it to
# occupy that machine for roughly N x 2.5 minutes. Note that the budgets in
# force during the run will truncate any stall that exceeds them: to measure a
# tail rather than confirm a budget, raise those constants first.
set -u

N="${1:-10}"
TAG="${2:-boot-measure}"
OUT=".scratch/${TAG}"
mkdir -p "$OUT"

export WPBG_TIMING_LOG="$PWD/$OUT/timings.jsonl"
: > "$WPBG_TIMING_LOG"

for i in $(seq 1 "$N"); do
  export WPBG_TIMING_RUN="$(printf 'run-%02d' "$i")"
  start=$(date +%s)
  npx vitest run > "$OUT/$WPBG_TIMING_RUN.txt" 2>&1
  status=$?
  end=$(date +%s)
  printf '%s status=%s wall=%ss\n' "$WPBG_TIMING_RUN" "$status" "$((end - start))" \
    | tee -a "$OUT/summary.txt"
done

echo "done: $OUT"
