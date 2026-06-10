import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // globals: o auto-cleanup do Testing Library procura afterEach no escopo
    // global para desmontar o DOM entre testes; sem isso, renders vazam de um
    // teste para o outro.
    globals: true,
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
