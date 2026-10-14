import { defineConfig } from 'vitest/config';

// DOCUMENTS: only test/** is the unit suite — e2e/** specs are Playwright's
// (default vitest include would swallow *.spec.js and run them in node).
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
  },
});
