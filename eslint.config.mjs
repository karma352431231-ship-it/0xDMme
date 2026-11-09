import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const responsibilityRules = {
  complexity: ['error', 10],
  'max-depth': ['error', 3],
  'max-params': ['error', 4],
};

export default defineConfig(
  // Private runtime, temporary diagnostics and captures are not product source.
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.local/**',
      // Capacitor copies compiled assets/bridge code here; sources stay checked.
      'mobile/android/app/src/main/assets/**',
      'mobile/android/app/build/**',
      'mobile/android/capacitor-android/build/**',
      'mobile/android/capacitor-cordova-android-plugins/**',
      'mobile/ios/App/App/public/**',
      'mobile/ios/capacitor-cordova-ios-plugins/**',
    ],
  },
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
    rules: {
      ...responsibilityRules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.{1,2}/.*(?<!\\.ts)$',
              message:
                'Imports relativos de código TypeScript precisam de extensão .ts para a execução nativa no Node.',
            },
          ],
        },
      ],
    },
  },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
);
