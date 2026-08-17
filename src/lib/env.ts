function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}. Проверьте .env.local`);
  }
  return value;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  appSecret: () => required("WHATSAPP_APP_SECRET"),
  verifyToken: () => required("WHATSAPP_VERIFY_TOKEN"),
  token: () => required("WHATSAPP_TOKEN"),
  phoneNumberId: () => required("WHATSAPP_PHONE_NUMBER_ID"),
  graphVersion: () => process.env.GRAPH_API_VERSION ?? "v22.0",
};
