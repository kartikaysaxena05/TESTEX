import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/build/**',
      '**/out/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Architectural Rule: Renderer Boundary Isolation
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@ai-quality/core',
              message:
                'Renderer boundary violation: Renderer is an unprivileged UI layer and must not import @ai-quality/core.',
            },
            {
              name: '@prisma/client',
              message:
                'Renderer boundary violation: Renderer must not import Prisma ORM client directly.',
            },
            {
              name: 'prisma',
              message:
                'Renderer boundary violation: Renderer must not import Prisma CLI or modules.',
            },
            {
              name: 'electron',
              message:
                'Renderer boundary violation: Renderer must not import Electron directly. Use typed window.desktop bridge APIs.',
            },
            {
              name: 'electron/renderer',
              message: 'Renderer must not import Electron renderer modules directly.',
            },
            {
              name: 'electron/main',
              message: 'Renderer must not import Electron main process modules.',
            },
            {
              name: 'fs',
              message: 'Renderer boundary violation: Renderer must not import Node fs.',
            },
            {
              name: 'node:fs',
              message: 'Renderer boundary violation: Renderer must not import Node fs.',
            },
            {
              name: 'path',
              message: 'Renderer boundary violation: Renderer must not import Node path.',
            },
            {
              name: 'node:path',
              message: 'Renderer boundary violation: Renderer must not import Node path.',
            },
            {
              name: 'child_process',
              message: 'Renderer boundary violation: Renderer must not import child_process.',
            },
            {
              name: 'node:child_process',
              message: 'Renderer boundary violation: Renderer must not import child_process.',
            },
            {
              name: 'os',
              message: 'Renderer boundary violation: Renderer must not import Node os.',
            },
            {
              name: 'node:os',
              message: 'Renderer boundary violation: Renderer must not import Node os.',
            },
            {
              name: 'net',
              message: 'Renderer boundary violation: Renderer must not import Node net.',
            },
            {
              name: 'node:net',
              message: 'Renderer boundary violation: Renderer must not import Node net.',
            },
            {
              name: 'process',
              message: 'Renderer boundary violation: Renderer must not import Node process.',
            },
            {
              name: 'node:process',
              message: 'Renderer boundary violation: Renderer must not import Node process.',
            },
          ],
          patterns: [
            {
              group: ['node:*', 'node:*/**'],
              message: 'Renderer must not import Node.js built-ins.',
            },
            {
              group: ['@ai-quality/core', '@ai-quality/core/**'],
              message: 'Renderer must not import @ai-quality/core.',
            },
            {
              group: ['@prisma/client', '@prisma/client/**', 'prisma', 'prisma/**'],
              message: 'Renderer must not import Prisma.',
            },
            {
              group: ['electron', 'electron/**'],
              message: 'Renderer must not import Electron modules.',
            },
          ],
        },
      ],
    },
  },
  // Architectural Rule: Preload Boundary Isolation
  {
    files: ['apps/desktop/src/preload/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@ai-quality/core',
              message:
                'Preload boundary violation: Preload must not import @ai-quality/core. It communicates with main via typed contracts.',
            },
            {
              name: '@prisma/client',
              message: 'Preload must not import Prisma ORM client.',
            },
            {
              name: 'prisma',
              message: 'Preload must not import Prisma.',
            },
          ],
          patterns: [
            {
              group: ['@ai-quality/core', '@ai-quality/core/**'],
              message: 'Preload must not import @ai-quality/core.',
            },
            {
              group: ['@prisma/client', '@prisma/client/**', 'prisma', 'prisma/**'],
              message: 'Preload must not import Prisma.',
            },
          ],
        },
      ],
    },
  },
  // Architectural Rule: Contracts Neutrality Isolation
  {
    files: ['packages/contracts/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@ai-quality/core',
              message: 'Contracts must remain platform-neutral and cannot import @ai-quality/core.',
            },
            {
              name: '@prisma/client',
              message: 'Contracts must remain platform-neutral and cannot import Prisma.',
            },
            {
              name: 'prisma',
              message: 'Contracts must remain platform-neutral and cannot import Prisma.',
            },
            {
              name: 'electron',
              message: 'Contracts must remain platform-neutral and cannot import Electron.',
            },
          ],
          patterns: [
            {
              group: ['node:*', 'node:*/**'],
              message:
                'Contracts must remain platform-neutral and cannot import Node.js built-ins.',
            },
            {
              group: ['@ai-quality/core', '@ai-quality/core/**'],
              message: 'Contracts must not import @ai-quality/core.',
            },
            {
              group: ['@prisma/client', '@prisma/client/**', 'prisma', 'prisma/**'],
              message: 'Contracts must not import Prisma.',
            },
            {
              group: ['electron', 'electron/**'],
              message: 'Contracts must not import Electron.',
            },
          ],
        },
      ],
    },
  },
  // Architectural Rule: Core Domain UI Isolation
  {
    files: ['packages/core/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'Core is a privileged domain layer and must not import React.',
            },
            {
              name: 'react-dom',
              message: 'Core is a privileged domain layer and must not import React DOM.',
            },
          ],
          patterns: [
            {
              group: ['react', 'react/**', 'react-dom', 'react-dom/**'],
              message: 'Core must not import UI frameworks.',
            },
            {
              group: ['@ai-quality/desktop', '@ai-quality/desktop/**'],
              message: 'Core must not import the desktop app presentation layer.',
            },
          ],
        },
      ],
    },
  },
);
