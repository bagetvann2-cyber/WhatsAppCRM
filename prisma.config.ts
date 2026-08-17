import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Секреты держим только в .env.local — Prisma CLI сама его не читает, подгружаем явно.
dotenv.config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
