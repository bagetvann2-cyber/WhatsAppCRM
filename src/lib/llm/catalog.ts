import type { ProviderId } from "@/lib/llm/types";

export type ModelInfo = {
  id: string;
  label: string;
  hint: string;
  /** `output_config.effort` есть не у всех моделей: Haiku 4.5 на него отвечает 400. */
  supportsEffort?: boolean;
  /** Можно ли отвечать этой моделью на нашем ключе (иначе только на ключе клиента). */
  platform: boolean;
  /** Цена за 1M токенов в долларах: вход, чтение из кэша, выход. Нет цены: «по тарифу провайдера». */
  priceUsd: { input: number; cached: number; output: number } | null;
};

export type ProviderInfo = {
  label: string;
  baseUrl: string | null;
  /** Куда класть лимит длины ответа: старый `max_tokens` не принимают модели OpenAI с рассуждениями. */
  maxTokensParam: "max_tokens" | "max_completion_tokens";
  keyUrl: string;
  /** Только со своим ключом: у платформы нет ключа этого провайдера. */
  ownKeyOnly?: boolean;
};

export const PROVIDER_INFO: Record<ProviderId, ProviderInfo> = {
  ANTHROPIC: { label: "Claude", baseUrl: null, maxTokensParam: "max_tokens", keyUrl: "https://console.anthropic.com/settings/keys" },
  OPENAI: { label: "ChatGPT", baseUrl: "https://api.openai.com/v1", maxTokensParam: "max_completion_tokens", keyUrl: "https://platform.openai.com/api-keys" },
  GEMINI: { label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", maxTokensParam: "max_tokens", keyUrl: "https://aistudio.google.com/apikey" },
  OPENROUTER: { label: "Другая нейросеть (OpenRouter)", baseUrl: "https://openrouter.ai/api/v1", maxTokensParam: "max_tokens", keyUrl: "https://openrouter.ai/keys", ownKeyOnly: true },
};

// Цены сверены 2026-09-19 со страницами провайдеров. Что id действительно отвечают,
// подтверждает `npm run ai-bench`. Первая «платформенная» модель провайдера — модель по умолчанию.
export const MODELS: Record<ProviderId, ModelInfo[]> = {
  ANTHROPIC: [
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — самый дешёвый", hint: "Для простых сценариев: часы работы, адрес, наличие.", supportsEffort: false, platform: true, priceUsd: { input: 1, cached: 0.1, output: 5 } },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5 — баланс", hint: "Заметно дешевле Opus при почти том же качестве.", supportsEffort: true, platform: true, priceUsd: { input: 2, cached: 0.2, output: 10 } },
    { id: "claude-opus-5", label: "Claude Opus 5 — самый способный", hint: "Дороже, но лучше держит сложные разговоры о ценах и условиях.", supportsEffort: true, platform: false, priceUsd: { input: 5, cached: 0.5, output: 25 } },
  ],
  OPENAI: [
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna — дешёвая", hint: "Быстрые ответы на типовые вопросы.", platform: true, priceUsd: { input: 0.2, cached: 0.02, output: 1.2 } },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra — баланс", hint: "Лучше держит длинные и сложные разговоры.", platform: false, priceUsd: { input: 2, cached: 0.2, output: 12 } },
  ],
  GEMINI: [
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite — дешёвая", hint: "Быстрые ответы на типовые вопросы.", platform: true, priceUsd: { input: 0.25, cached: 0.025, output: 1.5 } },
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash — баланс", hint: "Лучше держит длинные и сложные разговоры.", platform: false, priceUsd: { input: 0.75, cached: 0.075, output: 3.75 } },
  ],
  OPENROUTER: [],
};

export function findModel(provider: ProviderId, id: string): ModelInfo | undefined {
  return MODELS[provider].find((model) => model.id === id);
}

/** Модель по умолчанию на нашем ключе. */
export function defaultModel(provider: ProviderId): string | null {
  return MODELS[provider].find((model) => model.platform)?.id ?? null;
}

/** `null` в базе на нашем ключе означает «модель каталога по умолчанию». */
export function resolveModel(provider: ProviderId, stored: string | null): string | null {
  return stored ?? defaultModel(provider);
}

/** Стоимость вызова в долларах; `null`, если цены модели нет в каталоге. */
export function costUsd(
  provider: ProviderId,
  modelId: string,
  usage: { input: number; cached: number; output: number },
): number | null {
  const price = findModel(provider, modelId)?.priceUsd;
  if (!price) {
    return null;
  }
  const fresh = usage.input - usage.cached;
  return (fresh * price.input + usage.cached * price.cached + usage.output * price.output) / 1_000_000;
}
