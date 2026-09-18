import Anthropic from "@anthropic-ai/sdk";
import { findModel } from "@/lib/llm/catalog";
import { LlmError, classify, fromThrown } from "@/lib/llm/errors";
import {
  addUsage,
  needsFollowUp,
  type CallContext,
  type LlmRequest,
  type LlmResult,
  type ToolCall,
  type Usage,
} from "@/lib/llm/types";

function toUsage(usage: Anthropic.Messages.Usage): Usage {
  const cached = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  // У Anthropic input_tokens не включает ни чтение кэша, ни запись в него.
  return { input: usage.input_tokens + cached + cacheWrite, cached, cacheWrite, output: usage.output_tokens };
}

function parse(message: Anthropic.Messages.Message): LlmResult {
  const texts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of message.content) {
    if (block.type === "text" && block.text.trim()) {
      texts.push(block.text.trim());
    }
    if (block.type === "tool_use") {
      toolCalls.push({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
    }
  }

  const finish =
    message.stop_reason === "max_tokens" ? "length" : message.stop_reason === "tool_use" ? "tool" : message.stop_reason === "end_turn" ? "stop" : "other";

  return { text: texts.length ? texts.join("\n\n") : null, toolCalls, usage: toUsage(message.usage), finish };
}

function toError(error: unknown, ownKey: boolean): unknown {
  if (error instanceof Anthropic.APIError && typeof error.status === "number") {
    const body = error.error as { error?: { type?: string } } | undefined;
    const retryAfter = Number(error.headers?.get?.("retry-after"));
    return new LlmError(
      classify(error.status, body?.error?.type, error.message),
      ownKey,
      error.status,
      body?.error?.type,
      Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
    );
  }
  return fromThrown(error, ownKey);
}

/**
 * Клиент создаётся на каждый вызов и получает ключ этого вызова: общий клиент на ключе
 * из env отправил бы запросы клиента со своим ключом на наш счёт.
 */
export async function anthropicComplete(req: LlmRequest, ctx: CallContext): Promise<LlmResult> {
  const client = new Anthropic({ apiKey: ctx.apiKey, maxRetries: 0, timeout: 30_000 });
  const tools = req.tools?.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
  const toolChoice =
    req.toolChoice === "required"
      ? ({ type: "any" } as const)
      : typeof req.toolChoice === "object"
        ? ({ type: "tool", name: req.toolChoice.name } as const)
        : undefined;

  const base = {
    model: req.model,
    max_tokens: req.maxTokens,
    // Низкое усилие: это короткий ответ в мессенджере, клиент ждёт секунды. Мышление
    // при этом не отключаем: без него модель иногда пишет вызов инструмента текстом.
    // У моделей без параметра (Haiku 4.5) и у незнакомых id его не шлём вовсе.
    ...(findModel("ANTHROPIC", req.model)?.supportsEffort ? { output_config: { effort: "low" as const } } : {}),
    system: [{ type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } }],
    ...(tools?.length ? { tools } : {}),
  };
  const history = req.messages.map((turn) => ({ role: turn.role, content: turn.text }));

  try {
    const first = await client.messages.create(
      { ...base, messages: history, ...(toolChoice ? { tool_choice: toolChoice } : {}) },
      { signal: ctx.signal },
    );
    const result = parse(first);

    if (!needsFollowUp(req, result)) {
      return result;
    }

    // Продолжаем исходным сообщением модели, блоки мышления возвращаем нетронутыми.
    const second = await client.messages.create(
      {
        ...base,
        messages: [
          ...history,
          { role: "assistant", content: first.content as Anthropic.Messages.ContentBlockParam[] },
          {
            role: "user",
            content: result.toolCalls.map((call) => ({
              type: "tool_result" as const,
              tool_use_id: call.id,
              content: req.followUp!.ack,
            })),
          },
        ],
        tool_choice: { type: "none" },
      },
      { signal: ctx.signal },
    );
    const followed = parse(second);

    return {
      text: followed.text,
      toolCalls: result.toolCalls,
      usage: addUsage(result.usage, followed.usage),
      finish: followed.finish,
    };
  } catch (error) {
    throw toError(error, ctx.ownKey);
  }
}
