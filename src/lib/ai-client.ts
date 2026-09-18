import { buildSystemPrompt } from "@/lib/ai-bot";
import { env } from "@/lib/env";
import { LlmError, complete } from "@/lib/llm";
import type { ChatTurn, ProviderId, ToolDef } from "@/lib/llm/types";
import type { OrderFieldDef } from "@/lib/orders";

export type { ChatTurn } from "@/lib/llm/types";

const HANDOFF_TOOL: ToolDef = {
  name: "handoff_to_operator",
  description:
    "Передать диалог живому сотруднику. Вызывайте, когда клиент просит человека, " +
    "жалуется, спрашивает про сумму или срок, которых нет в анкете, или когда " +
    "вы не уверены в ответе. Передать человеку лучше, чем ответить неверно.",
  parameters: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Коротко, для сотрудника: почему нужен человек и что хочет клиент.",
      },
    },
    required: ["reason"],
  },
};

/** Инструмент собирается на каждый вызов: у каждой организации своя схема полей. */
function buildOrderTool(fields: OrderFieldDef[]): ToolDef {
  const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};

  for (const field of fields) {
    if (field.type === "NUMBER") {
      properties[field.id] = { type: "number", description: field.label };
    } else if (field.type === "DATE") {
      properties[field.id] = { type: "string", description: `${field.label} (формат ГГГГ-ММ-ДД)` };
    } else if (field.type === "SELECT" && field.options) {
      properties[field.id] = { type: "string", description: field.label, enum: field.options };
    } else {
      properties[field.id] = { type: "string", description: field.label };
    }
  }

  return {
    name: "save_order",
    description:
      "Сохранить или дополнить заказ клиента известными на данный момент полями. Вызывайте " +
      "каждый раз, когда в переписке появляются новые сведения о заказе — не дожидайтесь, " +
      "пока клиент назовёт всё сразу, и не переспрашивайте то, что он уже сказал. Передавайте " +
      "только те поля, которые узнали или уточнили в этом сообщении.",
    parameters: { type: "object", properties },
  };
}

export type BotAnswer = {
  answer: string | null;
  handoff: boolean;
  handoffReason: string | null;
  /** Поля заказа, которые бот узнал в этом ответе (частично, накопительно). */
  orderFields: Record<string, unknown> | null;
  /** Токены в форме журнала: вход без кэша, кэш отдельно. */
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  provider: ProviderId;
  model: string;
  latencyMs: number;
};

/**
 * Спрашивает нейросеть, что ответить клиенту.
 *
 * Анкета компании уходит системным блоком: она не меняется от запроса к запросу,
 * у Claude она кэшируется (повторное чтение примерно в десять раз дешевле),
 * а OpenAI и Gemini кэшируют длинный стабильный префикс сами. Переменная часть,
 * история диалога, идёт после.
 */
export async function askBot(input: {
  model: string;
  companyProfile: string;
  rules: string | null;
  history: ChatTurn[];
  orderFields?: OrderFieldDef[];
  provider?: ProviderId;
  /** Ключ клиента. Без него берём ключ платформы. */
  apiKey?: string;
  /** Организация — только для строки `llm_call` в логе. */
  org?: string;
}): Promise<BotAnswer> {
  const provider = input.provider ?? "ANTHROPIC";
  const apiKey = input.apiKey ?? env.platformKey(provider);
  if (!apiKey) {
    throw new LlmError("config", false);
  }

  const result = await complete(
    {
      model: input.model,
      system: buildSystemPrompt({ companyProfile: input.companyProfile, rules: input.rules }),
      messages: input.history,
      tools: [HANDOFF_TOOL, ...(input.orderFields?.length ? [buildOrderTool(input.orderFields)] : [])],
      maxTokens: 1024,
      // Модель сохранила заказ и промолчала: клиенту всё равно нужен ответ.
      followUp: { ack: "Сохранено.", skipIfCalled: [HANDOFF_TOOL.name] },
    },
    { provider, apiKey, ownKey: input.apiKey !== undefined, org: input.org },
  );

  let handoff = false;
  let handoffReason: string | null = null;
  let orderFields: Record<string, unknown> | null = null;

  for (const call of result.toolCalls) {
    if (call.name === HANDOFF_TOOL.name) {
      handoff = true;
      const reason = call.input.reason;
      handoffReason = typeof reason === "string" ? reason : null;
    }
    if (call.name === "save_order") {
      orderFields = { ...(orderFields ?? {}), ...call.input };
    }
  }

  return {
    answer: result.text,
    handoff,
    handoffReason,
    orderFields,
    inputTokens: result.usage.input - result.usage.cached,
    cachedTokens: result.usage.cached,
    outputTokens: result.usage.output,
    provider,
    model: input.model,
    latencyMs: result.latencyMs,
  };
}
