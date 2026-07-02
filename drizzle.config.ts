import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Read directly here: drizzle-kit is build/CLI tooling, not the app runtime.
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
