/**
 * Проверка на старте: без ENCRYPTION_KEY в проде секреты каналов (токены
 * WhatsApp и Telegram) нечем расшифровать — лучше не подняться совсем,
 * чем поднять кабинет, который на первом же запросе к каналу упадёт.
 */
export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const key = process.env.ENCRYPTION_KEY;
  if (!key || Buffer.from(key, "base64").length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY не задан или не 32 байта в base64. Сгенерировать: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
}
