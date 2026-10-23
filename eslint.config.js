import tsparser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierConfig from "eslint-config-prettier";
import obsidianPlugin from "eslint-plugin-obsidianmd";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "**/*.test.ts", "**/*.test.tsx"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "obsidianmd": obsidianPlugin,
    },
    rules: {
      ...obsidianPlugin.ruleConfigs.recommended,
      "semi": ["error", "always"],
      "quotes": ["error", "double"],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  prettierConfig,
];