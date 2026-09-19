import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { LlmError } from "@/lib/llm/errors";
import type { ProviderId } from "@/lib/llm/types";

const REPEAT_MS = 60 * 60 * 1000;
// Проблемы, которые чинит только владелец платформы: ключ, счёт, снятая модель, ключ не задан.
const PLATFORM_CODES = ["auth", "quota", "model", "config"];

// Память процесса: воркер один, после рестарта уйдёт максимум одно лишнее письмо.
const lastSent = new Map<string, number>();

/**
 * Наш ключ нейросети сломался: бот молчит у всех клиентов на этом провайдере, а строку
 * в логе воркера никто не читает. Пишем владельцу платформы не чаще раза в час на
 * пару «провайдер + код».
 */
export async function alertPlatformError(provider: ProviderId, error: unknown): Promise<void> {
  if (!(error instanceof LlmError) || error.owner !== "platform" || !PLATFORM_CODES.includes(error.code)) {
    return;
  }

  console.error(`llm_platform_error provider=${provider} code=${error.code} status=${error.status ?? "-"}`);

  const to = env.platformAlertEmail();
  const key = `${provider}:${error.code}`;
  if (!to || Date.now() - (lastSent.get(key) ?? 0) < REPEAT_MS) {
    return;
  }
  lastSent.set(key, Date.now());

  try {
    await sendEmail(
      to,
      `Нейросеть ${provider}: ${error.code}`,
      `<p>Бот не отвечает клиентам на нашем ключе ${provider}: ${error.message} (код ${error.code}, статус ${error.status ?? "—"}).</p><p>Проверьте ключ и баланс у провайдера. Повторное письмо придёт не раньше чем через час.</p>`,
    );
  } catch (mailError) {
    console.error("alert_email_failed", mailError instanceof Error ? mailError.message : "");
  }
}

/** Для тестов. */
export function resetAlerts(): void {
  lastSent.clear();
}
