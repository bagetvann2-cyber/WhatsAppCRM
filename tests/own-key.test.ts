import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { assistantBanner } from "@/lib/ai-bot";
import { getAssistantBanner, getBot, loadOwnKey, runAiBot, saveBot } from "@/lib/ai-bot-store";
import { saveIncomingMessage } from "@/lib/ingest";
import { LlmError } from "@/lib/llm/errors";
import { guessProvider, normalizeKey } from "@/lib/llm/verify-key";
import { createTestOrg, dropTestOrg } from "./helpers";

const PNID = "PNID-OWNKEY";
const waId = "77011110077";
let organizationId: string;

const askMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const probeMock = vi.hoisted(() => vi.fn());
const requireUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai-client", () => ({ askBot: askMock, HANDOFF_TOOL: { name: "handoff_to_operator" } }));
vi.mock("@/lib/session", () => ({ requireUser: requireUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/llm/verify-key", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm/verify-key")>()),
  probeKey: probeMock,
}));
vi.mock("@/lib/channels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/channels")>()),
  sendChannelText: sendMock,
}));

const answer = { answer: "Ответ", handoff: false, handoffReason: null, orderFields: null, inputTokens: 10, cachedTokens: 0, outputTokens: 5 };
const KEY = "sk-proj-secretsecret1234";
const probeOk = { ok: true, usage: { input: 20, cached: 0, cacheWrite: 0, output: 5 } };

beforeEach(async () => {
  askMock.mockReset();
  probeMock.mockReset();
  sendMock.mockReset();
  let sent = 0;
  sendMock.mockImplementation(async () => ({ externalMessageId: `${PNID}.OUT.${++sent}` }));
  await dropTestOrg(PNID);
  organizationId = (await createTestOrg(PNID)).id;
  requireUserMock.mockResolvedValue({ organization: { id: organizationId }, role: "OWNER" });
  await saveBot(organizationId, { enabled: true, model: "claude-sonnet-5", companyProfile: "Анкета", rules: null });
});

afterAll(async () => {
  await dropTestOrg(PNID);
  await prisma.$disconnect();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

async function incoming(text: string, id: string) {
  const result = await saveIncomingMessage({
    channelType: "WHATSAPP",
    externalMessageId: `${PNID}.${id}`,
    from: waId,
    profileName: "Клиент",
    channelExternalId: PNID,
    type: "text",
    text,
    media: null,
    timestamp: new Date(),
  });
  if (!result.stored) throw new Error("сообщение должно сохраниться");
  return result.conversationId;
}

async function withKey() {
  const { saveApiKeyAction } = await import("@/app/(app)/ai-bot/actions");
  probeMock.mockResolvedValue(probeOk);
  await saveApiKeyAction(null, form({ provider: "OPENAI", apiKey: KEY }));
}

const botRow = () => prisma.aiBot.findUniqueOrThrow({ where: { organizationId } });

test("ключ хранится зашифрованным и не выходит из getBot", async () => {
  const { saveApiKeyAction } = await import("@/app/(app)/ai-bot/actions");
  probeMock.mockResolvedValue(probeOk);

  const result = await saveApiKeyAction(null, form({ provider: "OPENAI", apiKey: ` "${KEY}" ` }));
  expect(result).toMatchObject({ ok: expect.stringContaining("сохранён") });

  const row = await botRow();
  expect(row.apiKeyEncrypted).not.toContain("secretsecret");
  expect(row).toMatchObject({ provider: "OPENAI", apiKeyProvider: "OPENAI", apiKeyHint: "1234", model: "gpt-5.6-luna", apiKeyError: null });
  expect(await loadOwnKey(organizationId)).toEqual({ provider: "OPENAI", apiKey: KEY });

  const state = await getBot(organizationId);
  expect(JSON.stringify(state)).not.toContain("secretsecret");
  expect(state.ownKey).toMatchObject({ provider: "OPENAI", hint: "1234" });
  expect(await prisma.aiUsage.count({ where: { organizationId, kind: "PROBE" } })).toBe(1);
});

test("неверный ключ и модель без инструментов не сохраняются", async () => {
  const { saveApiKeyAction } = await import("@/app/(app)/ai-bot/actions");

  probeMock.mockResolvedValueOnce({ ok: false, code: "auth", message: "Ключ недействителен." });
  expect(await saveApiKeyAction(null, form({ provider: "OPENAI", apiKey: KEY }))).toEqual({ error: "Ключ недействителен." });

  probeMock.mockResolvedValueOnce({ ok: false, code: "no-tools", message: "Эта модель не умеет передавать диалог оператору: выберите другую." });
  const noTools = await saveApiKeyAction(null, form({ provider: "OPENROUTER", apiKey: "sk-or-abcdefgh1234", model: "some/model" }));
  expect(noTools).toMatchObject({ error: expect.stringContaining("передавать") });

  expect((await botRow()).apiKeyEncrypted).toBeNull();
});

test("ключ другой нейросети: вопрос вместо отказа, проверка только после «всё равно»", async () => {
  const { saveApiKeyAction } = await import("@/app/(app)/ai-bot/actions");
  probeMock.mockResolvedValue(probeOk);

  expect(await saveApiKeyAction(null, form({ provider: "GEMINI", apiKey: KEY }))).toMatchObject({ mismatch: expect.stringContaining("ChatGPT") });
  expect(probeMock).not.toHaveBeenCalled();

  expect(await saveApiKeyAction(null, form({ provider: "GEMINI", apiKey: KEY, force: "on" }))).toMatchObject({ ok: expect.any(String) });
  expect(guessProvider("sk-ant-x")).toBe("ANTHROPIC");
  expect(normalizeKey("  'abc'\n")).toBe("abc");
});

test("OpenRouter без названия модели не сохраняется", async () => {
  const { saveApiKeyAction } = await import("@/app/(app)/ai-bot/actions");
  expect(await saveApiKeyAction(null, form({ provider: "OPENROUTER", apiKey: "sk-or-abcdefgh1234" }))).toMatchObject({ error: expect.stringContaining("модели") });
  expect(probeMock).not.toHaveBeenCalled();
});

test("со своим ключом бот ходит с ним и не упирается в наш пакет", async () => {
  await withKey();
  await prisma.aiBot.update({ where: { organizationId }, data: { answersUsed: 9999 } });
  askMock.mockResolvedValue(answer);

  const conversationId = await incoming("Сколько стоит?", "IN.1");
  expect(await runAiBot({ organizationId, conversationId, to: waId })).toMatchObject({ status: "answered" });

  expect(askMock).toHaveBeenCalledWith(expect.objectContaining({ provider: "OPENAI", apiKey: KEY }));
  expect((await botRow()).answersUsed).toBe(9999);
  expect((await prisma.aiReply.findFirstOrThrow({ where: { organizationId } })).ownKey).toBe(true);
});

test("ошибка ключа клиента пишет apiKeyError и не роняет обработку; первый успех снимает её", async () => {
  await withKey();
  askMock.mockRejectedValueOnce(new LlmError("auth", true, 401));

  const conversationId = await incoming("Вопрос", "IN.1");
  expect(await runAiBot({ organizationId, conversationId, to: waId })).toMatchObject({ status: "failed" });
  expect((await botRow()).apiKeyError).toBe("auth");
  expect(await getAssistantBanner(organizationId)).toMatchObject({
    text: expect.stringContaining("ключ ChatGPT не работает"),
    action: { href: "/ai-bot" },
  });

  askMock.mockResolvedValue(answer);
  await incoming("Ну?", "IN.2");
  expect(await runAiBot({ organizationId, conversationId, to: waId })).toMatchObject({ status: "answered" });
  expect((await botRow()).apiKeyError).toBeNull();
});

test("разовый лимит частоты ключ не портит; ключ, который не расшифровался, требует ввести заново", async () => {
  await withKey();
  askMock.mockRejectedValueOnce(new LlmError("rate_limit", true, 429));
  const conversationId = await incoming("Вопрос", "IN.1");
  await runAiBot({ organizationId, conversationId, to: waId });
  expect((await botRow()).apiKeyError).toBeNull();

  await prisma.aiBot.update({ where: { organizationId }, data: { apiKeyEncrypted: "битый" } });
  await incoming("Ещё вопрос", "IN.2");
  expect(await runAiBot({ organizationId, conversationId, to: waId })).toMatchObject({ status: "failed" });
  expect((await botRow()).apiKeyError).toBe("decrypt");
  expect((await getAssistantBanner(organizationId))?.text).toContain("заново ввести");
});

test("сохранение формы бота не трогает модель своего ключа; удаление ключа возвращает на наш", async () => {
  await withKey();
  await saveBot(organizationId, { enabled: true, model: "claude-haiku-4-5", companyProfile: "Анкета", rules: null });
  expect((await botRow()).model).toBe("gpt-5.6-luna");

  const { removeApiKeyAction } = await import("@/app/(app)/ai-bot/actions");
  await removeApiKeyAction();
  expect(await botRow()).toMatchObject({ apiKeyEncrypted: null, apiKeyHint: null, model: null, provider: "OPENAI" });
});

test("баннер на своём ключе: пакет не считается, ошибка ключа называет причину", () => {
  const settings = { enabled: true, model: "m", companyProfile: "А", rules: null, answersLimit: 0, answersUsed: 0, usesOwnKey: true };
  const base = { settings, subscriptionActive: true, hasChannel: true, lastOutcome: null, resetsAt: new Date() };
  expect(assistantBanner(base)).toBeNull();
  expect(assistantBanner({ ...base, keyError: { code: "quota", providerLabel: "ChatGPT" } })?.text).toContain("закончились деньги");
  expect(assistantBanner({ ...base, keyError: { code: "model", providerLabel: "Gemini" } })?.text).toContain("модель больше недоступна");
});
