import eslint from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const typescriptFiles = [
  "src/**/*.ts",
  "prisma/**/*.ts",
  "tests/**/*.ts",
];

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "node_modules.backup/**",
      "dist/**",
      "coverage/**",
      "src/generated/**",
      "prisma/migrations/**",
      "package-lock.backup.json",
    ],
  },

  /*
   * These rules are safe for both JavaScript and TypeScript.
   */
  eslint.configs.recommended,

  /*
   * Restrict type-aware rules to TypeScript files.
   */
  ...tseslint.configs.recommendedTypeChecked.map(
    (configuration) => ({
      ...configuration,
      files: typescriptFiles,
    }),
  ),

  ...tseslint.configs.stylisticTypeChecked.map(
    (configuration) => ({
      ...configuration,
      files: typescriptFiles,
    }),
  ),

  /*
   * Project TypeScript configuration.
   */
  {
    files: typescriptFiles,

    languageOptions: {
      parser: tseslint.parser,

      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },

      globals: {
        ...globals.node,
      },
    },

    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],

      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/require-await": "error",

      "@typescript-eslint/return-await": [
        "error",
        "in-try-catch",
      ],

      "no-console": [
        "warn",
        {
          allow: ["info", "warn", "error"],
        },
      ],

      "no-duplicate-imports": "error",
      "prefer-const": "error",
      "eqeqeq": ["error", "always"],
    },
  },

  /*
   * Jest globals and test-specific allowances.
   */
  {
    files: ["tests/**/*.ts"],

    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },

    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  /*
   * Configuration files are regular Node.js files and do not
   * need TypeScript's type-aware rules.
   */
  {
    files: ["*.js", "*.cjs", "*.mjs"],

    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  /*
   * Keep this last to prevent formatting-rule conflicts.
   */
  prettierConfig,
);