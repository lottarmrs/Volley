import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      '.agents/',
      '.antigravity/',
      // Ambiente isolado do gerador do relatorio de auditoria. O matplotlib empacota .js
      // proprio, que entrava no lint repo-wide como se fosse codigo do projeto.
      'docs/security-audit/.venv/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  reactRefresh.configs.vite,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // O código atual usa `any` em pontos de fronteira (mappers, merge de sync).
      // Mantido como warning para não bloquear; reduzir incrementalmente.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Regras do React Compiler (react-hooks v7): apontam padrões reais
      // (setState síncrono em effect, memoização quebrada), mas a correção
      // muda timing de render. Tratar nas fases de refatoração do App/hooks.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
  {
    // `scripts/**/*.mjs` runs on Node, not in the browser. Without this the repository
    // tooling reports `process`/`console` as undefined in every script.
    files: ['vite.config.ts', '**/*.test.ts', '**/*.dbtest.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
