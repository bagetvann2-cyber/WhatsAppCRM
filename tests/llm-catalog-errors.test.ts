import { expect, test } from "vitest";
import { MODELS, costUsd, defaultModel, findModel, resolveModel } from "@/lib/llm/catalog";
import { LlmError, classify, redact } from "@/lib/llm/errors";

test("Haiku 4.5 не поддерживает effort, Sonnet 5 и Opus 5 поддерживают", () => {
  expect(findModel("ANTHROPIC", "claude-haiku-4-5")?.supportsEffort).toBe(false);
  expect(findModel("ANTHROPIC", "claude-sonnet-5")?.supportsEffort).toBe(true);
  expect(findModel("ANTHROPIC", "claude-opus-5")?.supportsEffort).toBe(true);
});

test("модель по умолчанию — первая платформенная; null в базе означает её", () => {
  expect(defaultModel("ANTHROPIC")).toBe("claude-sonnet-5");
  expect(defaultModel("OPENAI")).toBe("gpt-5.6-luna");
  expect(defaultModel("OPENROUTER")).toBeNull();
  expect(resolveModel("GEMINI", null)).toBe("gemini-3.1-flash-lite");
  expect(resolveModel("GEMINI", "my-model")).toBe("my-model");
});

test("у каждого провайдера с моделями есть платформенная модель, и id не повторяются", () => {
  for (const [provider, models] of Object.entries(MODELS)) {
    if (models.length > 0) {
      expect(models.some((m) => m.platform), provider).toBe(true);
    }
    expect(new Set(models.map((m) => m.id)).size).toBe(models.length);
  }
});

test("стоимость: кэшированные токены дешевле, неизвестная модель — null", () => {
  // 1000 входных, из них 400 из кэша, 100 выходных, Haiku: $1 / $0.1 / $5 за 1M.
  const cost = costUsd("ANTHROPIC", "claude-haiku-4-5", { input: 1000, cached: 400, output: 100 });
  expect(cost).toBeCloseTo((600 * 1 + 400 * 0.1 + 100 * 5) / 1_000_000, 10);
  expect(costUsd("OPENROUTER", "any/model", { input: 1, cached: 0, output: 1 })).toBeNull();
});

test("коды ошибок провайдеров превращаются в наши", () => {
  const cases: [number, string | undefined, string, string][] = [
    [401, undefined, "", "auth"],
    [403, undefined, "", "auth"],
    [400, "API_KEY_INVALID", "", "auth"],
    [402, undefined, "", "quota"],
    [429, "insufficient_quota", "", "quota"],
    [400, undefined, "Your credit balance is too low", "quota"],
    [429, "rate_limit_exceeded", "", "rate_limit"],
    [429, "RESOURCE_EXHAUSTED", "", "rate_limit"],
    [404, undefined, "", "model"],
    [400, "model_not_found", "", "model"],
    [500, undefined, "", "unavailable"],
    [529, undefined, "", "unavailable"],
    [422, undefined, "", "bad_request"],
  ];

  for (const [status, code, message, expected] of cases) {
    expect(classify(status, code, message), `${status} ${code ?? ""}`).toBe(expected);
  }
});

test("чья ошибка: проблемы ключа на ключе клиента — клиента, всё остальное — наше", () => {
  expect(new LlmError("auth", true).owner).toBe("client");
  expect(new LlmError("quota", true).owner).toBe("client");
  // Тот же код на нашем ключе — наша проблема, клиент починить её не может.
  expect(new LlmError("quota", false).owner).toBe("platform");
  expect(new LlmError("unavailable", true).owner).toBe("platform");
  expect(new LlmError("empty", true).owner).toBe("platform");
});

test("текст ошибки собран из словаря, а не из ответа провайдера", () => {
  const error = new LlmError("auth", true, 401, "invalid_api_key");
  expect(error.message).toBe("Ключ нейросети не принят.");
});

test("redact вырезает ключи всех провайдеров", () => {
  const text = "Incorrect API key: sk-proj-abcdef123456789, AIzaSyABCDEFGHIJ12345, Bearer abc.def.ghi-jkl";
  const clean = redact(text);
  expect(clean).not.toMatch(/abcdef123456789|ABCDEFGHIJ12345|abc\.def\.ghi/);
  expect(clean).toContain("sk-***");
  expect(clean).toContain("AIza***");
});
