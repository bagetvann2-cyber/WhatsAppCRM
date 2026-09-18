export type LlmErrorCode =
  | "auth"
  | "quota"
  | "rate_limit"
  | "model"
  | "bad_request"
  | "unavailable"
  | "timeout"
  | "empty"
  | "length"
  | "config";

/** Чья это проблема: клиента (его ключ) или наша (наш ключ, провайдер, код). */
export type LlmErrorOwner = "client" | "platform";

const MESSAGES: Record<LlmErrorCode, string> = {
  auth: "Ключ нейросети не принят.",
  quota: "На счёте у провайдера нейросети закончились деньги.",
  rate_limit: "Слишком много запросов к нейросети, попробуйте через минуту.",
  model: "Модель недоступна у провайдера.",
  bad_request: "Нейросеть отклонила запрос.",
  unavailable: "Нейросеть временно недоступна.",
  timeout: "Нейросеть не ответила вовремя.",
  empty: "Нейросеть вернула пустой ответ.",
  length: "Ответ нейросети оборвался на лимите длины.",
  config: "Нейросеть не подключена.",
};

// Проблему ключа чинит тот, чей это ключ. Остальное наше: сбой провайдера, код, пустой ответ.
const CLIENT_IF_OWN_KEY: LlmErrorCode[] = ["auth", "quota", "rate_limit", "model"];

/**
 * Единственная ошибка, которая выходит из слоя. Текст сообщения собран из нашего
 * словаря, а не из ответа провайдера: тот может содержать кусок ключа.
 */
export class LlmError extends Error {
  readonly owner: LlmErrorOwner;

  constructor(
    readonly code: LlmErrorCode,
    ownKey: boolean,
    readonly status?: number,
    readonly providerCode?: string,
    readonly retryAfterMs?: number,
  ) {
    super(MESSAGES[code]);
    this.name = "LlmError";
    this.owner = ownKey && CLIENT_IF_OWN_KEY.includes(code) ? "client" : "platform";
  }
}

/** Статус и код ошибки провайдера → наш код. Тексты провайдеров не разбираем, кроме одного известного. */
export function classify(status: number, providerCode?: string, message = ""): LlmErrorCode {
  const code = providerCode ?? "";

  if (status === 401 || status === 403 || code === "API_KEY_INVALID" || code === "invalid_api_key") {
    return "auth";
  }
  if (status === 402 || code === "insufficient_quota" || message.toLowerCase().includes("credit balance")) {
    return "quota";
  }
  if (status === 404 || code === "model_not_found") {
    return "model";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status === 408 || status >= 500) {
    return "unavailable";
  }
  return "bad_request";
}

/** Вырезает всё, что похоже на ключ, из текста, который уходит в лог. */
export function redact(text: string): string {
  return text
    .replace(/sk-[\w-]{8,}/g, "sk-***")
    .replace(/AIza[\w-]{8,}/g, "AIza***")
    .replace(/Bearer\s+[\w.-]{8,}/gi, "Bearer ***");
}

/** Ошибка сети или таймаут вызова → наша. Всё остальное пробрасывается как есть. */
export function fromThrown(error: unknown, ownKey: boolean): unknown {
  if (error instanceof LlmError) {
    return error;
  }
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError" || name === "APIConnectionTimeoutError") {
    return new LlmError("timeout", ownKey);
  }
  if (name === "TypeError" || name === "APIConnectionError") {
    return new LlmError("unavailable", ownKey);
  }
  return error;
}
