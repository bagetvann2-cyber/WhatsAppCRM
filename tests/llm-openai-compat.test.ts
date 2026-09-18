import { afterEach, expect, test, vi } from "vitest";
import { openaiCompatComplete } from "@/lib/llm/openai-compat";
import { LlmError } from "@/lib/llm/errors";
import type { LlmRequest } from "@/lib/llm/types";
import { chat, json, stubFetch } from "./llm-helpers";

afterEach(() => vi.unstubAllGlobals());

const ctx = { apiKey: "test-key-123", ownKey: false, signal: new AbortController().signal };

const req: LlmRequest = {
  model: "gpt-5.6-luna",
  system: "Вы — помощник.",
  messages: [{ role: "user", text: "Сколько стоит доставка?" }],
  maxTokens: 512,
  tools: [
    { name: "handoff_to_operator", description: "Передать", parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] } },
    { name: "save_order", description: "Сохранить", parameters: { type: "object", properties: { size: { type: "string", enum: ["S", "M"] } } } },
  ],
  followUp: { ack: "Сохранено.", skipIfCalled: ["handoff_to_operator"] },
};

const orderCall = { id: "call_a", type: "function", function: { name: "save_order", arguments: '{"size":"M"}' } };

test("запрос: адрес, ключ, системный промт, лимит длины и инструменты в формате OpenAI", async () => {
  const sent = stubFetch([chat({ content: "Триста тенге." })]);

  await openaiCompatComplete("OPENAI", req, ctx);

  expect(sent[0].url).toBe("https://api.openai.com/v1/chat/completions");
  expect(sent[0].headers.get("authorization")).toBe("Bearer test-key-123");
  expect(sent[0].body.max_completion_tokens).toBe(512);
  expect(sent[0].body).not.toHaveProperty("max_tokens");
  expect(sent[0].body.messages).toEqual([
    { role: "system", content: "Вы — помощник." },
    { role: "user", content: "Сколько стоит доставка?" },
  ]);
  const tools = sent[0].body.tools as { type: string; function: { name: string; parameters: { properties: Record<string, { enum?: string[] }> } } }[];
  expect(tools.map((t) => t.function.name)).toEqual(["handoff_to_operator", "save_order"]);
  expect(tools[1].function.parameters.properties.size.enum).toEqual(["S", "M"]);
});

test("у Gemini и OpenRouter свои адреса и max_tokens", async () => {
  const sent = stubFetch([chat({ content: "ок" })]);

  await openaiCompatComplete("GEMINI", req, ctx);
  await openaiCompatComplete("OPENROUTER", req, ctx);

  expect(sent[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  expect(sent[0].body.max_tokens).toBe(512);
  expect(sent[1].url).toBe("https://openrouter.ai/api/v1/chat/completions");
});

test("принудительный вызов инструмента и required переводятся в формат OpenAI", async () => {
  const sent = stubFetch([chat({ content: "ок" })]);

  await openaiCompatComplete("OPENAI", { ...req, toolChoice: { name: "save_order" } }, ctx);
  await openaiCompatComplete("OPENAI", { ...req, toolChoice: "required" }, ctx);
  await openaiCompatComplete("OPENAI", { ...req, toolChoice: "auto" }, ctx);

  expect(sent[0].body.tool_choice).toEqual({ type: "function", function: { name: "save_order" } });
  expect(sent[1].body.tool_choice).toBe("required");
  expect(sent[2].body).not.toHaveProperty("tool_choice");
});

test("ответ: текст, токены (кэш входит во вход) и вызовы инструментов", async () => {
  stubFetch([chat({ content: " Триста тенге. ", tool_calls: [{ id: "c1", function: { name: "handoff_to_operator", arguments: '{"reason":"цена"}' } }] })]);

  const result = await openaiCompatComplete("OPENAI", req, ctx);

  expect(result.text).toBe("Триста тенге.");
  expect(result.usage).toEqual({ input: 100, cached: 40, cacheWrite: 0, output: 20 });
  expect(result.toolCalls).toEqual([{ id: "c1", name: "handoff_to_operator", input: { reason: "цена" } }]);
});

test("битые и пустые аргументы инструмента — всё равно вызов, решает имя", async () => {
  stubFetch([
    chat({ content: null, tool_calls: [{ id: "c1", function: { name: "handoff_to_operator", arguments: "{oops" } }, { id: "c2", function: { name: "save_order", arguments: "" } }] }),
  ]);

  const result = await openaiCompatComplete("OPENAI", req, ctx);

  expect(result.toolCalls.map((c) => [c.name, c.input])).toEqual([
    ["handoff_to_operator", {}],
    ["save_order", {}],
  ]);
});

test("Gemini без id у вызова: id подставляется, чтобы ответ инструмента нашёл свой вызов", async () => {
  const sent = stubFetch([
    chat({ content: null, tool_calls: [{ function: { name: "save_order", arguments: '{"size":"S"}' } }] }),
    chat({ content: "Записал." }),
  ]);

  const result = await openaiCompatComplete("GEMINI", req, ctx);

  expect(result.toolCalls[0].id).toBe("call_0");
  const messages = sent[1].body.messages as { role: string; tool_call_id?: string }[];
  expect(messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_0" });
});

test("второй проход: одни вызовы без текста → результат инструмента, текст из второго ответа, токены суммируются", async () => {
  const assistant = { content: null, tool_calls: [{ ...orderCall, extra_content: { google: { thought_signature: "sig" } } }] };
  const sent = stubFetch([chat(assistant), chat({ content: "Записал ваш заказ." })]);

  const result = await openaiCompatComplete("OPENAI", req, ctx);

  expect(result.text).toBe("Записал ваш заказ.");
  expect(result.toolCalls).toHaveLength(1);
  expect(result.usage).toEqual({ input: 200, cached: 80, cacheWrite: 0, output: 40 });

  expect(sent).toHaveLength(2);
  const messages = sent[1].body.messages as Record<string, unknown>[];
  // Исходное сообщение модели вернулось нетронутым, включая подпись размышлений Gemini.
  expect(messages[2]).toEqual({ role: "assistant", content: null, tool_calls: assistant.tool_calls });
  expect(messages[3]).toEqual({ role: "tool", tool_call_id: "call_a", content: "Сохранено." });
  expect(sent[1].body.tool_choice).toBe("none");
});

test("на каждый вызов в одном ходе — свой ответ инструмента", async () => {
  const sent = stubFetch([
    chat({ content: null, tool_calls: [orderCall, { ...orderCall, id: "call_b" }] }),
    chat({ content: "Готово." }),
  ]);

  await openaiCompatComplete("OPENAI", req, ctx);

  const messages = sent[1].body.messages as { role: string; tool_call_id?: string }[];
  expect(messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id)).toEqual(["call_a", "call_b"]);
});

test("передача оператору без текста — без второго прохода", async () => {
  const sent = stubFetch([
    chat({ content: null, tool_calls: [{ id: "h", function: { name: "handoff_to_operator", arguments: '{"reason":"жалоба"}' } }] }),
  ]);

  const result = await openaiCompatComplete("OPENAI", req, ctx);

  expect(sent).toHaveLength(1);
  expect(result.text).toBeNull();
});

test("есть текст — второго прохода нет, даже если был вызов инструмента", async () => {
  const sent = stubFetch([chat({ content: "Записал.", tool_calls: [orderCall] })]);

  await openaiCompatComplete("OPENAI", req, ctx);

  expect(sent).toHaveLength(1);
});

test("ошибки провайдеров: статус и код превращаются в наш код, ключ в текст не попадает", async () => {
  const leak = "Incorrect API key provided: sk-proj-abcdef123456789";

  stubFetch([json({ error: { code: "invalid_api_key", message: leak } }, 401)]);
  const auth = await openaiCompatComplete("OPENAI", req, { ...ctx, ownKey: true }).catch((e) => e);
  expect(auth).toBeInstanceOf(LlmError);
  expect(auth).toMatchObject({ code: "auth", owner: "client", status: 401 });
  expect(auth.message).not.toContain("abcdef123456789");

  stubFetch([json({ error: { code: "insufficient_quota", message: "quota" } }, 429)]);
  expect(await openaiCompatComplete("OPENAI", req, ctx).catch((e) => e)).toMatchObject({ code: "quota", owner: "platform" });

  stubFetch([json({ error: { code: "rate_limit_exceeded" } }, 429, { "retry-after": "3" })]);
  expect(await openaiCompatComplete("OPENAI", req, ctx).catch((e) => e)).toMatchObject({ code: "rate_limit", retryAfterMs: 3000 });

  stubFetch([json({ error: { message: "boom" } }, 500)]);
  expect(await openaiCompatComplete("OPENAI", req, ctx).catch((e) => e)).toMatchObject({ code: "unavailable" });

  stubFetch([json({ error: { message: "no model" } }, 404)]);
  expect(await openaiCompatComplete("OPENAI", req, ctx).catch((e) => e)).toMatchObject({ code: "model" });
});

test("Gemini: ошибка массивом, причина в details[].reason", async () => {
  stubFetch([json([{ error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid", details: [{ reason: "API_KEY_INVALID" }] } }], 400)]);

  const error = await openaiCompatComplete("GEMINI", req, { ...ctx, ownKey: true }).catch((e) => e);

  expect(error).toMatchObject({ code: "auth", providerCode: "API_KEY_INVALID", owner: "client" });
});

test("тело ответа не JSON — хватает статуса", async () => {
  stubFetch([new Response("Bad Gateway", { status: 502 })]);

  expect(await openaiCompatComplete("OPENAI", req, ctx).catch((e) => e)).toMatchObject({ code: "unavailable", status: 502 });
});

test("обрыв сети — недоступность, а не сырая ошибка", async () => {
  stubFetch([new TypeError("fetch failed")]);

  expect(await openaiCompatComplete("OPENAI", req, ctx).catch((e) => e)).toMatchObject({ code: "unavailable" });
});
