export const PROVIDERS = ["ANTHROPIC", "OPENAI", "GEMINI", "OPENROUTER"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

/** Инструмент в нейтральном виде: каждый адаптер переводит его в свой формат. */
export type ToolDef = {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type ToolChoice = "auto" | "required" | { name: string };

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

export type Usage = {
  /** Все входные токены, включая прочитанные из кэша и записанные в него. */
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
};

export type LlmRequest = {
  model: string;
  system: string;
  messages: ChatTurn[];
  tools?: ToolDef[];
  toolChoice?: ToolChoice;
  maxTokens: number;
  /**
   * Модель ответила только вызовом инструмента (текста нет). Если ни один из
   * `skipIfCalled` не вызван, адаптер сам отправляет ей результат `ack` по каждому
   * вызову и берёт текст из второго ответа. Второй проход живёт в адаптере:
   * продолжать диалог надо исходным сообщением модели, а у провайдеров оно разное.
   */
  followUp?: { ack: string; skipIfCalled: string[] };
};

export type LlmResult = {
  text: string | null;
  toolCalls: ToolCall[];
  usage: Usage;
  finish: "stop" | "tool" | "length" | "other";
};

/** Что адаптеру нужно знать о вызове, кроме самого запроса. */
export type CallContext = {
  apiKey: string;
  /** Ключ клиента: от этого зависит, чья это проблема, если ключ не принят. */
  ownKey: boolean;
  signal: AbortSignal;
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    cached: a.cached + b.cached,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    output: a.output + b.output,
  };
}

/** Нужен ли второй проход: одни вызовы инструментов, текста нет, передачи оператору нет. */
export function needsFollowUp(req: LlmRequest, result: LlmResult): boolean {
  const followUp = req.followUp;
  return (
    followUp !== undefined &&
    !result.text &&
    result.toolCalls.length > 0 &&
    !result.toolCalls.some((call) => followUp.skipIfCalled.includes(call.name))
  );
}
