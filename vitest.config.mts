import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests cover the pure rules only — the functions that decide what a
 * person *is* from facts already loaded. Anything that reads the database is
 * tested where the rules actually live, in
 * `supabase/tests/database/authorization.test.sql`, against a real Postgres
 * with row level security switched on. Mocking Supabase here would test the
 * mock.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
