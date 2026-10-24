import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/', '**/test-results/', '**/playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*/vitest.config.mts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Express error handlers need all four parameters; unused ones start with `_`.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
    languageOptions: { globals: globals.browser },
  },
);
