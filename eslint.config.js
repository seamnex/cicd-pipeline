import js from '@eslint/js'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // Una variable sin usar casi siempre es un refactor a medio terminar.
      'no-unused-vars': 'error',
      eqeqeq: 'error',
      'prefer-const': 'error',
    },
  },
]
