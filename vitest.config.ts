import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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
      '@shared/types/player': path.resolve(__dirname, 'src/shared/types/player.ts'),
      '@shared/types/session': path.resolve(__dirname, 'src/shared/types/session.ts'),
      '@shared/types/sync': path.resolve(__dirname, 'src/shared/types/sync.ts'),
      '@shared/types': path.resolve(__dirname, 'src/types.ts'),
      '@shared/types/': path.resolve(__dirname, 'src/shared/types') + '/',
      '@shared/constants': path.resolve(__dirname, 'src/constants.ts'),
      '@test': path.resolve(__dirname, 'src/test'),
    },
  },
  test: {
    environment: 'jsdom',
    // globals: o auto-cleanup do Testing Library procura afterEach no escopo
    // global para desmontar o DOM entre testes; sem isso, renders vazam de um
    // teste para o outro.
    globals: true,
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
