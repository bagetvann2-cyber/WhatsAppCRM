import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/ai-bot";
import type { OrderFieldDef } from "@/lib/orders";

/** Клиент создаётся лениво: без ключа приложение должно запускаться и работать. */
let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Не задан ANTHROPIC_API_KEY — ИИ-помощник не может отвечать.");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

const HANDOFF_TOOL = {
  name: "handoff_to_operator",
  description:
    "Передать диалог живому сотруднику. Вызывайте, когда клиент просит человека, " +
    "жалуется, спрашивает про сумму или срок, которых нет в анкете, или когда " +
    "вы не уверены в ответе. Передать человеку лучше, чем ответить неверно.",
  input_schema: {
    type: "object" as const,
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
function buildOrderTool(fields: OrderFieldDef[]) {
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
    input_schema: {
      type: "object" as const,
      properties,
    },
  };
}

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type BotAnswer = {
  answer: string | null;
  handoff: boolean;
  handoffReason: string | null;
  /** Поля заказа, которые бот узнал в этом ответе (частично, накопительно). */
  orderFields: Record<string, unknown> | null;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
};

/**
 * Спрашивает Claude, что ответить клиенту.
 *
 * Анкета компании уходит системным блоком с пометкой кэширования: она
 * не меняется от запроса к запросу, и повторное чтение стоит примерно
 * в десять раз дешевле. Переменная часть — история диалога — идёт после.
 */
export async function askBot(input: {
  model: string;
  companyProfile: string;
  rules: string | null;
  history: ChatTurn[];
  orderFields?: OrderFieldDef[];
}): Promise<BotAnswer> {
  const system = buildSystemPrompt({
    companyProfile: input.companyProfile,
    rules: input.rules,
  });

  const tools = [HANDOFF_TOOL, ...(input.orderFields?.length ? [buildOrderTool(input.orderFields)] : [])];

  const response = await anthropic().messages.create({
    model: input.model,
    max_tokens: 1024,
    // Низкое усилие: это короткий ответ в мессенджере, клиент ждёт секунды.
    // Мышление при этом не отключаем — с выключенным моделью иногда пишет
    // вызов инструмента текстом, и передача оператору молча не срабатывает.
    output_config: { effort: "low" },
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools,
    messages: input.history.map((turn) => ({
      role: turn.role,
      content: turn.text,
    })),
  });

  let answer: string | null = null;
  let handoff = false;
  let handoffReason: string | null = null;
  let orderFields: Record<string, unknown> | null = null;

  for (const block of response.content) {
    if (block.type === "text" && block.text.trim()) {
      answer = (answer ? `${answer}\n\n` : "") + block.text.trim();
    }
    if (block.type === "tool_use" && block.name === "handoff_to_operator") {
      handoff = true;
      const reason = (block.input as { reason?: string })?.reason;
      handoffReason = typeof reason === "string" ? reason : null;
    }
    if (block.type === "tool_use" && block.name === "save_order") {
      orderFields = { ...(orderFields ?? {}), ...(block.input as Record<string, unknown>) };
    }
  }

  return {
    answer,
    handoff,
    handoffReason,
    orderFields,
    inputTokens: response.usage.input_tokens,
    cachedTokens: response.usage.cache_read_input_tokens ?? 0,
    outputTokens: response.usage.output_tokens,
  };
}
