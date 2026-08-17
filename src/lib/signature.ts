import crypto from "node:crypto";

/**
 * Проверяет подпись Meta из заголовка x-hub-signature-256.
 * Считать нужно от СЫРОГО тела запроса: любая пересборка JSON ломает подпись.
 */
export function isValidSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header || !header.startsWith("sha256=")) {
    return false;
  }

  const received = header.slice("sha256=".length);
  if (!/^[0-9a-f]+$/i.test(received)) {
    return false;
  }

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}
