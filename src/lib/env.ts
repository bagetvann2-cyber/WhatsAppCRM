function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}. Проверьте .env.local`);
  }
  return value;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  /** Fallback для локальной разработки — на проде секреты канала берутся из базы (Channel). */
  appSecret: () => required("WHATSAPP_APP_SECRET"),
  verifyToken: () => required("WHATSAPP_VERIFY_TOKEN"),
  token: () => required("WHATSAPP_TOKEN"),
  phoneNumberId: () => required("WHATSAPP_PHONE_NUMBER_ID"),
  /** Meta App для Embedded Signup — идёт в браузер, поэтому с префиксом NEXT_PUBLIC_. */
  appId: () => required("NEXT_PUBLIC_WHATSAPP_APP_ID"),
  /** Configuration ID из App Dashboard → WhatsApp → Embedded Signup. Тоже публичный. */
  configId: () => required("NEXT_PUBLIC_WHATSAPP_CONFIG_ID"),
  graphVersion: () => process.env.GRAPH_API_VERSION ?? "v22.0",
  encryptionKey: () => required("ENCRYPTION_KEY"),
  publicBaseUrl: () => process.env.PUBLIC_BASE_URL ?? "",
  /** Где лежат копии вложений. На сервере заказчика это будет отдельный диск. */
  mediaDir: () => process.env.MEDIA_DIR ?? "storage/media",
  /** Потолок размера файла: и на скачивание, и на отправку. */
  mediaMaxBytes: () => Number(process.env.MEDIA_MAX_MB ?? 32) * 1024 * 1024,
};
