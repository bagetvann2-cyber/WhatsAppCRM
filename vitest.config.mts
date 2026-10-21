import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Схема pg-boss создаётся один раз заранее: см. tests/global-setup.ts.
    globalSetup: ["tests/global-setup.ts"],
    // Тестовые вложения не должны смешиваться с рабочими копиями.
    env: { MEDIA_DIR: "storage/media-test" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
