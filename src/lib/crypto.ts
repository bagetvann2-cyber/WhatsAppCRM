import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Ключ шифрования секретов канала. 32 байта в base64 — сгенерировать:
 * node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Не задан ENCRYPTION_KEY — шифрование секретов канала недоступно.");
  }

  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY должен быть 32 байтами в base64.");
  }
  return buf;
}

/** Токены каналов шифруются так же, где бы их ни хранили. Формат: v1:iv:tag:data. */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

/** Повреждённые или подделанные данные бросают ошибку — тихо отдавать мусор нельзя. */
export function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Повреждённые зашифрованные данные: неверный формат.");
  }

  const [, ivPart, tagPart, dataPart] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Повреждённые зашифрованные данные: не удалось расшифровать.");
  }
}

/** Секреты канала — это всегда объект (токен, id и т.п.) — удобнее хранить и читать как JSON. */
export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T;
}
