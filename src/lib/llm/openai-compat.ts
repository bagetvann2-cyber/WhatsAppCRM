import { PROVIDER_INFO } from "@/lib/llm/catalog";
import { LlmError, classify, fromThrown } from "@/lib/llm/errors";
import {
  addUsage,
  needsFollowUp,
  type CallContext,
  type LlmRequest,
  type LlmResult,
  type ProviderId,
  type ToolCall,
} from "@/lib/llm/types";

type RawToolCall = { id?: string; type?: string; function?: { name?: string; arguments?: string }; extra_content?: unknown };
type RawMessage = { content?: unknown; tool_calls?: RawToolCall[] };
type RawResponse = {
  choices?: { message?: RawMessage; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
};

function contentText(content: unknown): string | null {
  if (typeof content === "string") {
    return content.trim() || null;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : ""))
      .join("")
      .trim();
    return text || null;
  }
  return null;
}

/** Аргументы приходят JSON-строкой; битые или пустые — это всё равно вызов, решает имя инструмента. */
function parseArguments(raw: string | undefined): Record<string, unknown> {
  try {
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parse(response: RawResponse): { result: LlmResult; message: RawMessage } {
  const choice = response.choices?.[0];
  const message = choice?.message ?? {};
  // Gemini иногда отдаёт вызов без id; ответ инструмента привязывается к нему, поэтому id нужен всегда.
  const raw = (message.tool_calls ?? []).map((call, index) => ({ ...call, id: call.id || `call_${index}` }));
  const toolCalls: ToolCall[] = raw
    .filter((call) => call.function?.name)
    .map((call) => ({ id: call.id, name: call.function!.name!, input: parseArguments(call.function!.arguments) }));
  const cached = response.usage?.prompt_tokens_details?.cached_tokens ?? 0;

  const finish =
    choice?.finish_reason === "length" ? "length" : choice?.finish_reason === "tool_calls" ? "tool" : choice?.finish_reason === "stop" ? "stop" : "other";

  return {
    message: { content: message.content ?? null, tool_calls: raw.length ? raw : undefined },
    result: {
      text: contentText(message.content),
      toolCalls,
      // prompt_tokens у OpenAI и совместимых уже включает кэшированные.
      usage: { input: response.usage?.prompt_tokens ?? 0, cached, cacheWrite: 0, output: response.usage?.completion_tokens ?? 0 },
      finish,
    },
  };
}

async function httpError(res: Response, ownKey: boolean): Promise<LlmError> {
  let providerCode: string | undefined;
  let message = "";
  try {
    const body = await res.json();
    // Gemini отдаёт ошибку массивом из одного объекта.
    const error = (Array.isArray(body) ? body[0] : body)?.error;
    // У Gemini `code` — просто HTTP-статус, а точная причина (API_KEY_INVALID) лежит в details[].reason.
    const candidates = [error?.details?.[0]?.reason, error?.code, error?.type, error?.status];
    providerCode = candidates.map((value) => String(value ?? "")).find((value) => value && !/^\d+$/.test(value));
    message = String(error?.message ?? "");
  } catch {
    // Тело не JSON: хватит статуса.
  }
  const retryAfter = Number(res.headers.get("retry-after"));
  return new LlmError(classify(res.status, providerCode, message), ownKey, res.status, providerCode, Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
}

/**
 * gpt-5.1 и новее не принимают функции-инструменты в chat/completions, пока
 * размышление не выключено (400 «Function tools with reasoning_effort…»).
 * Боту нужны инструменты всегда, а ответ клиенту не требует размышлений.
 * Старые gpt-5 и gpt-5-mini значение "none" не знают — их не трогаем.
 */
export function needsReasoningNone(provider: ProviderId, model: string, hasTools: boolean): boolean {
  return provider === "OPENAI" && hasTools && /^gpt-5\.\d/.test(model);
}

/** OpenAI, Gemini (через его OpenAI-совместимый адрес) и OpenRouter: один протокол, разные адреса. */
export async function openaiCompatComplete(provider: ProviderId, req: LlmRequest, ctx: CallContext): Promise<LlmResult> {
  const info = PROVIDER_INFO[provider];
  const tools = req.tools?.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
  const toolChoice =
    req.toolChoice === "required"
      ? "required"
      : typeof req.toolChoice === "object"
        ? { type: "function", function: { name: req.toolChoice.name } }
        : undefined;

  const history: unknown[] = [
    { role: "system", content: req.system },
    ...req.messages.map((turn) => ({ role: turn.role, content: turn.text })),
  ];

  async function call(messages: unknown[], choice: unknown): Promise<RawResponse> {
    const res = await fetch(`${info.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        [info.maxTokensParam]: req.maxTokens,
        messages,
        ...(tools?.length ? { tools } : {}),
        ...(needsReasoningNone(provider, req.model, Boolean(tools?.length)) ? { reasoning_effort: "none" } : {}),
        ...(choice ? { tool_choice: choice } : {}),
      }),
      signal: ctx.signal,
    });
    if (!res.ok) {
      throw await httpError(res, ctx.ownKey);
    }
    return (await res.json()) as RawResponse;
  }

  try {
    const first = parse(await call(history, toolChoice));

    if (!needsFollowUp(req, first.result)) {
      return first.result;
    }

    // Исходное сообщение модели возвращаем как есть (у Gemini 3 в вызовах лежит подпись размышлений),
    // и на каждый вызов даём свой ответ инструмента.
    const second = parse(
      await call(
        [
          ...history,
          { role: "assistant", content: first.message.content, tool_calls: first.message.tool_calls },
          ...first.result.toolCalls.map((tool) => ({ role: "tool", tool_call_id: tool.id, content: req.followUp!.ack })),
        ],
        "none",
      ),
    );

    return {
      text: second.result.text,
      toolCalls: first.result.toolCalls,
      usage: addUsage(first.result.usage, second.result.usage),
      finish: second.result.finish,
    };
  } catch (error) {
    throw fromThrown(error, ctx.ownKey);
  }
}
