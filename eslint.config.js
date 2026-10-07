import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      'assets/**',
      'index.html',
      'app/src/vendor/**',
      'node_modules/**',
      'test-results/**',
      'dist/**',
      'app/dist/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['app/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, __APP_BRANCH__: 'readonly', __APP_BUILD_TIME__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'prefer-const': 'error',
      'one-var': ['error', 'never'],
      'no-var': 'error',
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js'],
    // Tests also contain callbacks that Playwright runs in the page (page.evaluate).
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
