import { defineConfig } from 'vitest/config';

/**
 * Pure unit tests only. Anything that needs a real canvas (glyph rasterisation,
 * RTL layout, golden images) runs in Chromium through `npm run test:browser`,
 * because Node has no font stack and a fake canvas would silently change what
 * the renderer actually draws.
 */
export default defineConfig({
  test: {
    include: [
      'src/**/*.{test,spec}.ts',
      'packages/**/*.{test,spec}.ts',
      'api/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.ts',
    ],
    environment: 'node',
    restoreMocks: true,
    // Tests never touch the network: every API payload comes from
    // tests/fixtures. Fail loudly if something reaches for it anyway.
    unstubEnvs: true,
  },
});
