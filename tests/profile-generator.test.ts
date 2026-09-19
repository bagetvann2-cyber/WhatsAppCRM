import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getBot } from "@/lib/ai-bot-store";
import { getSubscription } from "@/lib/billing-store";
import { LlmError } from "@/lib/llm";
import { GENERATOR_LIMIT, parseGeneratorResult, sanitizeOrderFields } from "@/lib/profile-generator";
import type { LlmResult } from "@/lib/llm/types";
import { createTestOrg, dropTestOrg } from "./helpers";

const PNID = "PNID-GENERATOR";
const DESCRIPTION = "Небольшая кофейня в Астане, продаём кофе и десерты, доставки нет.";
let organizationId: string;

const requireUserMock = vi.hoisted(() => vi.fn());
const completeMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ requireUser: requireUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/llm", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/llm")>()), complete: completeMock }));

const usage = { input: 500, cached: 0, cacheWrite: 0, output: 300 };
function answer(input: Record<string, unknown>): LlmResult {
  return { text: null, toolCalls: [{ id: "1", name: "fill_profile", input }], usage, finish: "tool" };
}

beforeEach(async () => {
  completeMock.mockReset();
  process.env.ANTHROPIC_API_KEY ||= "test-key";
  await dropTestOrg(PNID);
  organizationId = (await createTestOrg(PNID)).id;
  requireUserMock.mockResolvedValue({ organization: { id: organizationId }, role: "OWNER" });
});

afterAll(async () => {
  await dropTestOrg(PNID);
  await prisma.$disconnect();
});

test("ответ модели разбирается из вызова инструмента; пустые поля — плохой ответ", () => {
  const parsed = parseGeneratorResult(
    answer({
      companyProfile: " Кофейня «Зерно» ",
      rules: "Скидок не обещать.",
      orderFields: [{ label: "Что заказал", type: "TEXT" }, { label: "Размер", type: "SELECT", options: ["S"] }, { label: "", type: "TEXT" }, { label: "Х", type: "BOGUS" }],
    }),
  );
  expect(parsed.companyProfile).toBe("Кофейня «Зерно»");
  // Список с одним вариантом, пустое название и чужой тип отброшены.
  expect(parsed.orderFields).toEqual([{ label: "Что заказал", type: "TEXT", options: null, required: false }]);

  expect(() => parseGeneratorResult(answer({ companyProfile: "", rules: "x" }))).toThrow(/Не получилось/);
  expect(() => parseGeneratorResult({ ...answer({}), toolCalls: [] })).toThrow(/Не получилось/);
  expect(sanitizeOrderFields("не массив")).toEqual([]);
});

test("генератор ничего не сохраняет сам и пишет расход", async () => {
  const { generateProfileAction } = await import("@/app/(app)/ai-bot/actions");
  completeMock.mockResolvedValue(answer({ companyProfile: "Анкета", rules: "Правила", orderFields: [] }));

  const result = await generateProfileAction(DESCRIPTION);

  expect(result).toMatchObject({ companyProfile: "Анкета", rules: "Правила", left: GENERATOR_LIMIT - 1 });
  expect((await getBot(organizationId)).exists).toBe(false);
  const row = await prisma.aiUsage.findFirstOrThrow({ where: { organizationId, kind: "GENERATOR" } });
  expect(row).toMatchObject({ inputTokens: 500, outputTokens: 300, error: null });
});

test("без подписки, с коротким описанием и после лимита — отказ без вызова модели", async () => {
  const { generateProfileAction } = await import("@/app/(app)/ai-bot/actions");

  expect(await generateProfileAction("кофе")).toMatchObject({ error: expect.stringContaining("подробнее") });

  await getSubscription(organizationId);
  await prisma.subscription.update({ where: { organizationId }, data: { status: "EXPIRED" } });
  expect(await generateProfileAction(DESCRIPTION)).toMatchObject({ error: expect.stringContaining("Подписка") });

  await prisma.subscription.update({ where: { organizationId }, data: { status: "TRIAL", trialEndsAt: new Date(Date.now() + 86_400_000) } });
  await prisma.aiUsage.createMany({ data: Array.from({ length: GENERATOR_LIMIT }, () => ({ organizationId, kind: "GENERATOR" as const })) });
  expect(await generateProfileAction(DESCRIPTION)).toMatchObject({ error: expect.stringContaining("закончились") });

  expect(completeMock).not.toHaveBeenCalled();
});

test("сбой провайдера и негодный ответ пишутся в журнал по-разному", async () => {
  const { generateProfileAction } = await import("@/app/(app)/ai-bot/actions");

  completeMock.mockRejectedValueOnce(new LlmError("unavailable", false, 503));
  expect(await generateProfileAction(DESCRIPTION)).toMatchObject({ error: "Нейросеть временно недоступна." });

  completeMock.mockResolvedValueOnce(answer({ companyProfile: "", rules: "" }));
  expect(await generateProfileAction(DESCRIPTION)).toMatchObject({ error: expect.stringContaining("Не получилось") });

  const rows = await prisma.aiUsage.findMany({ where: { organizationId, kind: "GENERATOR" }, orderBy: { createdAt: "asc" } });
  expect(rows.map((r) => r.error)).toEqual(["Нейросеть временно недоступна.", expect.stringContaining("Не получилось")]);
});

test("поля от генератора применяются при сохранении, чужие настроенные не затираются", async () => {
  const { saveBotAction } = await import("@/app/(app)/ai-bot/actions");
  const data = new FormData();
  data.set("companyProfile", "Кофейня");
  data.set("applyOrderFields", "on");
  data.set("generatedFields", JSON.stringify([{ label: "Напиток", type: "TEXT" }, { label: "Плохое", type: "SELECT", options: [] }]));

  await saveBotAction(null, data);
  const { getOrderFields } = await import("@/lib/orders-store");
  expect((await getOrderFields(organizationId)).map((f) => f.label)).toEqual(["Напиток"]);
});
