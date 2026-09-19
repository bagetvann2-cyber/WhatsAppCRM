import { HANDOFF_TOOL } from "@/lib/ai-client";
import { LlmError, complete } from "@/lib/llm";
import { PROVIDER_INFO } from "@/lib/llm/catalog";
import type { LlmErrorCode } from "@/lib/llm/errors";
import type { ProviderId, Usage } from "@/lib/llm/types";

export type ProbeResult =
  | { ok: true; usage: Usage }
  | { ok: false; code: LlmErrorCode | "no-tools"; message: string };

// Что сказать владельцу по каждому исходу пробного вызова (Д8, Х4).
const MESSAGES: Partial<Record<LlmErrorCode, string>> = {
  auth: "Ключ недействителен.",
  quota: "На счёте у провайдера нет денег: пополните баланс и повторите.",
  rate_limit: "Лимит частоты у провайдера, попробуйте через минуту.",
  model: "Такой модели нет у провайдера: проверьте её название.",
  bad_request: "Провайдер отклонил запрос: проверьте название модели, она должна уметь вызывать инструменты.",
  unavailable: "Провайдер не отвечает, попробуйте позже.",
  timeout: "Провайдер не отвечает, попробуйте позже.",
};

/** Пробелы, кавычки и переводы строк по краям: ключ часто копируют вместе с ними. */
export function normalizeKey(raw: string): string {
  return raw.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

/** По префиксу видно, что вставили ключ другого провайдера: `null`, если префикс не подсказывает ничего. */
export function guessProvider(key: string): ProviderId | null {
  if (key.startsWith("sk-ant-")) return "ANTHROPIC";
  if (key.startsWith("sk-or-")) return "OPENROUTER";
  if (key.startsWith("AIza")) return "GEMINI";
  if (key.startsWith("sk-")) return "OPENAI";
  return null;
}

export function mismatchMessage(provider: ProviderId, key: string): string | null {
  const guessed = guessProvider(key);
  if (!guessed || guessed === provider) {
    return null;
  }
  return `Похоже, это ключ ${PROVIDER_INFO[guessed].label}, а выбрано ${PROVIDER_INFO[provider].label}.`;
}

/**
 * Один короткий вызов выбранной модели с принудительным вызовом инструмента передачи оператору:
 * так проверяются и сам ключ, и то, что модель умеет вызывать инструменты. Без этого бот на
 * модели без инструментов отвечал бы сам про цены, которых нет в анкете. Стоит меньше цента.
 */
export async function probeKey(provider: ProviderId, apiKey: string, model: string): Promise<ProbeResult> {
  try {
    const result = await complete(
      {
        model,
        system: "Проверка связи. Клиент просит позвать человека: передайте диалог.",
        messages: [{ role: "user", text: "Позовите менеджера." }],
        tools: [HANDOFF_TOOL],
        toolChoice: { name: HANDOFF_TOOL.name },
        // С запасом: модели с рассуждениями тратят часть лимита до вызова инструмента.
        maxTokens: 1024,
      },
      { provider, apiKey, ownKey: true, deadlineMs: 20_000 },
    );

    if (!result.toolCalls.some((call) => call.name === HANDOFF_TOOL.name)) {
      return { ok: false, code: "no-tools", message: "Эта модель не умеет передавать диалог оператору: выберите другую." };
    }
    return { ok: true, usage: result.usage };
  } catch (error) {
    const code: LlmErrorCode = error instanceof LlmError ? error.code : "unavailable";
    return { ok: false, code, message: MESSAGES[code] ?? "Не удалось проверить ключ." };
  }
}
