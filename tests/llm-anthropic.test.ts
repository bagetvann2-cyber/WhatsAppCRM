import { afterEach, expect, test, vi } from "vitest";
import { anthropicComplete } from "@/lib/llm/anthropic";
import type { LlmRequest } from "@/lib/llm/types";
import { claude, json, stubFetch } from "./llm-helpers";

afterEach(() => vi.unstubAllGlobals());

const ctx = { apiKey: "sk-ant-client-key-123", ownKey: true, signal: new AbortController().signal };

const req: LlmRequest = {
  model: "claude-sonnet-5",
  system: "Вы — помощник.",
  messages: [{ role: "user", text: "Хочу заказать" }],
  maxTokens: 512,
  tools: [
    { name: "handoff_to_operator", description: "Передать", parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] } },
    { name: "save_order", description: "Сохранить", parameters: { type: "object", properties: {} } },
  ],
  followUp: { ack: "Сохранено.", skipIfCalled: ["handoff_to_operator"] },
};

test("ключ этого вызова уходит в заголовок: клиент со своим ключом не тратит наш", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-PLATFORM-key";
  const sent = stubFetch([claude([{ type: "text", text: "Здравствуйте!" }])]);

  await anthropicComplete(req, ctx);

  expect(sent[0].headers.get("x-api-key")).toBe("sk-ant-client-key-123");
});

test("effort уходит только моделям, которые его поддерживают: у Haiku 4.5 он даёт 400", async () => {
  const sent = stubFetch([claude([{ type: "text", text: "ок" }])]);

  await anthropicComplete({ ...req, model: "claude-haiku-4-5" }, ctx);
  await anthropicComplete({ ...req, model: "claude-sonnet-5" }, ctx);
  await anthropicComplete({ ...req, model: "какая-то-новая-модель" }, ctx);

  expect(sent[0].body).not.toHaveProperty("output_config");
  expect(sent[1].body.output_config).toEqual({ effort: "low" });
  expect(sent[2].body).not.toHaveProperty("output_config");
});

test("системный блок с меткой кэша, инструменты в формате Anthropic, принудительный вызов", async () => {
  const sent = stubFetch([claude([{ type: "text", text: "ок" }])]);

  await anthropicComplete({ ...req, toolChoice: { name: "save_order" } }, ctx);
  await anthropicComplete({ ...req, toolChoice: "required" }, ctx);

  expect(sent[0].body.system).toEqual([{ type: "text", text: "Вы — помощник.", cache_control: { type: "ephemeral" } }]);
  const tools = sent[0].body.tools as { name: string; input_schema: unknown }[];
  expect(tools.map((t) => t.name)).toEqual(["handoff_to_operator", "save_order"]);
  expect(tools[0].input_schema).toMatchObject({ type: "object", required: ["reason"] });
  expect(sent[0].body.tool_choice).toEqual({ type: "tool", name: "save_order" });
  expect(sent[1].body.tool_choice).toEqual({ type: "any" });
});

test("токены: вход включает чтение и запись кэша", async () => {
  stubFetch([claude([{ type: "text", text: "ок" }])]);

  const result = await anthropicComplete(req, ctx);

  // input_tokens 10 + чтение 30 + запись 2
  expect(result.usage).toEqual({ input: 42, cached: 30, cacheWrite: 2, output: 5 });
});

test("второй проход: блоки мышления возвращаются нетронутыми, на каждый вызов свой tool_result, tool_choice none", async () => {
  const thinking = { type: "thinking", thinking: "", signature: "sig-1" };
  const call = { type: "tool_use", id: "toolu_1", name: "save_order", input: { size: "M" } };
  const sent = stubFetch([claude([thinking, call], "tool_use"), claude([{ type: "text", text: "Записал ваш заказ." }])]);

  const result = await anthropicComplete(req, ctx);

  expect(result.text).toBe("Записал ваш заказ.");
  expect(result.toolCalls).toEqual([{ id: "toolu_1", name: "save_order", input: { size: "M" } }]);
  expect(result.usage.output).toBe(10);

  const messages = sent[1].body.messages as { role: string; content: unknown }[];
  expect(messages[1]).toEqual({ role: "assistant", content: [thinking, call] });
  expect(messages[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "Сохранено." }] });
  expect(sent[1].body.tool_choice).toEqual({ type: "none" });
  // Инструменты во втором запросе на месте: без них tool_use в истории отклоняется.
  expect(sent[1].body.tools).toBeDefined();
});

test("передача оператору без текста — без второго прохода", async () => {
  const sent = stubFetch([claude([{ type: "tool_use", id: "t", name: "handoff_to_operator", input: { reason: "жалоба" } }], "tool_use")]);

  const result = await anthropicComplete(req, ctx);

  expect(sent).toHaveLength(1);
  expect(result.toolCalls[0].name).toBe("handoff_to_operator");
});

test("ошибки SDK превращаются в наши без текста провайдера", async () => {
  stubFetch([json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key sk-ant-client-key-123" } }, 401)]);
  const auth = await anthropicComplete(req, ctx).catch((e) => e);
  expect(auth).toMatchObject({ name: "LlmError", code: "auth", owner: "client", status: 401 });
  expect(auth.message).not.toContain("sk-ant");

  stubFetch([json({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low" } }, 400)]);
  expect(await anthropicComplete(req, ctx).catch((e) => e)).toMatchObject({ code: "quota" });

  stubFetch([json({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }, 429, { "retry-after": "2" })]);
  expect(await anthropicComplete(req, ctx).catch((e) => e)).toMatchObject({ code: "rate_limit", retryAfterMs: 2000 });

  stubFetch([json({ type: "error", error: { type: "api_error", message: "oops" } }, 500)]);
  expect(await anthropicComplete(req, ctx).catch((e) => e)).toMatchObject({ code: "unavailable" });
});

test("SDK не повторяет запрос сам: повтор и срок решает наш слой", async () => {
  const sent = stubFetch([json({ type: "error", error: { type: "api_error", message: "oops" } }, 500)]);

  await anthropicComplete(req, ctx).catch(() => undefined);

  expect(sent).toHaveLength(1);
});
