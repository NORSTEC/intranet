import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "supabase/.temp/**", "next-env.d.ts"]),
  {
    rules: {
      "@next/next/google-font-display": "off",
      "@next/next/no-page-custom-font": "off",
    },
  },
]);
