'use strict';

// ESLint 10 reads only this flat config; .eslintrc.json is no longer supported.
// Same rules as before, translated one for one.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/', 'coverage/', 'portfolio/', 'tests/fixtures/', 'graphify-out/'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },
  {
    // The server and the load generator log on purpose.
    files: ['app.js', 'traffic-gen.js'],
    rules: { 'no-console': 'off' },
  },
];
