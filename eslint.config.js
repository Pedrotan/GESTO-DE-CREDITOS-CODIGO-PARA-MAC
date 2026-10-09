import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [
    "dist/**", "dist-admin/**", "dist-electron/**", "dist-electron-admin/**",
    "release/**", "release-admin/**", "node_modules/**", "vercel-web/**",
    "**/._*", "tmp/**", "scratch/**"
  ] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unnecessary-type-constraint": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-empty": "off",
      "no-control-regex": "off",
      "no-useless-catch": "off",
      "no-useless-escape": "off",
      "no-extra-boolean-cast": "off",
      "prefer-const": "off",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["src/componentes/ui/**/*.{ts,tsx}", "src/contextos/**/*.{ts,tsx}"],
    rules: {
      // Estes módulos exportam deliberadamente componentes e variantes/hooks partilhados.
      // A regra afeta apenas hot reload de desenvolvimento, não correção ou segurança.
      "react-refresh/only-export-components": "off",
    },
  },
);
