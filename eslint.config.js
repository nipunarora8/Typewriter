import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    ignores: [
      'dist/**',
      'src-tauri/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
)
