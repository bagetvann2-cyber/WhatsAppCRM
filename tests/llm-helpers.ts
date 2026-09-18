import { vi } from "vitest";

export type Sent = { url: string; headers: Headers; body: Record<string, unknown> };

/** Подменяет глобальный fetch: отдаёт ответы по очереди и запоминает, что отправили. */
export function stubFetch(responses: (Response | Error)[]): Sent[] {
  const sent: Sent[] = [];
  let index = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      sent.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(String(init.body)) : {},
      });
      const next = responses[Math.min(index, responses.length - 1)];
      index += 1;
      if (next instanceof Error) {
        throw next;
      }
      return next.clone();
    }),
  );

  return sent;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Ответ /chat/completions в форме OpenAI. */
export function chat(message: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return json({
    choices: [{ message, finish_reason: message.tool_calls ? "tool_calls" : "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 40 } },
    ...extra,
  });
}

/** Ответ /v1/messages в форме Anthropic. */
export function claude(content: unknown[], stop = "end_turn") {
  return json({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content,
    stop_reason: stop,
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 30, cache_creation_input_tokens: 2 },
  });
}
