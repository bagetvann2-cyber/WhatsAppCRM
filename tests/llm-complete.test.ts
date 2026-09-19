import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { complete } from "@/lib/llm";
import type { LlmRequest } from "@/lib/llm/types";
import { chat, json, stubFetch } from "./llm-helpers";

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const req: LlmRequest = {
  model: "gpt-5.6-luna",
  system: "Вы — помощник.",
  messages: [{ role: "user", text: "Привет" }],
  maxTokens: 256,
};
const opts = { provider: "OPENAI" as const, apiKey: "key-1", ownKey: false };

test("успех возвращает ответ и время вызова", async () => {
  stubFetch([chat({ content: "Здравствуйте!" })]);

  const result = await complete(req, opts);

  expect(result.text).toBe("Здравствуйте!");
  expect(result.latencyMs).toBeGreaterThanOrEqual(0);
});

test("один повтор на 429 с учётом retry-after, потом успех", async () => {
  const sent = stubFetch([json({ error: { code: "rate_limit_exceeded" } }, 429, { "retry-after": "0" }), chat({ content: "ок" })]);

  const result = await complete(req, opts);

  expect(result.text).toBe("ок");
  expect(sent).toHaveLength(2);
});

test("один повтор на 5xx и на обрыв соединения, но не больше одного", async () => {
  const sent = stubFetch([new TypeError("fetch failed"), json({ error: {} }, 503, { "retry-after": "0" }), chat({ content: "не дойдём" })]);

  const error = await complete(req, opts).catch((e) => e);

  expect(error).toMatchObject({ code: "unavailable" });
  expect(sent).toHaveLength(2);
});

test("ошибку ключа не повторяем", async () => {
  const sent = stubFetch([json({ error: { code: "invalid_api_key" } }, 401), chat({ content: "не дойдём" })]);

  const error = await complete(req, { ...opts, ownKey: true }).catch((e) => e);

  expect(error).toMatchObject({ code: "auth", owner: "client" });
  expect(sent).toHaveLength(1);
});

test("общий срок: зависший провайдер превращается в таймаут, а не держит воркер", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    })),
  );

  const error = await complete(req, { ...opts, deadlineMs: 50 }).catch((e) => e);

  expect(error).toMatchObject({ name: "LlmError", code: "timeout" });
});

test("пустой ответ без вызовов инструментов — ошибка, а не тихое «ничего»", async () => {
  stubFetch([chat({ content: "" })]);

  expect(await complete(req, opts).catch((e) => e)).toMatchObject({ code: "empty" });
});

test("обрыв на лимите длины с пустым текстом — отдельная причина", async () => {
  stubFetch([json({ choices: [{ message: { content: "" }, finish_reason: "length" }], usage: {} })]);

  expect(await complete(req, opts).catch((e) => e)).toMatchObject({ code: "length" });
});

test("только вызов инструмента — это ответ, пустым он не считается", async () => {
  stubFetch([chat({ content: null, tool_calls: [{ id: "h", function: { name: "handoff_to_operator", arguments: "{}" } }] })]);

  const result = await complete(req, opts);

  expect(result.toolCalls).toHaveLength(1);
});

test("в лог ошибки не попадает ключ", async () => {
  stubFetch([json({ error: { code: "invalid_api_key", message: "bad key sk-proj-abcdef123456789" } }, 401)]);

  await complete(req, { ...opts, ownKey: true }).catch(() => undefined);

  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("abcdef123456789");
});
