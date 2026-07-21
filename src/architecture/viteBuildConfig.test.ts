import test from 'node:test';
import assert from 'node:assert/strict';
import viteConfig from '../../vite.config';

test('vite build uses named manual chunks for scalable production bundles', async () => {
  const configFactory = typeof viteConfig === 'function' ? viteConfig : () => viteConfig;
  const config = (await configFactory({ command: 'build', mode: 'production' })) as {
    build?: {
      rollupOptions?: {
        output?: { manualChunks?: unknown } | Array<{ manualChunks?: unknown }>;
      };
    };
  };
  const manualChunks = config.build?.rollupOptions?.output;

  assert.equal(typeof manualChunks, 'object');
  assert.ok(!Array.isArray(manualChunks));

  const output = Array.isArray(manualChunks) ? undefined : manualChunks;
  assert.equal(typeof output?.manualChunks, 'function');
});
