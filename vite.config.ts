import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@app': path.resolve(__dirname, 'src/application'),
        '@domain': path.resolve(__dirname, 'src/domain'),
        '@infra': path.resolve(__dirname, 'src/infra'),
        '@ui': path.resolve(__dirname, 'src/ui'),
        '@hooks': path.resolve(__dirname, 'src/hooks'),
        '@logic': path.resolve(__dirname, 'src/logic'),
        '@services': path.resolve(__dirname, 'src/services'),
        '@storage': path.resolve(__dirname, 'src/storage'),
        '@shared/types/community': path.resolve(__dirname, 'src/shared/types/community.ts'),
        '@shared/types/sync': path.resolve(__dirname, 'src/shared/types/sync.ts'),
        '@shared/types': path.resolve(__dirname, 'src/types.ts'),
        '@shared/types/': path.resolve(__dirname, 'src/shared/types') + '/',
        '@shared/constants': path.resolve(__dirname, 'src/constants.ts'),
        '@test': path.resolve(__dirname, 'src/test'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify this while file watching is disabled during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
