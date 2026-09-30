import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const responsibilityRules = {
  complexity: ['error', 10],
  'max-depth': ['error', 3],
  'max-params': ['error', 4],
};

export default defineConfig(
  { ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**'] },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    rules: responsibilityRules,
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { globals: { module: 'readonly' } },
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: responsibilityRules,
  },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
);
