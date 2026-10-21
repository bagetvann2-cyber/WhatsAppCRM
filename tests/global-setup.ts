import { PgBoss } from "pg-boss";

/**
 * Схему pg-boss создаём один раз до всех тестов. Иначе на свежей базе (CI,
 * чистая машина) параллельные тестовые файлы стартуют pg-boss одновременно
 * и падают на «тип job_state уже существует».
 * DATABASE_URL приходит из окружения: npm test запускает vitest через dotenv-cli.
 */
export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return;
  }

  const boss = new PgBoss(url);
  boss.on("error", (error) => console.error("pg-boss (globalSetup):", error));
  await boss.start();
  await boss.stop();
}
