import tsPlugin from "@typescript-eslint/eslint-plugin";
import { defineConfig } from "eslint/config";
import prettierConfig from "eslint-config-prettier";
import obsidianPlugin from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "**/*.mjs",
      "**/*.test.ts",
      "**/*.test.tsx",
      "src/test/**",
      "vitest.config.ts",
    ],
  },
  ...obsidianPlugin.configs.recommended,
  {
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
    rules: {
      "semi": ["error", "always"],
      "quotes": ["error", "double"],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  prettierConfig,
]);