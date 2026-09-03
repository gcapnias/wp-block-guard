import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    // block-runner spawns a real headless-Gutenberg process per validation
    // call, which is slower than vitest's 5s default, especially in CI or on
    // a cold cache.
    testTimeout: 20000,
    // .claude/worktrees/* are full nested checkouts (each with their own
    // tests/*.test.js) used for isolated agent work. Vitest's defaults don't
    // exclude them, so without this they get discovered and run alongside
    // this checkout's own tests.
    exclude: [...configDefaults.exclude, '.claude/worktrees/**'],
  },
});
