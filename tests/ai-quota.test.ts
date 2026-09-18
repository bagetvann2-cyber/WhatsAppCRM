import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DEFAULT_STUB, DEFAULT_STUB_KZ, OUTCOMES, pickStub } from "@/lib/ai-bot";
import {
  finishUsage,
  getBot,
  refundAnswer,
  reserveAnswer,
  reserveTestUsage,
  runAiBot,
  saveBot,
} from "@/lib/ai-bot-store";
import { alertPlatformError, resetAlerts } from "@/lib/alerts";
import { createSubscriptionInvoice, getSubscription, markInvoicePaid } from "@/lib/billing-store";
import { saveIncomingMessage } from "@/lib/ingest";
import { LlmError } from "@/lib/llm/errors";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-QUOTA";
const waId = "77011110099";
let organizationId: string;

const askMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const mailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai-client", () => ({ askBot: askMock }));
vi.mock("@/lib/email", () => ({ sendEmail: mailMock }));
vi.mock("@/lib/channels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/channels")>()),
  sendChannelText: sendMock,
}));

const answer = { answer: "Ответ", handoff: false, handoffReason: null, orderFields: null, inputTokens: 10, cachedTokens: 0, outputTokens: 5 };

beforeEach(async () => {
  askMock.mockReset();
  sendMock.mockReset();
  mailMock.mockReset();
  resetAlerts();
  let sent = 0;
  sendMock.mockImplementation(async () => ({ externalMessageId: `${phoneNumberId}.OUT.${++sent}` }));

  await dropTestOrg(phoneNumberId);
  organizationId = (await createTestOrg(phoneNumberId)).id;
  await saveBot(organizationId, { enabled: true, model: "claude-sonnet-5", companyProfile: "Анкета", rules: null });
});

afterEach(() => vi.unstubAllEnvs());

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

async function incoming(text: string, id: string) {
  const result = await saveIncomingMessage({
    channelType: "WHATSAPP",
    externalMessageId: `${phoneNumberId}.${id}`,
    from: waId,
    profileName: "Клиент",
    channelExternalId: phoneNumberId,
    type: "text",
    text,
    media: null,
    timestamp: new Date(),
  });
  if (!result.stored) {
    throw new Error("сообщение должно сохраниться");
  }
  return result.conversationId;
}

const bot = () => prisma.aiBot.findUniqueOrThrow({ where: { organizationId } });

test("резерв: десять одновременных запросов при пакете в три занимают ровно три", async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => reserveAnswer(organizationId, 3)));

  expect(results.filter(Boolean)).toHaveLength(3);
  expect((await bot()).answersUsed).toBe(3);
});

test("резерв на границе месяца: счётчик сбрасывается один раз, а не каждым из воркеров", async () => {
  const twoMonthsAgo = new Date(Date.now() - 62 * 24 * 3600 * 1000);
  await prisma.aiBot.update({ where: { organizationId }, data: { answersUsed: 5, answersPeriodStart: twoMonthsAgo } });

  const results = await Promise.all([reserveAnswer(organizationId, 5), reserveAnswer(organizationId, 5)]);

  expect(results.filter(Boolean)).toHaveLength(2);
  const after = await bot();
  expect(after.answersUsed).toBe(2);
  expect(after.answersPeriodStart.getTime()).toBeGreaterThan(Date.now() - 60_000);
});

test("возврат работает только в том же периоде и не уходит ниже нуля", async () => {
  const period = await reserveAnswer(organizationId, 5);
  expect(period).not.toBeNull();

  await refundAnswer(organizationId, period!);
  expect((await bot()).answersUsed).toBe(0);

  await refundAnswer(organizationId, period!);
  expect((await bot()).answersUsed).toBe(0);

  // Период сменился (например, оплатили подписку): чужой возврат ничего не трогает.
  const second = await reserveAnswer(organizationId, 5);
  await prisma.aiBot.update({ where: { organizationId }, data: { answersPeriodStart: new Date(Date.now() - 1000) } });
  await refundAnswer(organizationId, second!);
  expect((await bot()).answersUsed).toBe(1);
});

test("оплата подписки даёт новый пакет: счётчик обнуляется, лимит берётся из тарифа", async () => {
  await prisma.aiBot.update({ where: { organizationId }, data: { answersUsed: 50 } });
  expect((await getBot(organizationId)).answersLimit).toBe(50);

  const invoice = await createSubscriptionInvoice({ organizationId, planCode: "business", months: 1, operators: 3, method: "bank" });
  await markInvoicePaid(organizationId, invoice.id);

  const state = await getBot(organizationId);
  expect(state.answersUsed).toBe(0);
  expect(state.answersLimit).toBe(2000);
});

test("причина устранена — бот снова отвечает в том же диалоге: заглушка не отключает его навсегда", async () => {
  await prisma.aiBot.update({ where: { organizationId }, data: { answersUsed: 50 } });
  askMock.mockResolvedValue(answer);

  const conversationId = await incoming("Вопрос про цену", "IN.1");
  expect(await runAiBot({ organizationId, conversationId, to: waId })).toEqual({ status: "skipped", reason: "quota" });
  expect(sendMock).toHaveBeenLastCalledWith(expect.objectContaining({ text: DEFAULT_STUB }));

  // Клиент докупил пакет.
  await prisma.aiBot.update({ where: { organizationId }, data: { answersUsed: 0 } });
  await incoming("Ну так что?", "IN.2");

  expect(await runAiBot({ organizationId, conversationId, to: waId })).toMatchObject({ status: "answered" });
  expect(askMock).toHaveBeenCalledTimes(1);
});

test("повторная заглушка в тот же диалог не уходит, пока клиент ждёт", async () => {
  await prisma.aiBot.update({ where: { organizationId }, data: { answersUsed: 50 } });

  const conversationId = await incoming("Первый вопрос", "IN.1");
  await runAiBot({ organizationId, conversationId, to: waId });
  await incoming("Второй вопрос", "IN.2");
  await runAiBot({ organizationId, conversationId, to: waId });

  expect(sendMock).toHaveBeenCalledTimes(1);
  expect(await prisma.aiReply.count({ where: { organizationId, stub: true } })).toBe(1);
});

test("неоплаченная подписка: бот не обращается к нейросети, клиенту уходит заглушка", async () => {
  await getSubscription(organizationId);
  await prisma.subscription.update({ where: { organizationId }, data: { status: "EXPIRED" } });

  const conversationId = await incoming("Вопрос", "IN.1");
  const run = await runAiBot({ organizationId, conversationId, to: waId });

  expect(run).toEqual({ status: "skipped", reason: "subscription" });
  expect(askMock).not.toHaveBeenCalled();
  expect(sendMock).toHaveBeenCalledTimes(1);
  expect((await prisma.aiReply.findFirstOrThrow({ where: { organizationId } })).outcome).toBe("subscription");
});

test("заглушка на языке клиента: казахские буквы — казахский текст, свой текст компании важнее", async () => {
  expect(pickStub({}, "Сәлем, бағасы қанша?")).toBe(DEFAULT_STUB_KZ);
  expect(pickStub({}, "Сколько стоит?")).toBe(DEFAULT_STUB);
  expect(pickStub({ stubText: "Ждите.", stubTextKz: "Күтіңіз." }, "қалай")).toBe("Күтіңіз.");
  expect(pickStub({ stubText: "  ", stubTextKz: null }, "привет")).toBe(DEFAULT_STUB);
});

test("модель передала диалог человеку и ничего не написала — клиент не остаётся в тишине", async () => {
  askMock.mockResolvedValue({ ...answer, answer: null, handoff: true, handoffReason: "жалоба" });

  const conversationId = await incoming("Верните деньги", "IN.1");
  const run = await runAiBot({ organizationId, conversationId, to: waId });

  expect(run).toEqual({ status: "handoff", reason: "жалоба" });
  expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ text: DEFAULT_STUB }));
  // Это передача самой модели, поэтому диалог закрыт для бота.
  expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).handedOffAt).not.toBeNull();
});

test("сбой отправки заглушки не роняет обработку и не повторяется шумом", async () => {
  await prisma.aiBot.update({ where: { organizationId }, data: { answersUsed: 50 } });
  sendMock.mockRejectedValue(new Error("сеть"));

  const conversationId = await incoming("Вопрос", "IN.1");

  await expect(runAiBot({ organizationId, conversationId, to: waId })).resolves.toEqual({ status: "skipped", reason: "quota" });
  expect(await prisma.aiReply.count({ where: { organizationId, stub: true } })).toBe(0);
});

test("ошибка нашего ключа: письмо владельцу платформы не чаще раза в час на провайдера и код", async () => {
  vi.stubEnv("PLATFORM_ALERT_EMAIL", "owner@example.kz");
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  await alertPlatformError("OPENAI", new LlmError("quota", false, 429, "insufficient_quota"));
  await alertPlatformError("OPENAI", new LlmError("quota", false, 429));
  await alertPlatformError("GEMINI", new LlmError("auth", false, 400));
  // Ключ клиента и временные сбои — не наша забота и не повод для письма.
  await alertPlatformError("OPENAI", new LlmError("auth", true, 401));
  await alertPlatformError("OPENAI", new LlmError("unavailable", false, 503));

  expect(mailMock).toHaveBeenCalledTimes(2);
  expect(mailMock.mock.calls[0][0]).toBe("owner@example.kz");
  vi.restoreAllMocks();
});

test("без адреса в env письма нет, ошибка всё равно попадает в лог", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

  await alertPlatformError("OPENAI", new LlmError("quota", false, 429));

  expect(mailMock).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});

test("тест-чат: суточный лимит, до пробного периода — общий, запись создаётся до вызова", async () => {
  const ids: (string | null)[] = [];
  for (let i = 0; i < 3; i++) {
    ids.push(await reserveTestUsage(organizationId, 2, false, "ANTHROPIC", "claude-sonnet-5"));
  }
  expect(ids.map(Boolean)).toEqual([true, true, false]);

  await finishUsage(ids[0]!, { inputTokens: 100, outputTokens: 20 });
  expect((await prisma.aiUsage.findUniqueOrThrow({ where: { id: ids[0]! } })).outputTokens).toBe(20);

  // Вчерашние проверки суточный лимит не занимают, а общий считает все.
  await prisma.aiUsage.updateMany({ where: { organizationId }, data: { createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) } });
  expect(await reserveTestUsage(organizationId, 2, false, "ANTHROPIC", "claude-sonnet-5")).not.toBeNull();
  expect(await reserveTestUsage(organizationId, 2, true, "ANTHROPIC", "claude-sonnet-5")).toBeNull();
});

test("словарь исходов: у каждой причины молчания есть название, а заглушка — у временных сбоев", () => {
  for (const [code, info] of Object.entries(OUTCOMES)) {
    expect(info.label, code).toBeTruthy();
  }
  for (const silent of ["disabled", "no-profile", "handed-off", "window-closed", "answered"] as const) {
    expect(OUTCOMES[silent].sendsStub, silent).toBe(false);
  }
  for (const noisy of ["quota", "subscription", "llm-timeout", "llm-unavailable", "llm-quota"] as const) {
    expect(OUTCOMES[noisy].sendsStub, noisy).toBe(true);
  }
});
