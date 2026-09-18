import { anthropicComplete } from "@/lib/llm/anthropic";
import { LlmError, redact } from "@/lib/llm/errors";
import { openaiCompatComplete } from "@/lib/llm/openai-compat";
import type { LlmRequest, LlmResult, ProviderId } from "@/lib/llm/types";

export { LlmError } from "@/lib/llm/errors";
export type { LlmRequest, LlmResult, ProviderId } from "@/lib/llm/types";

/** Общий срок на одно сообщение вместе с повтором и вторым проходом: воркер один, зависать ему нельзя. */
const DEADLINE_MS = 45_000;
const MAX_RETRY_WAIT_MS = 5_000;

export type CallOptions = {
  provider: ProviderId;
  apiKey: string;
  ownKey: boolean;
  /** Для тестов. */
  deadlineMs?: number;
};

export type CompleteResult = LlmResult & { latencyMs: number };

function once(req: LlmRequest, opts: CallOptions, signal: AbortSignal): Promise<LlmResult> {
  const ctx = { apiKey: opts.apiKey, ownKey: opts.ownKey, signal };
  return opts.provider === "ANTHROPIC" ? anthropicComplete(req, ctx) : openaiCompatComplete(opts.provider, req, ctx);
}

/**
 * Один вызов модели с единой политикой: общий дедлайн, один повтор на 429/5xx/обрыв
 * (с учётом `retry-after`, но не дольше 5 с), наружу выходит только LlmError.
 */
export async function complete(req: LlmRequest, opts: CallOptions): Promise<CompleteResult> {
  const startedAt = Date.now();
  const signal = AbortSignal.timeout(opts.deadlineMs ?? DEADLINE_MS);
  let attempt = 0;

  for (;;) {
    try {
      const result = await once(req, opts, signal);

      if (!result.text && result.toolCalls.length === 0) {
        throw new LlmError(result.finish === "length" ? "length" : "empty", opts.ownKey);
      }
      return { ...result, latencyMs: Date.now() - startedAt };
    } catch (error) {
      const retryable = error instanceof LlmError && (error.code === "rate_limit" || error.code === "unavailable");
      const wait = Math.min(error instanceof LlmError ? (error.retryAfterMs ?? 1000) : 0, MAX_RETRY_WAIT_MS);

      if (!retryable || attempt >= 1 || signal.aborted) {
        console.error(`llm_error provider=${opts.provider} ownKey=${opts.ownKey}`, error instanceof LlmError ? `${error.code} status=${error.status ?? "-"} ${error.providerCode ?? ""}` : redact(String(error)));
        throw error instanceof LlmError ? error : new LlmError("unavailable", opts.ownKey);
      }

      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
