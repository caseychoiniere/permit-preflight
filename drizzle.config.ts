import { defineConfig } from "drizzle-kit";

// Reads DATABASE_URL only when a migration command actually runs (db:generate/db:migrate),
// never at test time.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
