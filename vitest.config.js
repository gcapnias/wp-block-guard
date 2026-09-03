import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // block-runner boots a real headless-Gutenberg (jsdom + @wordpress/*)
    // environment in-process per validation call, which is slower than
    // vitest's 5s default, especially in CI or on a cold cache.
    testTimeout: 20000,
  },
});
