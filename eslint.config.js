// ESLint flat config: errors-only and hand-picked. Every rule is here because
// it catches a class of bug, not because it enforces a style, which is
// Prettier's job. Nothing is set to "warn": a warning is a lint result nobody
// acts on.
//
// The type-aware rules are the reason this config is worth its slowness. They
// need the parser to see the tsconfig, hence `projectService: true`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    // .vite is the dev server's dependency cache: prebundled third-party code
    // that appears only after `npm run dev` and is never ours to lint.
    ignores: [
      'dist/**',
      '.vite/**',
      'node_modules/**',
      'public/data/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },

  js.configs.recommended,

  // Build-time scripts and Playwright specs: Node, not the browser.
  {
    files: ['scripts/**/*.ts', 'e2e/**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },

  // Type-aware linting over the application source.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // ── Promise correctness ── the highest-leverage rules here. Nearly every
      // async path in this app (index fetch, bucket listing, clipboard write) is
      // wired to a user event, which is exactly what these catch.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      // `checksVoidReturn.attributes: false` is deliberate. Without it the rule
      // fires on every `onClick={async () => …}`, and the usual "fix" is to turn
      // the whole rule off, which loses the cases that matter.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      // ── Type-aware bug catchers ──
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/no-confusing-non-null-assertion': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/restrict-plus-operands': 'error',

      // ── Consistency / intent ──
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/non-nullable-type-assertion-style': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-unused-vars': 'off',

      // ── React correctness, same errors-only philosophy ──
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // ── Accessibility: the design specifies WCAG AA, so lint what can be linted ──
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',

      // ── Core JS, narrow and high-signal ──
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-debugger': 'error',
      'no-throw-literal': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // Defer every stylistic rule to Prettier.
  prettierConfig,
);
