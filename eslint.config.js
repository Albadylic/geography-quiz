import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * Import-boundary rule (plan §4):
 *   features/ may import engine/
 *   engine/ may import nothing but data/ and lib/
 *
 * Enforced with no-restricted-imports scoped to src/engine so the boundary
 * cannot rot silently. Both alias (`@/features/...`) and relative (`../store`)
 * forms are covered.
 */
const engineForbidden = ['features', 'components', 'store', 'storage', 'routes'];

const engineBoundary = {
  files: ['src/engine/**/*.ts'],
  ignores: ['src/engine/**/*.test.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: engineForbidden.flatMap((dir) => [
              `@/${dir}`,
              `@/${dir}/*`,
              `**/${dir}`,
              `**/${dir}/*`,
            ]),
            message:
              'engine/ is framework-free: it may only import from data/, lib/ and other engine modules (plan §4).',
          },
          {
            group: ['react', 'react-*', 'zustand', 'zustand/*', 'react-dom', 'react-dom/*'],
            message: 'engine/ must contain no framework imports (plan §4).',
          },
        ],
      },
    ],
  },
};

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  engineBoundary,
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
