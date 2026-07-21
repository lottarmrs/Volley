import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
        '@app': path.resolve(rootDir, 'src/application'),
        '@domain': path.resolve(rootDir, 'src/domain'),
        '@infra': path.resolve(rootDir, 'src/infra'),
        '@ui': path.resolve(rootDir, 'src/ui'),
        '@hooks': path.resolve(rootDir, 'src/hooks'),
        '@logic': path.resolve(rootDir, 'src/logic'),
        '@services': path.resolve(rootDir, 'src/services'),
        '@storage': path.resolve(rootDir, 'src/storage'),
        '@shared/types/community': path.resolve(rootDir, 'src/shared/types/community.ts'),
        '@shared/types/player': path.resolve(rootDir, 'src/shared/types/player.ts'),
        '@shared/types/session': path.resolve(rootDir, 'src/shared/types/session.ts'),
        '@shared/types/sync': path.resolve(rootDir, 'src/shared/types/sync.ts'),
        '@shared/types': path.resolve(rootDir, 'src/types.ts'),
        '@shared/types/': path.resolve(rootDir, 'src/shared/types') + '/',
        '@shared/constants': path.resolve(rootDir, 'src/constants.ts'),
        '@test': path.resolve(rootDir, 'src/test'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'react';
            }
            if (id.includes('node_modules/@supabase')) {
              return 'supabase';
            }
            if (id.includes('node_modules/motion')) {
              return 'motion';
            }
            if (id.includes('node_modules/recharts')) {
              return 'charts';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify this while file watching is disabled during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
