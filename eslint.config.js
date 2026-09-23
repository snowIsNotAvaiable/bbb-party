import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

/**
 * Drei Umgebungen in einem Projekt: der Server läuft in Node, der Client im
 * Browser, die Skripte wieder in Node. Deshalb drei Blöcke statt einer
 * Sammelkonfiguration mit allen Globals überall.
 *
 * `eslint-config-prettier` steht am Ende und schaltet alle Regeln ab, die sich
 * mit dem Formatter streiten würden. Über Anführungszeichen und Einrückung
 * entscheidet Prettier, nicht ESLint.
 */

const gemeinsam = {
  // Absichtlich leere catch-Blöcke gibt es im Projekt oft: ein fehlgeschlagener
  // localStorage-Zugriff oder ein Schreibfehler beim Aufräumen darf den Abend
  // nicht stoppen. Sie sind jedes Mal kommentiert.
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  eqeqeq: ['error', 'smart'],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-console': 'off',
};

export default [
  {
    ignores: ['client/dist/**', 'node_modules/**', '.probelauf/**', 'server/data/**'],
  },

  js.configs.recommended,

  // Server und Skripte: Node
  {
    files: ['server/**/*.js', 'scripts/**/*.mjs', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: gemeinsam,
  },

  // Client: Browser plus React
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '18.3' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.flat.recommended.rules,
      ...gemeinsam,
      // Das Projekt nutzt kein TypeScript und keine prop-types. Die Komponenten
      // sind klein und werden an genau einer Stelle benutzt; eine zweite
      // Typdeklaration daneben wäre Pflege ohne Nutzen.
      'react/prop-types': 'off',
      // Die Oberfläche ist deutsch. Typografische Anführungszeichen („…") und
      // Apostrophe („Bevor's") sind hier normale Satzzeichen, keine vergessenen
      // Escapes. Mehrdeutig sind nur die Klammerzeichen, und die bleiben
      // verboten.
      'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
    },
  },

  prettier,
];
